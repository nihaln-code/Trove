import json
import random
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from openai import OpenAI
from app.config import settings
from app import models, auth
from app.database import get_db, SessionLocal
import httpx

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

TMDB_BASE = "https://api.themoviedb.org/3"
CACHE_TTL_MINUTES = 30

_http = httpx.Client(limits=httpx.Limits(max_connections=50, max_keepalive_connections=30), timeout=10)
_openai = OpenAI(api_key=settings.openai_api_key)

_genre_cache: dict[str, dict] = {}


def tmdb_get(path: str, params: dict = {}) -> dict:
    p = {**params, "api_key": settings.tmdb_api_key}
    r = _http.get(f"{TMDB_BASE}{path}", params=p)
    r.raise_for_status()
    return r.json()


def _get_genre_map() -> dict[int, str]:
    if "merged" not in _genre_cache:
        movies = tmdb_get("/genre/movie/list", {"language": "en-US"})
        tv = tmdb_get("/genre/tv/list", {"language": "en-US"})
        merged = {}
        for g in movies.get("genres", []) + tv.get("genres", []):
            merged[g["id"]] = g["name"]
        _genre_cache["merged"] = merged
    return _genre_cache["merged"]


def _build_provider_region_map(user: models.User) -> dict[str, list[int]]:
    region_map: dict[str, list[int]] = defaultdict(list)
    for svc in user.streaming_services:
        region = svc.region_override or user.default_region
        region_map[region].append(svc.tmdb_provider_id)
    return region_map


def _get_availability(tmdb_id: int, media_type: str, user: models.User) -> list[str]:
    user_provider_ids = {svc.tmdb_provider_id: svc.provider_name for svc in user.streaming_services}
    if not user_provider_ids:
        return []
    try:
        data = tmdb_get(f"/{media_type}/{tmdb_id}/watch/providers")
    except Exception:
        return []
    user_regions = {svc.region_override or user.default_region for svc in user.streaming_services}
    available_on = set()
    for region in user_regions:
        for p in data.get("results", {}).get(region, {}).get("flatrate", []):
            if p["provider_id"] in user_provider_ids:
                available_on.add(user_provider_ids[p["provider_id"]])
    return list(available_on)


def _build_taste_profile(user: models.User) -> dict:
    WEIGHTS = {
        ("watched", 1): 3.0,
        ("watching", 1): 2.5,
        ("watched", None): 1.0,
        ("watching", None): 0.5,
        ("want_to_watch", None): 0.25,
        ("watched", -1): -2.0,
        ("watching", -1): -1.5,
        ("want_to_watch", -1): -1.0,
    }

    genre_scores: dict[int, float] = defaultdict(float)
    cast_scores: dict[str, float] = defaultdict(float)
    director_scores: dict[str, float] = defaultdict(float)

    for item in user.watchlist:
        if not item.metadata_json:
            continue
        try:
            meta = json.loads(item.metadata_json)
        except (json.JSONDecodeError, TypeError):
            continue
        weight = WEIGHTS.get((item.status.value, item.rating), 0.0)
        if weight == 0.0:
            continue
        for gid in meta.get("genre_ids", []):
            genre_scores[gid] += weight
        if weight > 0:
            for name in meta.get("cast", []):
                cast_scores[name] += weight * 0.4
            director = meta.get("director")
            if director:
                director_scores[director] += weight

    top_genres = [
        gid for gid, s in sorted(genre_scores.items(), key=lambda x: x[1], reverse=True)
        if s > 0
    ]
    avoided_genres = [gid for gid, s in genre_scores.items() if s < 0]
    top_cast = [n for n, _ in sorted(cast_scores.items(), key=lambda x: x[1], reverse=True)[:15]]
    top_directors = [n for n, _ in sorted(director_scores.items(), key=lambda x: x[1], reverse=True)[:8]]

    return {
        "top_genres": top_genres[:6],
        "avoided_genres": avoided_genres,
        "top_cast": top_cast,
        "top_directors": top_directors,
        "genre_scores": dict(genre_scores),
    }


def _score_candidate(candidate: dict, profile: dict) -> float:
    score = 0.0
    for gid in candidate.get("genre_ids", []):
        score += profile["genre_scores"].get(gid, 0.0)
    va = candidate.get("vote_average") or 0
    if va < 5.5:
        score -= 3.0
    elif va >= 7.5:
        score += 0.5
    score += min(candidate.get("popularity", 0), 200) * 0.002
    return score


def _build_reason(candidate: dict, profile: dict, genre_map: dict) -> str:
    matched = [
        genre_map[gid] for gid in candidate.get("genre_ids", [])
        if profile["genre_scores"].get(gid, 0) > 0 and gid in genre_map
    ]
    if matched:
        return f"Matches your taste for {', '.join(matched[:2])}"
    return "Trending on your services"


def _run_generation(user: models.User, page: int = 1) -> list[dict]:
    profile = _build_taste_profile(user)
    genre_map = _get_genre_map()
    region_map = _build_provider_region_map(user)
    watchlist_ids = {(item.tmdb_id, item.media_type.value) for item in user.watchlist}

    if not profile["top_genres"]:
        return _run_tmdb_fallback(user, page)

    def fetch_discover(args: tuple) -> list[dict]:
        genre_id, media_type, region, provider_ids = args
        try:
            params: dict = {
                "watch_region": region,
                "with_watch_providers": "|".join(str(p) for p in provider_ids),
                "with_genres": genre_id,
                "page": page,
                "language": "en-US",
                "sort_by": "popularity.desc",
                "vote_count.gte": 50,
            }
            if profile["avoided_genres"]:
                params["without_genres"] = ",".join(str(g) for g in profile["avoided_genres"])
            data = tmdb_get(f"/discover/{media_type}", params)
            results = []
            for item in data.get("results", []):
                item["media_type"] = media_type
                results.append(item)
            return results
        except Exception:
            return []

    tasks = [
        (gid, mt, region, pids)
        for gid in profile["top_genres"][:3]
        for mt in ("movie", "tv")
        for region, pids in region_map.items()
    ]

    candidates: list[dict] = []
    seen: set[tuple] = set()

    with ThreadPoolExecutor(max_workers=min(len(tasks), 20)) as pool:
        for batch in pool.map(fetch_discover, tasks):
            for item in batch:
                key = (item["id"], item["media_type"])
                if key not in seen and key not in watchlist_ids:
                    seen.add(key)
                    candidates.append(item)

    scored = [(c, _score_candidate(c, profile)) for c in candidates]
    scored.sort(key=lambda x: x[1], reverse=True)
    top = [c for c, score in scored if score > -1][:50]

    def check_and_build(c: dict) -> dict | None:
        available_on = _get_availability(c["id"], c["media_type"], user)
        if not available_on:
            return None
        return {
            "tmdb_id": c["id"],
            "media_type": c["media_type"],
            "title": c.get("title") or c.get("name", ""),
            "poster_path": c.get("poster_path"),
            "overview": c.get("overview"),
            "vote_average": c.get("vote_average"),
            "reason": _build_reason(c, profile, genre_map),
            "available_on": available_on,
        }

    with ThreadPoolExecutor(max_workers=30) as pool:
        results = [r for r in pool.map(check_and_build, top) if r is not None]

    return results[:24]


def _run_tmdb_fallback(user: models.User, page: int = 1) -> list[dict]:
    """Fallback for users whose watchlist items don't have metadata yet."""
    seeds: list = []
    for target_status, target_rating in [
        ("watched", 1), ("watching", 1),
        ("watched", None), ("watching", None),
        ("want_to_watch", None),
    ]:
        for item in user.watchlist:
            if len(seeds) >= 10:
                break
            if item.status.value == target_status and item.rating == target_rating:
                seeds.append(item)
        if len(seeds) >= 10:
            break

    watchlist_ids = {(item.tmdb_id, item.media_type.value) for item in user.watchlist}

    def fetch_tmdb_recs(seed: models.WatchlistItem) -> list[dict]:
        try:
            data = tmdb_get(
                f"/{seed.media_type.value}/{seed.tmdb_id}/recommendations",
                {"language": "en-US", "page": page},
            )
            for r in data.get("results", []):
                r["media_type"] = seed.media_type.value
                r["_seed_title"] = seed.title
            return data.get("results", [])
        except Exception:
            return []

    candidates: list[dict] = []
    seen: set[tuple] = set()

    with ThreadPoolExecutor(max_workers=10) as pool:
        for batch in pool.map(fetch_tmdb_recs, seeds):
            for item in batch:
                key = (item["id"], item["media_type"])
                if key not in seen and key not in watchlist_ids:
                    seen.add(key)
                    candidates.append(item)

    random.shuffle(candidates)

    def check(c: dict) -> dict | None:
        available_on = _get_availability(c["id"], c["media_type"], user)
        if not available_on:
            return None
        return {
            "tmdb_id": c["id"],
            "media_type": c["media_type"],
            "title": c.get("title") or c.get("name", ""),
            "poster_path": c.get("poster_path"),
            "overview": c.get("overview"),
            "vote_average": c.get("vote_average"),
            "reason": f"Because you watched {c['_seed_title']}",
            "available_on": available_on,
        }

    with ThreadPoolExecutor(max_workers=30) as pool:
        results = [r for r in pool.map(check, candidates) if r is not None]

    results.sort(key=lambda x: x.get("vote_average") or 0, reverse=True)
    return results[:24]


def _refresh_cache(user_id: int) -> None:
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
    page: int = 1,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.watchlist:
        raise HTTPException(400, "Add items to your watchlist first to get recommendations")
    if not current_user.streaming_services:
        raise HTTPException(400, "Add streaming services first to get recommendations")

    if page > 1:
        return _run_generation(current_user, page=page)

    cache = db.query(models.RecommendationCache).filter_by(user_id=current_user.id).first()
    if cache:
        stale = datetime.utcnow() - cache.generated_at > timedelta(minutes=CACHE_TTL_MINUTES)
        if stale:
            background_tasks.add_task(_refresh_cache, current_user.id)
        return {"items": json.loads(cache.items), "generated_at": cache.generated_at.isoformat()}

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
    results = _run_generation(current_user)
    cache = db.query(models.RecommendationCache).filter_by(user_id=current_user.id).first()
    if cache is None:
        cache = models.RecommendationCache(user_id=current_user.id)
        db.add(cache)
    cache.items = json.dumps(results)
    cache.generated_at = datetime.utcnow()
    db.commit()
    return {"items": results, "generated_at": cache.generated_at.isoformat()}


@router.get("/{media_type}/{tmdb_id}/reason")
def get_recommendation_reason(
    media_type: str,
    tmdb_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if media_type not in ("movie", "tv"):
        raise HTTPException(400, "media_type must be movie or tv")

    cached = (
        db.query(models.RecommendationReasonCache)
        .filter_by(user_id=current_user.id, tmdb_id=tmdb_id, media_type=media_type)
        .first()
    )
    if cached:
        return {"reason": cached.reason}

    profile = _build_taste_profile(current_user)
    genre_map = _get_genre_map()

    liked_titles = [
        item.title for item in current_user.watchlist
        if item.rating == 1
    ][:8]
    top_genre_names = [genre_map[gid] for gid in profile["top_genres"][:5] if gid in genre_map]

    try:
        detail = tmdb_get(f"/{media_type}/{tmdb_id}", {"language": "en-US"})
    except Exception:
        return {"reason": "Available on your streaming services"}

    title = detail.get("title") or detail.get("name", "")
    item_genres = [g["name"] for g in detail.get("genres", [])]

    # Truncate all user-controlled strings before they reach the prompt
    safe_genres = ", ".join(n[:50] for n in top_genre_names) or "unknown"
    safe_liked = ", ".join(t[:100] for t in liked_titles) or "none yet"
    safe_title = title[:200]
    safe_item_genres = ", ".join(item_genres[:10])
    safe_overview = (detail.get("overview") or "")[:400]

    try:
        response = _openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You write short, specific, personalized movie and TV show recommendation reasons. "
                        "1-2 sentences max. Be specific about what makes this title match the user's taste. "
                        "Never start with 'I' or address the user directly."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"User's favourite genres: {safe_genres}.\n"
                        f"Titles they liked: {safe_liked}.\n\n"
                        f"Title: {safe_title}\n"
                        f"Genres: {safe_item_genres}\n"
                        f"Description: {safe_overview}\n\n"
                        "Write a 1-2 sentence reason why this fits their taste."
                    ),
                },
            ],
            max_tokens=120,
            temperature=0.7,
        )
        reason = response.choices[0].message.content.strip()
    except Exception:
        reason = _build_reason(detail, profile, genre_map)

    try:
        entry = models.RecommendationReasonCache(
            user_id=current_user.id,
            tmdb_id=tmdb_id,
            media_type=media_type,
            reason=reason,
        )
        db.add(entry)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(models.RecommendationReasonCache)
            .filter_by(user_id=current_user.id, tmdb_id=tmdb_id, media_type=media_type)
            .first()
        )
        if existing:
            return {"reason": existing.reason}

    return {"reason": reason}
