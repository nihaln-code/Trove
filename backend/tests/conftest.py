import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://trove_test:trove_test@localhost:5432/trove_test",
)
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("TMDB_API_KEY", "test-tmdb-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

import pytest
from fastapi.testclient import TestClient

from app import auth, models
from app.database import Base, SessionLocal, engine, get_db
from app.main import app


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session, monkeypatch):
    # Watchlist/group item creation schedules a background TMDB metadata
    # enrichment call; stub it out so tests never depend on network access.
    monkeypatch.setattr("app.routers.watchlist.tmdb_get", lambda *a, **k: {})
    monkeypatch.setattr("app.routers.groups.tmdb_get", lambda *a, **k: {})

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def make_user(db_session):
    counter = {"n": 0}

    def _make(email: str | None = None, name: str = "Test User") -> models.User:
        counter["n"] += 1
        email = email or f"user{counter['n']}@example.com"
        user = models.User(email=email, name=name, google_id=f"google-{email}")
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _make


@pytest.fixture()
def make_guest(db_session):
    counter = {"n": 0}

    def _make() -> models.User:
        counter["n"] += 1
        guest_id = f"test-guest-{counter['n']}"
        user = models.User(
            email=f"{guest_id}@guest.trove.local",
            name="Guest",
            google_id=f"guest-{guest_id}",
            is_guest=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _make


@pytest.fixture()
def auth_headers():
    def _headers(user: models.User) -> dict:
        token = auth.create_access_token(user.id)
        return {"Authorization": f"Bearer {token}"}

    return _headers
