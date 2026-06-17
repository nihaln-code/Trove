import json
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.config import settings
from app import models, schemas, auth

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

TMDB_BASE = "https://api.themoviedb.org/3"


def _enrich_item_metadata(item_id: int) -> None:
    db = SessionLocal()
    try:
        item = db.query(models.WatchlistItem).filter_by(id=item_id).first()
        if not item or item.metadata_json:
            return
        params = {
            "api_key": settings.tmdb_api_key,
            "language": "en-US",
            "append_to_response": "credits",
        }
        with httpx.Client(timeout=10) as client:
            r = client.get(f"{TMDB_BASE}/{item.media_type.value}/{item.tmdb_id}", params=params)
            r.raise_for_status()
            data = r.json()
        credits = data.get("credits", {})
        cast = [c["name"] for c in credits.get("cast", [])[:5]]
        director = next(
            (c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"),
            None,
        )
        meta = {
            "genre_ids": [g["id"] for g in data.get("genres", [])] or data.get("genre_ids", []),
            "cast": cast,
            "director": director,
            "runtime": data.get("runtime") or next(iter(data.get("episode_run_time") or []), None),
            "vote_average": data.get("vote_average"),
        }
        item.metadata_json = json.dumps(meta)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.get("", response_model=list[schemas.WatchlistItemOut])
def get_watchlist(
    status: schemas.WatchlistStatus = Query(None),
    current_user: models.User = Depends(auth.get_current_user),
):
    items = current_user.watchlist
    if status:
        items = [i for i in items if i.status == status]
    return sorted(items, key=lambda x: x.added_at, reverse=True)


@router.post("", response_model=schemas.WatchlistItemOut, status_code=201)
def add_to_watchlist(
    body: schemas.AddWatchlistItemRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    existing = (
        db.query(models.WatchlistItem)
        .filter_by(user_id=current_user.id, tmdb_id=body.tmdb_id, media_type=body.media_type)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already in watchlist")

    item = models.WatchlistItem(
        user_id=current_user.id,
        tmdb_id=body.tmdb_id,
        media_type=body.media_type,
        title=body.title,
        poster_path=body.poster_path,
        status=body.status,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    background_tasks.add_task(_enrich_item_metadata, item.id)
    return item


@router.patch("/{item_id}", response_model=schemas.WatchlistItemOut)
def update_watchlist_item(
    item_id: int,
    body: schemas.UpdateWatchlistItemRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    item = (
        db.query(models.WatchlistItem)
        .filter_by(id=item_id, user_id=current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if "status" in body.model_fields_set:
        item.status = body.status
    if "rating" in body.model_fields_set:
        item.rating = body.rating
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def remove_from_watchlist(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    item = (
        db.query(models.WatchlistItem)
        .filter_by(id=item_id, user_id=current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
