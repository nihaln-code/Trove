from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as OrmSession

from app import models


def _create_group(client, headers, name="Movie Night"):
    resp = client.post("/groups", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.json()


def _break_next_commit(monkeypatch):
    """Makes the next Session.commit() call raise IntegrityError, standing in
    for a concurrent request that wins the same unique-constraint race."""
    def failing_commit(self):
        raise IntegrityError("stmt", {}, Exception("duplicate key"))
    monkeypatch.setattr(OrmSession, "commit", failing_commit)


def test_create_group_makes_creator_the_owner(client, make_user, auth_headers):
    user = make_user()
    group = _create_group(client, auth_headers(user))

    assert group["owner_id"] == user.id
    assert group["member_count"] == 1
    assert len(group["invite_code"]) > 0


def test_join_group_with_invite_code(client, make_user, auth_headers):
    owner = make_user(email="owner@example.com")
    joiner = make_user(email="joiner@example.com")
    group = _create_group(client, auth_headers(owner))

    resp = client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(joiner),
    )
    assert resp.status_code == 201
    assert resp.json()["member_count"] == 2


def test_join_group_invalid_code_returns_404(client, make_user, auth_headers):
    user = make_user()
    resp = client.post(
        "/groups/join", json={"invite_code": "NOTREAL1"}, headers=auth_headers(user)
    )
    assert resp.status_code == 404


def test_joining_twice_is_rejected(client, make_user, auth_headers):
    owner = make_user(email="owner@example.com")
    joiner = make_user(email="joiner@example.com")
    group = _create_group(client, auth_headers(owner))

    client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(joiner),
    )
    resp = client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(joiner),
    )
    assert resp.status_code == 400


def test_non_member_cannot_view_group(client, make_user, auth_headers):
    owner = make_user(email="owner@example.com")
    outsider = make_user(email="outsider@example.com")
    group = _create_group(client, auth_headers(owner))

    resp = client.get(f"/groups/{group['id']}", headers=auth_headers(outsider))
    assert resp.status_code == 403


def test_non_member_cannot_add_group_watchlist_item(client, make_user, auth_headers):
    owner = make_user(email="owner@example.com")
    outsider = make_user(email="outsider@example.com")
    group = _create_group(client, auth_headers(owner))

    resp = client.post(
        f"/groups/{group['id']}/watchlist",
        json={"tmdb_id": 550, "media_type": "movie", "title": "Fight Club"},
        headers=auth_headers(outsider),
    )
    assert resp.status_code == 403


def test_member_can_add_and_list_group_watchlist_item(client, make_user, auth_headers):
    owner = make_user(email="owner@example.com")
    group = _create_group(client, auth_headers(owner))

    resp = client.post(
        f"/groups/{group['id']}/watchlist",
        json={"tmdb_id": 550, "media_type": "movie", "title": "Fight Club"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    assert resp.json()["added_by_name"] == owner.name

    resp = client.get(f"/groups/{group['id']}/watchlist", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_only_owner_can_delete_group(client, make_user, auth_headers):
    owner = make_user(email="owner@example.com")
    member = make_user(email="member@example.com")
    group = _create_group(client, auth_headers(owner))

    client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(member),
    )

    resp = client.delete(f"/groups/{group['id']}", headers=auth_headers(member))
    assert resp.status_code == 403

    resp = client.delete(f"/groups/{group['id']}", headers=auth_headers(owner))
    assert resp.status_code == 204


def test_owner_cannot_leave_without_deleting(client, make_user, auth_headers):
    owner = make_user()
    group = _create_group(client, auth_headers(owner))

    resp = client.delete(f"/groups/{group['id']}/members/me", headers=auth_headers(owner))
    assert resp.status_code == 403


def test_guest_cannot_create_group(client, make_guest, auth_headers):
    guest = make_guest()

    resp = client.post("/groups", json={"name": "Movie Night"}, headers=auth_headers(guest))
    assert resp.status_code == 403


def test_guest_cannot_join_group(client, make_user, make_guest, auth_headers):
    owner = make_user(email="owner@example.com")
    guest = make_guest()
    group = _create_group(client, auth_headers(owner))

    resp = client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(guest),
    )
    assert resp.status_code == 403


def test_guest_can_preview_a_group_invite(client, make_user, make_guest, auth_headers):
    owner = make_user(email="owner@example.com")
    guest = make_guest()
    group = _create_group(client, auth_headers(owner))

    # Preview is intentionally guest-accessible (read-only) so the invite
    # link's landing page can show what's being joined before the guest is
    # told they need to sign in with Google to actually join.
    resp = client.get(f"/groups/preview/{group['invite_code']}", headers=auth_headers(guest))
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == group["name"]
    assert body["already_member"] is False


def test_join_group_race_returns_clean_error_not_500(client, make_user, auth_headers, monkeypatch):
    owner = make_user(email="owner@example.com")
    joiner = make_user(email="joiner@example.com")
    group = _create_group(client, auth_headers(owner))

    _break_next_commit(monkeypatch)
    resp = client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(joiner),
    )
    assert resp.status_code == 400


def test_add_group_watchlist_item_race_returns_clean_error_not_500(client, make_user, auth_headers, monkeypatch):
    owner = make_user()
    group = _create_group(client, auth_headers(owner))

    _break_next_commit(monkeypatch)
    resp = client.post(
        f"/groups/{group['id']}/watchlist",
        json={"tmdb_id": 550, "media_type": "movie", "title": "Fight Club"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400


def test_set_group_services_race_does_not_500(client, make_user, auth_headers, monkeypatch):
    owner = make_user()
    group = _create_group(client, auth_headers(owner))

    _break_next_commit(monkeypatch)
    resp = client.put(
        f"/groups/{group['id']}/services",
        json={"services": [{"tmdb_provider_id": 8, "provider_name": "Netflix"}]},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200


def test_group_recommendations_cache_is_scoped_per_member(client, make_user, auth_headers, db_session):
    owner = make_user(email="owner@example.com")
    member = make_user(email="member@example.com")
    group = _create_group(client, auth_headers(owner))
    client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(member),
    )

    db_session.add_all([
        models.GroupRecommendationCache(
            group_id=group["id"], user_id=owner.id, items='[{"title": "Owner Pick"}]',
        ),
        models.GroupRecommendationCache(
            group_id=group["id"], user_id=member.id, items='[{"title": "Member Pick"}]',
        ),
    ])
    db_session.commit()

    owner_resp = client.get(f"/groups/{group['id']}/recommendations", headers=auth_headers(owner))
    member_resp = client.get(f"/groups/{group['id']}/recommendations", headers=auth_headers(member))

    assert owner_resp.json()["items"][0]["title"] == "Owner Pick"
    assert member_resp.json()["items"][0]["title"] == "Member Pick"


def test_joining_group_invalidates_its_recommendation_cache(client, make_user, auth_headers, db_session):
    owner = make_user(email="owner@example.com")
    joiner = make_user(email="joiner@example.com")
    group = _create_group(client, auth_headers(owner))

    db_session.add(models.GroupRecommendationCache(group_id=group["id"], user_id=owner.id, items="[]"))
    db_session.commit()

    client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(joiner),
    )

    remaining = db_session.query(models.GroupRecommendationCache).filter_by(group_id=group["id"]).all()
    assert remaining == []


def test_leaving_group_invalidates_recommendation_cache(client, make_user, auth_headers, db_session):
    owner = make_user(email="owner@example.com")
    member = make_user(email="member@example.com")
    group = _create_group(client, auth_headers(owner))
    client.post(
        "/groups/join",
        json={"invite_code": group["invite_code"]},
        headers=auth_headers(member),
    )

    db_session.add(models.GroupRecommendationCache(group_id=group["id"], user_id=owner.id, items="[]"))
    db_session.commit()

    client.delete(f"/groups/{group['id']}/members/me", headers=auth_headers(member))

    remaining = db_session.query(models.GroupRecommendationCache).filter_by(group_id=group["id"]).all()
    assert remaining == []


def test_setting_group_services_invalidates_recommendation_cache(client, make_user, auth_headers, db_session):
    owner = make_user()
    group = _create_group(client, auth_headers(owner))

    db_session.add(models.GroupRecommendationCache(group_id=group["id"], user_id=owner.id, items="[]"))
    db_session.commit()

    resp = client.put(
        f"/groups/{group['id']}/services",
        json={"services": [{"tmdb_provider_id": 8, "provider_name": "Netflix"}]},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200

    remaining = db_session.query(models.GroupRecommendationCache).filter_by(group_id=group["id"]).all()
    assert remaining == []
