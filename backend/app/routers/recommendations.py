import json
import random
import httpx
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.config import settings
from app import models, auth
from app.database import get_db, SessionLocal

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

TMDB_BASE = "https://api.themoviedb.org/3"
CACHE_TTL_MINUTES = 30

_http = httpx.Client(limits=httpx.Limits(max_connections=50, max_keepalive_connections=30), timeout=10)


def tmdb_get(path: str, params: dict = {}) -> dict:
    p = {**params, "api_key": settings.tmdb_api_key}
    r = _http.get(f"{TMDB_BASE}{path}", params=p)
    r.raise_for_status()
    return r.json()


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


def _run_generation(user: models.User, page: int = 1) -> list[dict]:
    # Seed priority: liked items first, then unrated, never disliked
    seeds: list = []
    watchlist_all = list(user.watchlist)
    for target_status, target_rating in [
        ("watched", 1), ("watching", 1),
        ("watched", None), ("watching", None),
        ("want_to_watch", None),
    ]:
        for item in watchlist_all:
            if len(seeds) >= 10:
                break
            if item.status.value == target_status and item.rating == target_rating:
                seeds.append(item)
        if len(seeds) >= 10:
            break

    watchlist_ids = {(item.tmdb_id, item.media_type.value) for item in watchlist_all}

    def fetch_tmdb_recs(seed: models.WatchlistItem) -> list[dict]:
        try:
            data = tmdb_get(
                f"/{seed.media_type.value}/{seed.tmdb_id}/recommendations",
                {"language": "en-US", "page": page},
            )
            results = []
            for r in data.get("results", []):
                r["media_type"] = seed.media_type.value
                r["_seed_title"] = seed.title
                results.append(r)
            return results
        except Exception:
            return []

    # Fetch TMDB recs for all seeds in parallel
    candidates: list[dict] = []
    seen: set[tuple] = set()

    with ThreadPoolExecutor(max_workers=10) as pool:
        for batch in pool.map(fetch_tmdb_recs, seeds):
            for item in batch:
                key = (item["id"], item["media_type"])
                if key not in seen and key not in watchlist_ids:
                    seen.add(key)
                    candidates.append(item)

    # Shuffle so we don't always show the same order
    random.shuffle(candidates)

    # Check availability for all candidates in parallel
    def check(candidate: dict) -> dict | None:
        available_on = _get_availability(candidate["id"], candidate["media_type"], user)
        if not available_on:
            return None
        return {
            "tmdb_id": candidate["id"],
            "media_type": candidate["media_type"],
            "title": candidate.get("title") or candidate.get("name", ""),
            "poster_path": candidate.get("poster_path"),
            "overview": candidate.get("overview"),
            "vote_average": candidate.get("vote_average"),
            "reason": f"Because you watched {candidate['_seed_title']}",
            "available_on": available_on,
        }

    with ThreadPoolExecutor(max_workers=30) as pool:
        results = [r for r in pool.map(check, candidates) if r is not None]

    # Sort by rating, dedupe
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
        from fastapi import HTTPException
        raise HTTPException(400, "Add items to your watchlist first to get recommendations")
    if not current_user.streaming_services:
        from fastapi import HTTPException
        raise HTTPException(400, "Add streaming services first to get recommendations")

    # Load-more: fetch a different TMDB page so results don't repeat
    if page > 1:
        return _run_generation(current_user, page=page)

    # Serve from cache if fresh
    cache = db.query(models.RecommendationCache).filter_by(user_id=current_user.id).first()
    if cache:
        stale = datetime.utcnow() - cache.generated_at > timedelta(minutes=CACHE_TTL_MINUTES)
        if stale:
            background_tasks.add_task(_refresh_cache, current_user.id)
        return {"items": json.loads(cache.items), "generated_at": cache.generated_at.isoformat()}

    # No cache: generate now (fast — ~500ms)
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
