import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from app.config import settings
from app import models, auth

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

TMDB_BASE = "https://api.themoviedb.org/3"


def tmdb_get(path: str, params: dict = {}) -> dict:
    params["api_key"] = settings.tmdb_api_key
    with httpx.Client() as client:
        r = client.get(f"{TMDB_BASE}{path}", params=params)
        r.raise_for_status()
        return r.json()


def _search_tmdb(title: str, media_type: str) -> dict | None:
    data = tmdb_get("/search/multi", {"query": title, "language": "en-US"})
    for result in data.get("results", []):
        if result.get("media_type") == media_type:
            return result
    return None


def _get_availability(tmdb_id: int, media_type: str, user: models.User) -> list[str]:
    """Return list of provider names the user has that stream this title."""
    user_provider_ids = {svc.tmdb_provider_id: svc.provider_name for svc in user.streaming_services}
    if not user_provider_ids:
        return []

    providers_data = tmdb_get(f"/{media_type}/{tmdb_id}/watch/providers")
    user_regions = {svc.region_override or user.default_region for svc in user.streaming_services}

    available_on = set()
    for region in user_regions:
        region_data = providers_data.get("results", {}).get(region, {})
        for p in region_data.get("flatrate", []):
            if p["provider_id"] in user_provider_ids:
                available_on.add(user_provider_ids[p["provider_id"]])

    return list(available_on)


@router.get("")
def get_recommendations(current_user: models.User = Depends(auth.get_current_user)):
    if not current_user.watchlist:
        raise HTTPException(status_code=400, detail="Add items to your watchlist first to get recommendations")

    if not current_user.streaming_services:
        raise HTTPException(status_code=400, detail="Add streaming services first to get recommendations")

    watched   = [i for i in current_user.watchlist if i.status == "watched"]
    watching  = [i for i in current_user.watchlist if i.status == "watching"]
    want      = [i for i in current_user.watchlist if i.status == "want_to_watch"]

    def fmt(items, limit):
        return [f"{i.title} ({i.media_type})" for i in items[:limit]]

    watched_titles  = fmt(watched,  20)
    watching_titles = fmt(watching, 10)
    want_titles     = fmt(want,     20)

    service_names = [svc.provider_name for svc in current_user.streaming_services]

    client = OpenAI(api_key=settings.openai_api_key)

    sections = []
    if watched_titles:
        sections.append("Titles the user has already watched (strong taste signal):\n" +
                        "\n".join(f"- {t}" for t in watched_titles))
    if watching_titles:
        sections.append("Titles the user is currently watching (active interests):\n" +
                        "\n".join(f"- {t}" for t in watching_titles))
    if want_titles:
        sections.append("Titles the user wants to watch (intended taste):\n" +
                        "\n".join(f"- {t}" for t in want_titles))

    watchlist_context = "\n\n".join(sections)

    prompt = f"""You are a personalized entertainment recommendation engine.

{watchlist_context}

They have access to these streaming services: {', '.join(service_names)}

Based on their taste, recommend exactly 12 titles they would love. Mix movies and TV shows.
For each recommendation, identify whether it is a "movie" or "tv" show.

Respond ONLY with a valid JSON array (no markdown, no explanation) in this exact format:
[
  {{
    "title": "Exact Title",
    "media_type": "movie",
    "reason": "One sentence explaining why this fits their taste perfectly."
  }},
  ...
]"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=1500,
    )

    raw = response.choices[0].message.content.strip()

    try:
        suggestions = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse recommendations from AI")

    results = []
    for suggestion in suggestions:
        title = suggestion.get("title", "")
        media_type = suggestion.get("media_type", "movie")
        reason = suggestion.get("reason", "")

        tmdb_result = _search_tmdb(title, media_type)
        if not tmdb_result:
            continue

        tmdb_id = tmdb_result["id"]
        available_on = _get_availability(tmdb_id, media_type, current_user)

        results.append({
            "tmdb_id": tmdb_id,
            "media_type": media_type,
            "title": tmdb_result.get("title") or tmdb_result.get("name", title),
            "poster_path": tmdb_result.get("poster_path"),
            "overview": tmdb_result.get("overview"),
            "vote_average": tmdb_result.get("vote_average"),
            "reason": reason,
            "available_on": available_on,
        })

    # Prioritize items available on user's services
    results.sort(key=lambda x: (len(x["available_on"]) == 0, 0))
    return results
