from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


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
