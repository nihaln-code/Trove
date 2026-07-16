import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, UniqueConstraint, Text
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    google_id = Column(String, unique=True, nullable=False)
    avatar_url = Column(String)
    default_region = Column(String(10), default="US", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    streaming_services = relationship("UserStreamingService", back_populates="user", cascade="all, delete-orphan")
    watchlist = relationship("WatchlistItem", back_populates="user", cascade="all, delete-orphan")
    group_memberships = relationship("GroupMembership", back_populates="user", cascade="all, delete-orphan")


class UserStreamingService(Base):
    __tablename__ = "user_streaming_services"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tmdb_provider_id = Column(Integer, nullable=False)
    provider_name = Column(String, nullable=False)
    provider_logo_path = Column(String)
    # null = inherit user's default_region
    region_override = Column(String(10), nullable=True)

    user = relationship("User", back_populates="streaming_services")

    __table_args__ = (UniqueConstraint("user_id", "tmdb_provider_id"),)


class WatchlistStatus(str, enum.Enum):
    want_to_watch = "want_to_watch"
    watching = "watching"
    watched = "watched"


class MediaType(str, enum.Enum):
    movie = "movie"
    tv = "tv"


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tmdb_id = Column(Integer, nullable=False)
    media_type = Column(Enum(MediaType), nullable=False)
    title = Column(String, nullable=False)
    poster_path = Column(String)
    added_at = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(WatchlistStatus), default=WatchlistStatus.want_to_watch, nullable=False)
    rating = Column(Integer, nullable=True)  # 1 = liked, -1 = disliked
    metadata_json = Column(Text, nullable=True)  # JSON: {genre_ids, cast, director, runtime, vote_average}

    user = relationship("User", back_populates="watchlist")

    __table_args__ = (UniqueConstraint("user_id", "tmdb_id", "media_type"),)


class RecommendationCache(Base):
    __tablename__ = "recommendation_cache"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    items = Column(Text, nullable=False)       # JSON array of recommendation objects
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class GroupRecommendationCache(Base):
    __tablename__ = "group_recommendation_cache"

    group_id = Column(Integer, ForeignKey("groups.id"), primary_key=True)
    items = Column(Text, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)


class GroupRole(str, enum.Enum):
    owner = "owner"
    member = "member"


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    invite_code = Column(String, unique=True, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    members = relationship("GroupMembership", back_populates="group", cascade="all, delete-orphan")
    items = relationship("GroupWatchlistItem", back_populates="group", cascade="all, delete-orphan")


class GroupMembership(Base):
    __tablename__ = "group_memberships"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(Enum(GroupRole), default=GroupRole.member, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("Group", back_populates="members")
    user = relationship("User", back_populates="group_memberships")

    __table_args__ = (UniqueConstraint("group_id", "user_id"),)


class RecommendationReasonCache(Base):
    __tablename__ = "recommendation_reason_cache"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tmdb_id = Column(Integer, nullable=False)
    media_type = Column(String(10), nullable=False)
    reason = Column(Text, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "tmdb_id", "media_type"),)


class GroupExcludedService(Base):
    """A provider a member explicitly removed from the group's active list.

    The group's active services are always the union of every member's
    personal streaming services (plus anything in GroupAddedService), minus
    whatever's excluded here, so newly added personal services automatically
    flow into every group, and members can opt specific ones back out rather
    than freezing the whole list.
    """
    __tablename__ = "group_excluded_services"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    tmdb_provider_id = Column(Integer, nullable=False)

    __table_args__ = (UniqueConstraint("group_id", "tmdb_provider_id"),)


class GroupAddedService(Base):
    """A provider a member explicitly added to the group that isn't part of
    any member's personal streaming services, lets a group opt in to a
    service none of its members personally use, without touching anyone's
    personal service list.
    """
    __tablename__ = "group_added_services"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    tmdb_provider_id = Column(Integer, nullable=False)
    provider_name = Column(String, nullable=False)
    provider_logo_path = Column(String, nullable=True)

    __table_args__ = (UniqueConstraint("group_id", "tmdb_provider_id"),)


class GroupWatchlistItem(Base):
    __tablename__ = "group_watchlist_items"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    tmdb_id = Column(Integer, nullable=False)
    media_type = Column(Enum(MediaType), nullable=False)
    title = Column(String, nullable=False)
    poster_path = Column(String)
    added_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(WatchlistStatus), default=WatchlistStatus.want_to_watch, nullable=False)

    metadata_json = Column(Text, nullable=True)  # JSON: {genre_ids, cast, director, runtime, vote_average, original_language}

    group = relationship("Group", back_populates="items")
    added_by = relationship("User", foreign_keys=[added_by_user_id])
    member_ratings = relationship("GroupItemRating", back_populates="group_watchlist_item", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("group_id", "tmdb_id", "media_type"),)


class GroupItemRating(Base):
    __tablename__ = "group_item_ratings"

    id = Column(Integer, primary_key=True, index=True)
    group_watchlist_item_id = Column(Integer, ForeignKey("group_watchlist_items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1 = liked, -1 = disliked

    group_watchlist_item = relationship("GroupWatchlistItem", back_populates="member_ratings")
    user = relationship("User")

    __table_args__ = (UniqueConstraint("group_watchlist_item_id", "user_id"),)
