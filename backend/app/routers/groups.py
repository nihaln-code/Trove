import json
import secrets
import string
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from app.database import get_db, SessionLocal
from app import models, schemas, auth
from app.routers.recommendations import tmdb_get, _parse_tmdb_metadata

router = APIRouter(prefix="/groups", tags=["groups"])

_ALPHABET = string.ascii_uppercase + string.digits


def _enrich_group_item_metadata(item_id: int) -> None:
    db = SessionLocal()
    try:
        item = db.query(models.GroupWatchlistItem).filter_by(id=item_id).first()
        if not item or item.metadata_json:
            return
        data = tmdb_get(
            f"/{item.media_type.value}/{item.tmdb_id}",
            {"language": "en-US", "append_to_response": "credits"},
        )
        item.metadata_json = json.dumps(_parse_tmdb_metadata(data))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def generate_invite_code(length: int = 8) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def _member_out(membership: models.GroupMembership) -> schemas.GroupMemberOut:
    return schemas.GroupMemberOut(
        user_id=membership.user.id,
        name=membership.user.name,
        email=membership.user.email,
        avatar_url=membership.user.avatar_url,
        role=membership.role,
        joined_at=membership.joined_at,
    )


def _group_out(group: models.Group) -> schemas.GroupOut:
    return schemas.GroupOut(
        id=group.id,
        name=group.name,
        invite_code=group.invite_code,
        owner_id=group.owner_id,
        created_at=group.created_at,
        member_count=len(group.members),
    )


def _group_detail_out(group: models.Group) -> schemas.GroupDetailOut:
    return schemas.GroupDetailOut(
        **_group_out(group).model_dump(),
        members=[_member_out(m) for m in group.members],
    )


def _item_out(item: models.GroupWatchlistItem, current_user_id: int) -> schemas.GroupWatchlistItemOut:
    liked_by = [
        schemas.GroupItemLiker(user_id=r.user_id, name=r.user.name)
        for r in item.member_ratings if r.rating == 1
    ]
    my_rating = next((r.rating for r in item.member_ratings if r.user_id == current_user_id), None)
    return schemas.GroupWatchlistItemOut(
        id=item.id,
        tmdb_id=item.tmdb_id,
        media_type=item.media_type,
        title=item.title,
        poster_path=item.poster_path,
        added_at=item.added_at,
        added_by_user_id=item.added_by_user_id,
        added_by_name=item.added_by.name,
        status=item.status,
        like_count=sum(1 for r in item.member_ratings if r.rating == 1),
        dislike_count=sum(1 for r in item.member_ratings if r.rating == -1),
        liked_by=liked_by,
        my_rating=my_rating,
    )


def _get_group_or_404(db: Session, group_id: int) -> models.Group:
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def _get_membership_or_403(db: Session, group_id: int, user_id: int) -> models.GroupMembership:
    membership = (
        db.query(models.GroupMembership)
        .filter_by(group_id=group_id, user_id=user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    return membership


@router.post("", response_model=schemas.GroupDetailOut, status_code=201)
def create_group(
    body: schemas.CreateGroupRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    for _ in range(5):
        group = models.Group(
            name=body.name,
            invite_code=generate_invite_code(),
            owner_id=current_user.id,
        )
        db.add(group)
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
    else:
        raise HTTPException(status_code=500, detail="Could not generate a unique invite code")

    membership = models.GroupMembership(group_id=group.id, user_id=current_user.id, role=models.GroupRole.owner)
    db.add(membership)
    db.commit()
    db.refresh(group)
    return _group_detail_out(group)


@router.get("", response_model=list[schemas.GroupOut])
def list_my_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    groups = [m.group for m in current_user.group_memberships]
    return [_group_out(g) for g in groups]


@router.post("/join", response_model=schemas.GroupDetailOut, status_code=201)
def join_group(
    body: schemas.JoinGroupRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    group = (
        db.query(models.Group)
        .filter(models.Group.invite_code == body.invite_code.upper())
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    existing = (
        db.query(models.GroupMembership)
        .filter_by(group_id=group.id, user_id=current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already a member of this group")

    membership = models.GroupMembership(group_id=group.id, user_id=current_user.id, role=models.GroupRole.member)
    db.add(membership)
    db.commit()
    db.refresh(group)
    return _group_detail_out(group)


@router.get("/preview/{invite_code}", response_model=schemas.GroupPreviewOut)
def preview_group(
    invite_code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Look up a group by invite code without requiring membership, so an
    invite link can show what you're joining before you commit."""
    group = (
        db.query(models.Group)
        .filter(models.Group.invite_code == invite_code.upper())
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    already_member = (
        db.query(models.GroupMembership)
        .filter_by(group_id=group.id, user_id=current_user.id)
        .first()
        is not None
    )
    return schemas.GroupPreviewOut(
        id=group.id,
        name=group.name,
        member_count=len(group.members),
        already_member=already_member,
    )


@router.get("/{group_id}", response_model=schemas.GroupDetailOut)
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    group = _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)
    return _group_detail_out(group)


@router.delete("/{group_id}/members/me", status_code=204)
def leave_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    membership = _get_membership_or_403(db, group_id, current_user.id)
    if membership.role == models.GroupRole.owner:
        raise HTTPException(status_code=403, detail="Owners cannot leave; delete the group instead")
    db.delete(membership)
    db.commit()


@router.delete("/{group_id}/members/{user_id}", status_code=204)
def remove_member(
    group_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    group = _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can remove members")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Use leave instead of removing yourself")

    membership = (
        db.query(models.GroupMembership)
        .filter_by(group_id=group_id, user_id=user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(membership)
    db.commit()


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    group = _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete the group")

    # Not covered by Group's ORM cascades (members/items), remove explicitly first
    db.query(models.GroupRecommendationCache).filter_by(group_id=group_id).delete()
    db.query(models.GroupExcludedService).filter_by(group_id=group_id).delete()
    db.query(models.GroupAddedService).filter_by(group_id=group_id).delete()
    db.delete(group)
    db.commit()


@router.get("/{group_id}/watchlist", response_model=list[schemas.GroupWatchlistItemOut])
def get_group_watchlist(
    group_id: int,
    status: schemas.WatchlistStatus = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    items = db.query(models.GroupWatchlistItem).filter_by(group_id=group_id).all()
    if status:
        items = [i for i in items if i.status == status]
    items = sorted(items, key=lambda i: i.added_at, reverse=True)
    return [_item_out(i, current_user.id) for i in items]


@router.post("/{group_id}/watchlist", response_model=schemas.GroupWatchlistItemOut, status_code=201)
def add_group_watchlist_item(
    group_id: int,
    body: schemas.AddGroupWatchlistItemRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    existing = (
        db.query(models.GroupWatchlistItem)
        .filter_by(group_id=group_id, tmdb_id=body.tmdb_id, media_type=body.media_type)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already in group watchlist")

    item = models.GroupWatchlistItem(
        group_id=group_id,
        tmdb_id=body.tmdb_id,
        media_type=body.media_type,
        title=body.title,
        poster_path=body.poster_path,
        status=body.status,
        added_by_user_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    background_tasks.add_task(_enrich_group_item_metadata, item.id)
    return _item_out(item, current_user.id)


@router.patch("/{group_id}/watchlist/{item_id}", response_model=schemas.GroupWatchlistItemOut)
def update_group_watchlist_item(
    group_id: int,
    item_id: int,
    body: schemas.UpdateGroupWatchlistItemRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    item = (
        db.query(models.GroupWatchlistItem)
        .filter_by(id=item_id, group_id=group_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if "status" in body.model_fields_set:
        item.status = body.status
    db.commit()
    db.refresh(item)
    return _item_out(item, current_user.id)


@router.put("/{group_id}/watchlist/{item_id}/rating", response_model=schemas.GroupWatchlistItemOut)
def set_group_item_rating(
    group_id: int,
    item_id: int,
    body: schemas.SetGroupItemRatingRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    item = (
        db.query(models.GroupWatchlistItem)
        .filter_by(id=item_id, group_id=group_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    existing = (
        db.query(models.GroupItemRating)
        .filter_by(group_watchlist_item_id=item_id, user_id=current_user.id)
        .first()
    )
    if body.rating is None:
        if existing:
            db.delete(existing)
    elif existing:
        existing.rating = body.rating
    else:
        db.add(models.GroupItemRating(
            group_watchlist_item_id=item_id,
            user_id=current_user.id,
            rating=body.rating,
        ))
    db.commit()
    db.refresh(item)
    return _item_out(item, current_user.id)


@router.delete("/{group_id}/watchlist/{item_id}", status_code=204)
def remove_group_watchlist_item(
    group_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    item = (
        db.query(models.GroupWatchlistItem)
        .filter_by(id=item_id, group_id=group_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()


# ---------------------------------------------------------------------------
# Group streaming services
# ---------------------------------------------------------------------------

def _get_union_services(db: Session, group_id: int) -> list[schemas.GroupServiceItem]:
    memberships = db.query(models.GroupMembership).filter_by(group_id=group_id).all()
    seen: set[int] = set()
    result = []
    for m in memberships:
        for svc in m.user.streaming_services:
            if svc.tmdb_provider_id not in seen:
                seen.add(svc.tmdb_provider_id)
                result.append(schemas.GroupServiceItem(
                    tmdb_provider_id=svc.tmdb_provider_id,
                    provider_name=svc.provider_name,
                    provider_logo_path=svc.provider_logo_path,
                ))
    return result


def get_group_active_services(db: Session, group_id: int) -> tuple[list[schemas.GroupServiceItem], list[schemas.GroupServiceItem], bool]:
    """Returns (active, available, is_custom). Active is the live union of
    members' personal services plus any group-added extras, minus any
    explicit exclusions, so newly added personal services show up
    automatically, and members can both add services no one personally has
    and remove ones they don't want counted."""
    base = _get_union_services(db, group_id)
    added_rows = db.query(models.GroupAddedService).filter_by(group_id=group_id).all()
    excluded_ids = {
        e.tmdb_provider_id for e in
        db.query(models.GroupExcludedService).filter_by(group_id=group_id).all()
    }

    combined: dict[int, schemas.GroupServiceItem] = {s.tmdb_provider_id: s for s in base}
    for a in added_rows:
        combined[a.tmdb_provider_id] = schemas.GroupServiceItem(
            tmdb_provider_id=a.tmdb_provider_id,
            provider_name=a.provider_name,
            provider_logo_path=a.provider_logo_path,
        )

    available = list(combined.values())
    active = [s for s in available if s.tmdb_provider_id not in excluded_ids]
    is_custom = len(excluded_ids) > 0 or len(added_rows) > 0
    return active, available, is_custom


@router.get("/{group_id}/services", response_model=schemas.GroupServicesResponse)
def get_group_services(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    active, available, is_custom = get_group_active_services(db, group_id)
    return schemas.GroupServicesResponse(active=active, available=available, is_custom=is_custom)


@router.put("/{group_id}/services", response_model=schemas.GroupServicesResponse)
def set_group_services(
    group_id: int,
    body: schemas.SetGroupServicesRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)

    base_ids = {s.tmdb_provider_id for s in _get_union_services(db, group_id)}
    selected = {s.tmdb_provider_id: s for s in body.services}
    selected_ids = set(selected.keys())

    excluded_ids = base_ids - selected_ids
    added_ids = selected_ids - base_ids

    db.query(models.GroupExcludedService).filter_by(group_id=group_id).delete()
    for pid in excluded_ids:
        db.add(models.GroupExcludedService(group_id=group_id, tmdb_provider_id=pid))

    db.query(models.GroupAddedService).filter_by(group_id=group_id).delete()
    for pid in added_ids:
        svc = selected[pid]
        db.add(models.GroupAddedService(
            group_id=group_id,
            tmdb_provider_id=pid,
            provider_name=svc.provider_name,
            provider_logo_path=svc.provider_logo_path,
        ))

    db.commit()

    active, available, is_custom = get_group_active_services(db, group_id)
    return schemas.GroupServicesResponse(active=active, available=available, is_custom=is_custom)


@router.delete("/{group_id}/services", status_code=204)
def reset_group_services(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_group_or_404(db, group_id)
    _get_membership_or_403(db, group_id, current_user.id)
    db.query(models.GroupExcludedService).filter_by(group_id=group_id).delete()
    db.query(models.GroupAddedService).filter_by(group_id=group_id).delete()
    db.commit()
