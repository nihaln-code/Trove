import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
from app.models import WatchlistStatus, MediaType, GroupRole


# Auth
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token


class RefreshTokenRequest(BaseModel):
    refresh_token: str


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

    @field_validator("default_region")
    @classmethod
    def validate_region(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^[A-Za-z]{2}$", v):
            raise ValueError("default_region must be a 2-letter country code (e.g. US)")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) == 0:
                raise ValueError("name cannot be empty")
            if len(v) > 100:
                raise ValueError("name must be 100 characters or fewer")
        return v


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

    @field_validator("region_override")
    @classmethod
    def validate_region_override(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^[A-Za-z]{2}$", v):
            raise ValueError("region_override must be a 2-letter country code (e.g. US)")
        return v


class UpdateStreamingServiceRequest(BaseModel):
    region_override: Optional[str] = None

    @field_validator("region_override")
    @classmethod
    def validate_region_override(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^[A-Za-z]{2}$", v):
            raise ValueError("region_override must be a 2-letter country code (e.g. US)")
        return v


# Watchlist
class WatchlistItemOut(BaseModel):
    id: int
    tmdb_id: int
    media_type: MediaType
    title: str
    poster_path: Optional[str]
    added_at: datetime
    status: WatchlistStatus
    rating: Optional[int] = None

    model_config = {"from_attributes": True}


class AddWatchlistItemRequest(BaseModel):
    tmdb_id: int
    media_type: MediaType
    title: str
    poster_path: Optional[str] = None
    status: WatchlistStatus = WatchlistStatus.want_to_watch


class UpdateWatchlistItemRequest(BaseModel):
    status: Optional[WatchlistStatus] = None
    rating: Optional[int] = None

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v not in (1, -1):
            raise ValueError("rating must be 1 (liked) or -1 (disliked)")
        return v


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


# Groups
class GroupMemberOut(BaseModel):
    user_id: int
    name: str
    email: str
    avatar_url: Optional[str]
    role: GroupRole
    joined_at: datetime


class GroupOut(BaseModel):
    id: int
    name: str
    invite_code: str
    owner_id: int
    created_at: datetime
    member_count: int


class GroupDetailOut(GroupOut):
    members: list[GroupMemberOut]


class CreateGroupRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) == 0:
            raise ValueError("name cannot be empty")
        if len(v) > 100:
            raise ValueError("name must be 100 characters or fewer")
        return v


class JoinGroupRequest(BaseModel):
    invite_code: str

    @field_validator("invite_code")
    @classmethod
    def validate_invite_code(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[A-Za-z0-9]{1,16}$", v):
            raise ValueError("Invalid invite code format")
        return v.upper()


class GroupWatchlistItemOut(BaseModel):
    id: int
    tmdb_id: int
    media_type: MediaType
    title: str
    poster_path: Optional[str]
    added_at: datetime
    added_by_user_id: int
    added_by_name: str
    status: WatchlistStatus


class AddGroupWatchlistItemRequest(BaseModel):
    tmdb_id: int
    media_type: MediaType
    title: str
    poster_path: Optional[str] = None
    status: WatchlistStatus = WatchlistStatus.want_to_watch


class UpdateGroupWatchlistItemRequest(BaseModel):
    status: Optional[WatchlistStatus] = None
