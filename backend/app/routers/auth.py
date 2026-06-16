import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from app.database import get_db
from app.config import settings
from app import models, schemas, auth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google", response_model=schemas.TokenResponse)
async def google_login(body: schemas.GoogleAuthRequest, db: Session = Depends(get_db)):
    try:
        idinfo = id_token.verify_oauth2_token(
            body.credential,
            google_requests.Request(),
            settings.google_client_id,
            clock_skew_in_seconds=10,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Google token: {e}")

    google_id = idinfo["sub"]
    email = idinfo["email"]
    name = idinfo.get("name", email.split("@")[0])
    avatar_url = idinfo.get("picture")

    user = db.query(models.User).filter(models.User.google_id == google_id).first()
    if not user:
        user = models.User(
            google_id=google_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.name = name
        user.avatar_url = avatar_url
        db.commit()

    return schemas.TokenResponse(
        access_token=auth.create_access_token(user.id),
        refresh_token=auth.create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=schemas.TokenResponse)
def refresh_tokens(
    credentials: dict,
    db: Session = Depends(get_db),
):
    token = credentials.get("refresh_token")
    if not token:
        raise HTTPException(status_code=400, detail="refresh_token required")

    user_id = auth.decode_token(token, token_type="refresh")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return schemas.TokenResponse(
        access_token=auth.create_access_token(user.id),
        refresh_token=auth.create_refresh_token(user.id),
    )
