import secrets
import string
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/groups", tags=["groups"])

_ALPHABET = string.ascii_uppercase + string.digits


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


def _item_out(item: models.GroupWatchlistItem) -> schemas.GroupWatchlistItemOut:
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
    return [_item_out(i) for i in items]


@router.post("/{group_id}/watchlist", response_model=schemas.GroupWatchlistItemOut, status_code=201)
def add_group_watchlist_item(
    group_id: int,
    body: schemas.AddGroupWatchlistItemRequest,
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
    return _item_out(item)


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
    return _item_out(item)


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
