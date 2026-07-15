import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import models, auth
from app.database import get_db
from app.routers.groups import _get_group_or_404, _get_membership_or_403
from app.routers.recommendations import _build_taste_profile, _score_candidate, _get_genre_map, tmdb_get

router = APIRouter(prefix="/groups", tags=["group-recommendations"])

CACHE_TTL_MINUTES = 30


# ---------------------------------------------------------------------------
# Group-specific helpers
# ---------------------------------------------------------------------------

def _build_group_taste_profile(group_items: list[models.GroupWatchlistItem]) -> dict | None:
    """Build taste profile from the group's shared watchlist metadata.

    Returns None when fewer than 3 items have been enriched, signalling the
    caller to fall back to member personal watchlists.
    """
    status_weight = {
        models.WatchlistStatus.watched: 2.0,
        models.WatchlistStatus.watching: 1.5,
        models.WatchlistStatus.want_to_watch: 1.0,
    }

    genre_scores: dict[int, float] = defaultdict(float)
    cast_scores: dict[str, float] = defaultdict(float)
    director_scores: dict[str, float] = defaultdict(float)
    language_counts: dict[str, int] = defaultdict(int)
    enriched = 0

    for item in group_items:
        if not item.metadata_json:
            continue
        try:
            meta = json.loads(item.metadata_json)
        except (json.JSONDecodeError, TypeError):
            continue
        enriched += 1
        w = status_weight.get(item.status, 1.0)
        for gid in meta.get("genre_ids", []):
            genre_scores[gid] += w
        for name in meta.get("cast", []):
            cast_scores[name] += w
        director = meta.get("director")
        if director:
            director_scores[director] += w
        lang = meta.get("original_language")
        if lang:
            language_counts[lang] += 1

    if enriched < 3:
        return None

    top_genres = [gid for gid, _ in sorted(genre_scores.items(), key=lambda x: x[1], reverse=True) if genre_scores[gid] > 0]
    top_cast = [name for name, _ in sorted(cast_scores.items(), key=lambda x: x[1], reverse=True)[:15]]
    top_directors = [name for name, _ in sorted(director_scores.items(), key=lambda x: x[1], reverse=True)[:8]]
    top_languages = [lang for lang, _ in sorted(language_counts.items(), key=lambda x: x[1], reverse=True)]

    return {
        "top_genres": top_genres[:6],
        "avoided_genres": [],
        "top_cast": top_cast,
        "top_directors": top_directors,
        "genre_scores": dict(genre_scores),
        "top_languages": top_languages,
    }


def _build_personal_group_profile(users: list[models.User]) -> dict:
    """Fallback: average personal watchlist profiles across all members."""
    if not users:
        return {"top_genres": [], "avoided_genres": [], "top_cast": [], "top_directors": [], "genre_scores": {}}

    all_genre_scores: dict[int, list[float]] = defaultdict(list)
    cast_appearances: dict[str, int] = defaultdict(int)
    director_appearances: dict[str, int] = defaultdict(int)

    for user in users:
        profile = _build_taste_profile(user)
        for gid, score in profile["genre_scores"].items():
            all_genre_scores[gid].append(score)
        for name in profile["top_cast"]:
            cast_appearances[name] += 1
        for name in profile["top_directors"]:
            director_appearances[name] += 1

    n = len(users)
    merged_scores = {gid: sum(scores) / n for gid, scores in all_genre_scores.items()}

    top_genres = [
        gid for gid, s in sorted(merged_scores.items(), key=lambda x: x[1], reverse=True)
        if s > 0
    ]
    avoided_genres = [gid for gid, s in merged_scores.items() if s < 0]
    top_cast = [name for name, _ in sorted(cast_appearances.items(), key=lambda x: x[1], reverse=True)[:15]]
    top_directors = [name for name, _ in sorted(director_appearances.items(), key=lambda x: x[1], reverse=True)[:8]]

    return {
        "top_genres": top_genres[:6],
        "avoided_genres": avoided_genres,
        "top_cast": top_cast,
        "top_directors": top_directors,
        "genre_scores": merged_scores,
        "top_languages": [],
    }


def _get_group_providers(
    group_id: int, users: list[models.User], db: Session
) -> tuple[set[int], dict[int, str]]:
    """Returns (provider_id_set, provider_name_map) — custom services if set, else union of members'."""
    custom = db.query(models.GroupStreamingService).filter_by(group_id=group_id).all()
    if custom:
        ids = {s.tmdb_provider_id for s in custom}
        names = {s.tmdb_provider_id: s.provider_name for s in custom}
        return ids, names
    ids: set[int] = set()
    names: dict[int, str] = {}
    for u in users:
        for svc in u.streaming_services:
            ids.add(svc.tmdb_provider_id)
            names[svc.tmdb_provider_id] = svc.provider_name
    return ids, names


def _build_group_reason(candidate: dict, profile: dict, genre_map: dict) -> str:
    matched = [
        genre_map[gid] for gid in candidate.get("genre_ids", [])
        if profile["genre_scores"].get(gid, 0) > 0 and gid in genre_map
    ]
    if matched:
        return f"Your group enjoys {', '.join(matched[:2])}"
    return "Popular on your group's services"


def _run_group_generation(
    group_id: int,
    requesting_user: models.User,
    db: Session,
    page: int = 1,
    mode: str = "group_watchlist",
    languages: list[str] | None = None,
) -> list[dict]:
    memberships = db.query(models.GroupMembership).filter_by(group_id=group_id).all()
    users = [m.user for m in memberships]

    if not users:
        return []

    group_items = db.query(models.GroupWatchlistItem).filter_by(group_id=group_id).all()

    if mode == "member_tastes":
        profile = _build_personal_group_profile(users)
    else:
        profile = _build_group_taste_profile(group_items)
        if profile is None:
            profile = _build_personal_group_profile(users)

    if not profile["top_genres"]:
        return []

    genre_map = _get_genre_map()

    use_ids, provider_names = _get_group_providers(group_id, users, db)

    if not use_ids:
        return []

    region = requesting_user.default_region

    # Items already in the group's shared watchlist — exclude from recs
    group_watchlist_keys = {
        (item.tmdb_id, item.media_type.value)
        for item in group_items
    }

    # Determine language passes for Discover queries.
    if languages:
        # Explicit user filter overrides automatic language detection entirely
        lang_passes: list[str | None] = list(languages)
        non_english = [l for l in languages if l != "en"]
    else:
        # Non-English dominant groups get language-filtered queries so popularity ranking
        # doesn't bury their content under English results.
        top_languages = profile.get("top_languages", [])
        non_english = [l for l in top_languages if l != "en"]
        if non_english and "en" not in top_languages:
            # Pure non-English group — only query their language(s)
            lang_passes = non_english[:2]
        elif non_english:
            # Mixed — query the non-English language AND global (catches English)
            lang_passes = non_english[:1] + [None]
        else:
            # English or unknown — no language filter
            lang_passes = [None]

    # Fetch candidates from TMDB Discover
    def fetch_discover(args: tuple) -> list[dict]:
        genre_id, media_type, language = args
        try:
            # Non-English films have far fewer TMDB votes; a high floor would empty the pool
            vote_floor = 10 if language and language != "en" else 50
            params: dict = {
                "watch_region": region,
                "with_watch_providers": "|".join(str(p) for p in use_ids),
                "with_genres": genre_id,
                "page": page,
                "language": "en-US",
                "sort_by": "popularity.desc",
                "vote_count.gte": vote_floor,
            }
            if language:
                params["with_original_language"] = language
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

    # Use more genres for non-English passes since those pools are shallower
    genre_limit = 5 if non_english else 3
    tasks = [
        (gid, mt, lang)
        for gid in profile["top_genres"][:genre_limit]
        for mt in ("movie", "tv")
        for lang in lang_passes
    ]
    candidates: list[dict] = []
    seen: set[tuple] = set()

    with ThreadPoolExecutor(max_workers=min(len(tasks), 12)) as pool:
        for batch in pool.map(fetch_discover, tasks):
            for item in batch:
                key = (item["id"], item["media_type"])
                if key not in seen and key not in group_watchlist_keys:
                    seen.add(key)
                    candidates.append(item)

    scores = {(c["id"], c["media_type"]): _score_candidate(c, profile) for c in candidates}
    scored = sorted(candidates, key=lambda c: scores[(c["id"], c["media_type"])], reverse=True)
    top = [c for c in scored if scores[(c["id"], c["media_type"])] > -1]

    def check_and_build(c: dict) -> dict | None:
        try:
            providers_data = tmdb_get(f"/{c['media_type']}/{c['id']}/watch/providers")
        except Exception:
            return None

        flatrate = providers_data.get("results", {}).get(region, {}).get("flatrate", [])
        matched_ids = {p["provider_id"] for p in flatrate} & use_ids
        if not matched_ids:
            return None

        available_on = [provider_names[pid] for pid in matched_ids if pid in provider_names]
        reason = _build_group_reason(c, profile, genre_map)

        return {
            "tmdb_id": c["id"],
            "media_type": c["media_type"],
            "title": c.get("title") or c.get("name", ""),
            "poster_path": c.get("poster_path"),
            "overview": c.get("overview"),
            "vote_average": c.get("vote_average"),
            "reason": reason,
            "available_on": available_on,
        }

    with ThreadPoolExecutor(max_workers=30) as pool:
        results = [r for r in pool.map(check_and_build, top) if r is not None]

    return results[:24]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _get_based_on(group_items: list[models.GroupWatchlistItem], mode: str) -> str:
    """Which data source recommendations actually came from — can differ from the
    requested mode when group_watchlist falls back to member tastes (too few
    enriched shared-watchlist items)."""
    if mode == "member_tastes":
        return "member_tastes"
    return "shared_watchlist" if _build_group_taste_profile(group_items) is not None else "member_tastes"


@router.get("/{group_id}/recommendations")
def get_group_recommendations(
    group_id: int,
    page: int = Query(1, ge=1),
    mode: str = Query("group_watchlist", pattern="^(group_watchlist|member_tastes)$"),
    languages: str = Query(None, description="Comma-separated ISO 639-1 codes to filter by"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    lang_list = [l.strip() for l in languages.split(",") if l.strip()] if languages else None

    based_on = None
    if page == 1:
        group_items = db.query(models.GroupWatchlistItem).filter_by(group_id=group_id).all()
        based_on = _get_based_on(group_items, mode)

    # member_tastes mode and an explicit language filter are never cached
    if mode == "member_tastes" or lang_list:
        results = _run_group_generation(group_id, current_user, db, page=page, mode=mode, languages=lang_list)
        if page > 1:
            return results
        return {"items": results, "generated_at": datetime.utcnow().isoformat(), "based_on": based_on}

    if page > 1:
        return _run_group_generation(group_id, current_user, db, page=page, mode=mode)

    cache = db.query(models.GroupRecommendationCache).filter_by(group_id=group_id).first()
    if cache:
        stale = datetime.utcnow() - cache.generated_at > timedelta(minutes=CACHE_TTL_MINUTES)
        if not stale:
            return {"items": json.loads(cache.items), "generated_at": cache.generated_at.isoformat(), "based_on": based_on}
        results = _run_group_generation(group_id, current_user, db)
        cache.items = json.dumps(results)
        cache.generated_at = datetime.utcnow()
        db.commit()
        return {"items": results, "generated_at": cache.generated_at.isoformat(), "based_on": based_on}

    results = _run_group_generation(group_id, current_user, db)
    cache = models.GroupRecommendationCache(
        group_id=group_id,
        items=json.dumps(results),
        generated_at=datetime.utcnow(),
    )
    db.add(cache)
    db.commit()
    return {"items": results, "generated_at": cache.generated_at.isoformat(), "based_on": based_on}


@router.post("/{group_id}/recommendations/refresh")
def refresh_group_recommendations(
    group_id: int,
    mode: str = Query("group_watchlist", pattern="^(group_watchlist|member_tastes)$"),
    languages: str = Query(None, description="Comma-separated ISO 639-1 codes to filter by"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    lang_list = [l.strip() for l in languages.split(",") if l.strip()] if languages else None

    group_items = db.query(models.GroupWatchlistItem).filter_by(group_id=group_id).all()
    based_on = _get_based_on(group_items, mode)

    results = _run_group_generation(group_id, current_user, db, mode=mode, languages=lang_list)

    if mode == "member_tastes" or lang_list:
        return {"items": results, "generated_at": datetime.utcnow().isoformat(), "based_on": based_on}

    cache = db.query(models.GroupRecommendationCache).filter_by(group_id=group_id).first()
    if cache is None:
        cache = models.GroupRecommendationCache(group_id=group_id)
        db.add(cache)
    cache.items = json.dumps(results)
    cache.generated_at = datetime.utcnow()
    db.commit()
    return {"items": results, "generated_at": cache.generated_at.isoformat(), "based_on": based_on}
