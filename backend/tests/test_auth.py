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
