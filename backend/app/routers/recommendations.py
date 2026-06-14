import json
import httpx
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from openai import OpenAI
from app.config import settings
from app import models, auth
from app.database import get_db, SessionLocal

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

TMDB_BASE = "https://api.themoviedb.org/3"
CACHE_TTL_HOURS = 2

_http = httpx.Client(limits=httpx.Limits(max_connections=30, max_keepalive_connections=20), timeout=10)


def tmdb_get(path: str, params: dict = {}) -> dict:
    p = {**params, "api_key": settings.tmdb_api_key}
    r = _http.get(f"{TMDB_BASE}{path}", params=p)
    r.raise_for_status()
    return r.json()


def _search_tmdb(title: str, media_type: str) -> dict | None:
    data = tmdb_get("/search/multi", {"query": title, "language": "en-US"})
    for result in data.get("results", []):
        if result.get("media_type") == media_type:
            return result
    return None


def _get_availability(tmdb_id: int, media_type: str, user: models.User) -> list[str]:
    user_provider_ids = {svc.tmdb_provider_id: svc.provider_name for svc in user.streaming_services}
    if not user_provider_ids:
        return []
    providers_data = tmdb_get(f"/{media_type}/{tmdb_id}/watch/providers")
    user_regions = {svc.region_override or user.default_region for svc in user.streaming_services}
    available_on = set()
    for region in user_regions:
        for p in providers_data.get("results", {}).get(region, {}).get("flatrate", []):
            if p["provider_id"] in user_provider_ids:
                available_on.add(user_provider_ids[p["provider_id"]])
    return list(available_on)


def _build_prompt(user: models.User, excluded: list[str] = []) -> str:
    watched  = [i for i in user.watchlist if i.status == "watched"]
    watching = [i for i in user.watchlist if i.status == "watching"]
    want     = [i for i in user.watchlist if i.status == "want_to_watch"]

    def fmt(items, limit):
        return [f"{i.title} ({i.media_type})" for i in items[:limit]]

    sections = []
    if w := fmt(watched, 20):
        sections.append("Watched (strong taste signal):\n" + "\n".join(f"- {t}" for t in w))
    if c := fmt(watching, 10):
        sections.append("Currently watching:\n" + "\n".join(f"- {t}" for t in c))
    if q := fmt(want, 20):
        sections.append("Want to watch:\n" + "\n".join(f"- {t}" for t in q))

    services = ", ".join(svc.provider_name for svc in user.streaming_services)
    exclude_clause = (
        f"\n\nDo NOT recommend: {', '.join(excluded)}" if excluded else ""
    )

    return f"""You are a personalized entertainment recommendation engine.

{chr(10).join(sections)}

Streaming services: {services}

Recommend exactly 24 titles available on their services that match their taste. Mix movies and TV shows.{exclude_clause}

Respond ONLY with a valid JSON array, no markdown:
[{{"title": "Exact Title", "media_type": "movie", "reason": "One sentence why."}}]"""


def _run_generation(user: models.User) -> list[dict]:
    """Call OpenAI (streaming) + TMDB in parallel. Returns list of recommendation dicts."""
    def process(suggestion: dict) -> dict | None:
        try:
            tmdb_result = _search_tmdb(suggestion.get("title", ""), suggestion.get("media_type", "movie"))
            if not tmdb_result:
                return None
            tmdb_id = tmdb_result["id"]
            media_type = suggestion.get("media_type", "movie")
            available_on = _get_availability(tmdb_id, media_type, user)
            if not available_on:
                return None
            return {
                "tmdb_id": tmdb_id,
                "media_type": media_type,
                "title": tmdb_result.get("title") or tmdb_result.get("name", ""),
                "poster_path": tmdb_result.get("poster_path"),
                "overview": tmdb_result.get("overview"),
                "vote_average": tmdb_result.get("vote_average"),
                "reason": suggestion.get("reason", ""),
                "available_on": available_on,
            }
        except Exception:
            return None

    client = OpenAI(api_key=settings.openai_api_key)
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": _build_prompt(user)}],
        temperature=0.8,
        max_tokens=2500,
        stream=True,
    )

    pool = ThreadPoolExecutor(max_workers=24)
    futures = []
    content = ""
    brace_depth = 0
    obj_start = -1

    try:
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            for char in delta:
                pos = len(content)
                content += char
                if char == "{":
                    if brace_depth == 0:
                        obj_start = pos
                    brace_depth += 1
                elif char == "}":
                    brace_depth -= 1
                    if brace_depth == 0 and obj_start >= 0:
                        try:
                            obj = json.loads(content[obj_start: pos + 1])
                            futures.append(pool.submit(process, obj))
                        except json.JSONDecodeError:
                            pass
                        obj_start = -1
    finally:
        pool.shutdown(wait=True)

    return [r for f in futures if (r := f.result()) is not None]


def _refresh_cache(user_id: int) -> None:
    """Background task: regenerate cache using a fresh DB session."""
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            return
        results = _run_generation(user)
        cache = db.query(models.RecommendationCache).filter_by(user_id=user_id).first()
        if cache is None:
            cache = models.RecommendationCache(user_id=user_id)
            db.add(cache)
        cache.items = json.dumps(results)
        cache.generated_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.get("")
def get_recommendations(
    exclude_titles: str = "",
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.watchlist:
        raise HTTPException(400, "Add items to your watchlist first to get recommendations")
    if not current_user.streaming_services:
        raise HTTPException(400, "Add streaming services first to get recommendations")

    # Load-more path: caller passes already-shown titles, generate a fresh batch on demand
    if exclude_titles:
        excluded = [t.strip() for t in exclude_titles.split(",") if t.strip()]
        prompt = _build_prompt(current_user, excluded)

        def process_more(suggestion: dict) -> dict | None:
            try:
                tmdb_result = _search_tmdb(suggestion.get("title", ""), suggestion.get("media_type", "movie"))
                if not tmdb_result:
                    return None
                tmdb_id = tmdb_result["id"]
                media_type = suggestion.get("media_type", "movie")
                available_on = _get_availability(tmdb_id, media_type, current_user)
                if not available_on:
                    return None
                return {
                    "tmdb_id": tmdb_id, "media_type": media_type,
                    "title": tmdb_result.get("title") or tmdb_result.get("name", ""),
                    "poster_path": tmdb_result.get("poster_path"),
                    "overview": tmdb_result.get("overview"),
                    "vote_average": tmdb_result.get("vote_average"),
                    "reason": suggestion.get("reason", ""),
                    "available_on": available_on,
                }
            except Exception:
                return None

        client = OpenAI(api_key=settings.openai_api_key)
        stream = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8, max_tokens=2500, stream=True,
        )
        pool = ThreadPoolExecutor(max_workers=24)
        futures = []
        content = ""
        brace_depth = 0
        obj_start = -1
        try:
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                for char in delta:
                    pos = len(content)
                    content += char
                    if char == "{":
                        if brace_depth == 0:
                            obj_start = pos
                        brace_depth += 1
                    elif char == "}":
                        brace_depth -= 1
                        if brace_depth == 0 and obj_start >= 0:
                            try:
                                obj = json.loads(content[obj_start: pos + 1])
                                futures.append(pool.submit(process_more, obj))
                            except json.JSONDecodeError:
                                pass
                            obj_start = -1
        finally:
            pool.shutdown(wait=True)
        return [r for f in futures if (r := f.result()) is not None]

    # Initial load: serve from cache
    cache = db.query(models.RecommendationCache).filter_by(user_id=current_user.id).first()

    if cache:
        stale = datetime.utcnow() - cache.generated_at > timedelta(hours=CACHE_TTL_HOURS)
        if stale:
            background_tasks.add_task(_refresh_cache, current_user.id)
        return {"items": json.loads(cache.items), "generated_at": cache.generated_at.isoformat()}

    # No cache yet — generate synchronously (first-ever visit)
    results = _run_generation(current_user)
    cache = models.RecommendationCache(
        user_id=current_user.id,
        items=json.dumps(results),
        generated_at=datetime.utcnow(),
    )
    db.add(cache)
    db.commit()
    return {"items": results, "generated_at": cache.generated_at.isoformat()}


@router.post("/refresh")
def refresh_recommendations(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Force-regenerate recommendations. Rate-limited to once per 2 hours."""
    cache = db.query(models.RecommendationCache).filter_by(user_id=current_user.id).first()
    if cache:
        age = datetime.utcnow() - cache.generated_at
        if age < timedelta(hours=CACHE_TTL_HOURS):
            remaining = int((timedelta(hours=CACHE_TTL_HOURS) - age).total_seconds() / 60)
            raise HTTPException(429, f"Refresh available in {remaining} minutes")

    results = _run_generation(current_user)
    if cache is None:
        cache = models.RecommendationCache(user_id=current_user.id)
        db.add(cache)
    cache.items = json.dumps(results)
    cache.generated_at = datetime.utcnow()
    db.commit()
    return {"items": results, "generated_at": cache.generated_at.isoformat()}
