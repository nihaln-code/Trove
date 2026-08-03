def test_guest_login_creates_a_guest_user_and_returns_tokens(client):
    resp = client.post("/auth/guest")
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body

    me = client.get("/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["is_guest"] is True
    assert me.json()["name"] == "Guest"


def test_guest_login_creates_a_distinct_user_each_time(client):
    first = client.post("/auth/guest").json()
    second = client.post("/auth/guest").json()

    me1 = client.get("/users/me", headers={"Authorization": f"Bearer {first['access_token']}"}).json()
    me2 = client.get("/users/me", headers={"Authorization": f"Bearer {second['access_token']}"}).json()

    assert me1["id"] != me2["id"]


def test_guest_can_use_the_watchlist(client):
    tokens = client.post("/auth/guest").json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    resp = client.post(
        "/watchlist",
        json={"tmdb_id": 550, "media_type": "movie", "title": "Fight Club"},
        headers=headers,
    )
    assert resp.status_code == 201


def test_guest_is_not_blocked_from_recommendations(client):
    tokens = client.post("/auth/guest").json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    resp = client.get("/recommendations", headers=headers)

    # Not authorization-blocked: a guest hits the same "set up your watchlist
    # and services first" gate any brand-new user would, not a guest-specific
    # 403 like the group endpoints.
    assert resp.status_code == 400
    assert "watchlist" in resp.json()["detail"].lower()


def test_google_login_race_reuses_existing_user_instead_of_500ing(client, db_session, monkeypatch):
    """Simulates a double-click / frontend retry: two near-simultaneous
    first-time logins for the same Google account race to insert the same
    google_id. The second request's pre-insert lookup misses (the row isn't
    committed yet), but by the time it inserts, the real unique constraint
    fires for real - it should recover by reusing the row, not 500."""
    from app import models

    fake_idinfo = {
        "sub": "google-race-test-id",
        "email": "race@example.com",
        "name": "Race Test",
        "picture": None,
    }
    monkeypatch.setattr(
        "app.routers.auth.id_token.verify_oauth2_token",
        lambda *a, **k: fake_idinfo,
    )

    # The "other" concurrent request already committed this row.
    db_session.add(models.User(
        google_id="google-race-test-id", email="race@example.com", name="Race Test",
    ))
    db_session.commit()

    # Make our request's pre-insert lookup miss it anyway, as if it ran
    # just before the other request's commit landed.
    from sqlalchemy.orm import Query as OrmQuery
    real_first = OrmQuery.first
    state = {"calls": 0}

    def first_missing_once(self):
        state["calls"] += 1
        if state["calls"] == 1:
            return None
        return real_first(self)

    monkeypatch.setattr(OrmQuery, "first", first_missing_once)

    resp = client.post("/auth/google", json={"credential": "fake-credential"})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
