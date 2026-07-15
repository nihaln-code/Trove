import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/content", tags=["content"])

TMDB_BASE = "https://api.themoviedb.org/3"


def tmdb_get(path: str, params: dict = {}) -> dict:
    params["api_key"] = settings.tmdb_api_key
    with httpx.Client() as client:
        r = client.get(f"{TMDB_BASE}{path}", params=params)
        r.raise_for_status()
        return r.json()


def _build_provider_region_map(user: models.User) -> dict[str, list[int]]:
    """Group provider IDs by region, using per-service override or user default."""
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


def _attach_availability(items: list[dict], user: models.User) -> list[dict]:
    if not items:
        return items

    def attach(item: dict) -> dict:
        item["available_on"] = _get_availability(item["id"], item["media_type"], user)
        return item

    with ThreadPoolExecutor(max_workers=min(len(items), 20)) as pool:
        return list(pool.map(attach, items))


@router.get("/providers")
def list_all_providers(
    region: str = Query("US"),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return all available streaming providers for a region (for the add-service UI)."""
    movies = tmdb_get("/watch/providers/movie", {"watch_region": region, "language": "en-US"})
    tv = tmdb_get("/watch/providers/tv", {"watch_region": region, "language": "en-US"})

    seen = {}
    for p in movies.get("results", []) + tv.get("results", []):
        pid = p["provider_id"]
        if pid not in seen:
            seen[pid] = {
                "provider_id": pid,
                "provider_name": p["provider_name"],
                "logo_path": p.get("logo_path"),
                "display_priority": p.get("display_priority", 999),
            }

    return sorted(seen.values(), key=lambda x: x["display_priority"])


@router.get("/browse")
def browse(
    media_type: str = Query("movie", pattern="^(movie|tv)$"),
    genre_id: Optional[int] = Query(None),
    languages: Optional[str] = Query(None, description="Comma-separated ISO 639-1 codes to filter by"),
    page: int = Query(1, ge=1),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Discover content available on the user's streaming services.
    Groups by region so per-service region overrides are respected.
    """
    if not current_user.streaming_services:
        return {"results": [], "total_pages": 0, "total_results": 0}

    region_map = _build_provider_region_map(current_user)
    lang_list: list[Optional[str]] = (
        [l.strip() for l in languages.split(",") if l.strip()] if languages else [None]
    )

    def fetch(args: tuple) -> list[dict]:
        region, provider_ids, language = args
        try:
            params: dict = {
                "watch_region": region,
                "with_watch_providers": "|".join(str(p) for p in provider_ids),
                "page": page,
                "language": "en-US",
                "sort_by": "popularity.desc",
            }
            if genre_id:
                params["with_genres"] = genre_id
            if language:
                params["with_original_language"] = language
            data = tmdb_get(f"/discover/{media_type}", params)
            results = []
            for item in data.get("results", []):
                item["media_type"] = media_type
                results.append(item)
            return results
        except Exception:
            return []

    tasks = [
        (region, provider_ids, language)
        for region, provider_ids in region_map.items()
        for language in lang_list
    ]

    all_results = []
    seen_ids = set()

    with ThreadPoolExecutor(max_workers=min(len(tasks), 20)) as pool:
        for batch in pool.map(fetch, tasks):
            for item in batch:
                if item["id"] not in seen_ids:
                    seen_ids.add(item["id"])
                    all_results.append(item)

    all_results.sort(key=lambda x: x.get("popularity", 0), reverse=True)
    all_results = _attach_availability(all_results, current_user)
    return {"results": all_results, "page": page}


@router.get("/search")
def search(
    query: str = Query(..., min_length=1, max_length=200),
    page: int = Query(1, ge=1),
    current_user: models.User = Depends(auth.get_current_user),
):
    normalized_query = re.sub(r"\s+", " ", query).strip()
    data = tmdb_get("/search/multi", {"query": normalized_query, "page": page, "language": "en-US"})
    results = [
        r for r in data.get("results", [])
        if r.get("media_type") in ("movie", "tv")
    ]

    # TMDB's own fuzzy matching can miss titles when spaces/hyphens are
    # missing or extra (e.g. "spiderman" vs "Spider-Man"); retry once with
    # them stripped out entirely if the first pass found nothing.
    if not results and page == 1:
        collapsed_query = re.sub(r"[\s\-]+", "", normalized_query)
        if collapsed_query != normalized_query:
            data = tmdb_get("/search/multi", {"query": collapsed_query, "page": page, "language": "en-US"})
            results = [
                r for r in data.get("results", [])
                if r.get("media_type") in ("movie", "tv")
            ]

    results = _attach_availability(results, current_user)
    return {"results": results, "total_pages": data.get("total_pages", 1)}


@router.get("/genres")
def get_genres(
    media_type: str = Query("movie", pattern="^(movie|tv)$"),
    current_user: models.User = Depends(auth.get_current_user),
):
    data = tmdb_get(f"/genre/{media_type}/list", {"language": "en-US"})
    return data.get("genres", [])


@router.get("/{media_type}/{tmdb_id}")
def get_detail(
    media_type: str,
    tmdb_id: int,
    current_user: models.User = Depends(auth.get_current_user),
):
    if media_type not in ("movie", "tv"):
        from fastapi import HTTPException
        raise HTTPException(400, "media_type must be movie or tv")

    detail = tmdb_get(f"/{media_type}/{tmdb_id}", {"language": "en-US", "append_to_response": "credits"})

    # Attach streaming availability across all user regions
    region_map = _build_provider_region_map(current_user)
    user_provider_ids = {svc.tmdb_provider_id for svc in current_user.streaming_services}

    providers_data = tmdb_get(f"/{media_type}/{tmdb_id}/watch/providers")
    availability = {}
    for region, providers_by_type in providers_data.get("results", {}).items():
        flatrate = providers_by_type.get("flatrate", [])
        matched = [p for p in flatrate if p["provider_id"] in user_provider_ids]
        if matched:
            availability[region] = matched

    detail["user_availability"] = availability
    return detail


@router.get("/{media_type}/{tmdb_id}/ratings", response_model=schemas.ContentRatingsOut)
def get_content_ratings(
    media_type: str,
    tmdb_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """App-wide like/dislike counts for a title, tallied from every user's personal watchlist."""
    if media_type not in ("movie", "tv"):
        from fastapi import HTTPException
        raise HTTPException(400, "media_type must be movie or tv")

    likes = db.query(models.WatchlistItem).filter_by(tmdb_id=tmdb_id, media_type=media_type, rating=1).count()
    dislikes = db.query(models.WatchlistItem).filter_by(tmdb_id=tmdb_id, media_type=media_type, rating=-1).count()
    return {"likes": likes, "dislikes": dislikes}
