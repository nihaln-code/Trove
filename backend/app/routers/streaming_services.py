from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/streaming-services", tags=["streaming-services"])


@router.get("", response_model=list[schemas.StreamingServiceOut])
def get_my_services(current_user: models.User = Depends(auth.get_current_user)):
    return current_user.streaming_services


@router.post("", response_model=schemas.StreamingServiceOut, status_code=201)
def add_service(
    body: schemas.AddStreamingServiceRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    existing = (
        db.query(models.UserStreamingService)
        .filter_by(user_id=current_user.id, tmdb_provider_id=body.tmdb_provider_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Service already added")

    service = models.UserStreamingService(
        user_id=current_user.id,
        tmdb_provider_id=body.tmdb_provider_id,
        provider_name=body.provider_name,
        provider_logo_path=body.provider_logo_path,
        region_override=body.region_override.upper() if body.region_override else None,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/{service_id}", response_model=schemas.StreamingServiceOut)
def update_service_region(
    service_id: int,
    body: schemas.UpdateStreamingServiceRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    service = (
        db.query(models.UserStreamingService)
        .filter_by(id=service_id, user_id=current_user.id)
        .first()
    )
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    # Pass null explicitly to clear the override
    service.region_override = body.region_override.upper() if body.region_override else None
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=204)
def remove_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    service = (
        db.query(models.UserStreamingService)
        .filter_by(id=service_id, user_id=current_user.id)
        .first()
    )
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    db.delete(service)
    db.commit()
