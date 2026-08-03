from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession

from app import models


def _service_payload(tmdb_provider_id: int = 8) -> dict:
    return {
        "tmdb_provider_id": tmdb_provider_id,
        "provider_name": "Netflix",
        "provider_logo_path": "/logo.png",
    }


def test_add_service_race_returns_clean_error_not_500(client, make_user, auth_headers, monkeypatch):
    user = make_user()

    def failing_commit(self):
        raise IntegrityError("stmt", {}, Exception("duplicate key"))
    monkeypatch.setattr(OrmSession, "commit", failing_commit)

    resp = client.post("/streaming-services", json=_service_payload(), headers=auth_headers(user))
    assert resp.status_code == 400


def test_adding_service_invalidates_group_recommendation_caches(client, make_user, auth_headers, db_session):
    owner = make_user(email="owner@example.com")
    other_owner = make_user(email="other@example.com")

    group_a = client.post("/groups", json={"name": "Group A"}, headers=auth_headers(owner)).json()
    # A cache row for a group this user has nothing to do with must survive untouched.
    group_b = client.post("/groups", json={"name": "Group B"}, headers=auth_headers(other_owner)).json()

    db_session.add_all([
        models.GroupRecommendationCache(group_id=group_a["id"], user_id=owner.id, items="[]"),
        models.GroupRecommendationCache(group_id=group_b["id"], user_id=other_owner.id, items="[]"),
    ])
    db_session.commit()

    resp = client.post("/streaming-services", json=_service_payload(), headers=auth_headers(owner))
    assert resp.status_code == 201

    remaining_a = db_session.query(models.GroupRecommendationCache).filter_by(group_id=group_a["id"]).all()
    remaining_b = db_session.query(models.GroupRecommendationCache).filter_by(group_id=group_b["id"]).all()
    assert remaining_a == []
    assert len(remaining_b) == 1


def test_removing_service_invalidates_group_recommendation_caches(client, make_user, auth_headers, db_session):
    owner = make_user()
    group = client.post("/groups", json={"name": "Movie Night"}, headers=auth_headers(owner)).json()

    added = client.post("/streaming-services", json=_service_payload(), headers=auth_headers(owner)).json()

    db_session.add(models.GroupRecommendationCache(group_id=group["id"], user_id=owner.id, items="[]"))
    db_session.commit()

    resp = client.delete(f"/streaming-services/{added['id']}", headers=auth_headers(owner))
    assert resp.status_code == 204

    remaining = db_session.query(models.GroupRecommendationCache).filter_by(group_id=group["id"]).all()
    assert remaining == []
