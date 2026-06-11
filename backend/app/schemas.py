from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models import WatchlistStatus, MediaType


# Auth
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token


# User
class UserOut(BaseModel):
    id: int
    email: str
    name: str
    avatar_url: Optional[str]
    default_region: str

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    default_region: Optional[str] = None
    name: Optional[str] = None


# Streaming Services
class StreamingServiceOut(BaseModel):
    id: int
    tmdb_provider_id: int
    provider_name: str
    provider_logo_path: Optional[str]
    region_override: Optional[str]

    model_config = {"from_attributes": True}


class AddStreamingServiceRequest(BaseModel):
    tmdb_provider_id: int
    provider_name: str
    provider_logo_path: Optional[str] = None
    region_override: Optional[str] = None


class UpdateStreamingServiceRequest(BaseModel):
    region_override: Optional[str] = None


# Watchlist
class WatchlistItemOut(BaseModel):
    id: int
    tmdb_id: int
    media_type: MediaType
    title: str
    poster_path: Optional[str]
    added_at: datetime
    status: WatchlistStatus

    model_config = {"from_attributes": True}


class AddWatchlistItemRequest(BaseModel):
    tmdb_id: int
    media_type: MediaType
    title: str
    poster_path: Optional[str] = None
    status: WatchlistStatus = WatchlistStatus.want_to_watch


class UpdateWatchlistStatusRequest(BaseModel):
    status: WatchlistStatus


# TMDB passthrough types (loosely typed since TMDB shapes vary)
class TMDBProvider(BaseModel):
    provider_id: int
    provider_name: str
    logo_path: Optional[str]
    display_priority: Optional[int] = None


# Recommendations
class RecommendationItem(BaseModel):
    tmdb_id: int
    media_type: str
    title: str
    poster_path: Optional[str]
    overview: Optional[str]
    reason: str
    available_on: list[str]
