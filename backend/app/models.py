import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, UniqueConstraint
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

    user = relationship("User", back_populates="watchlist")

    __table_args__ = (UniqueConstraint("user_id", "tmdb_id", "media_type"),)
