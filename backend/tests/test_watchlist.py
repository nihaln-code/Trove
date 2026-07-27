def _item_payload(tmdb_id: int = 550) -> dict:
    return {
        "tmdb_id": tmdb_id,
        "media_type": "movie",
        "title": "Fight Club",
        "poster_path": "/poster.jpg",
    }


def test_add_and_list_watchlist_item(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    resp = client.post("/watchlist", json=_item_payload(), headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["tmdb_id"] == 550
    assert body["status"] == "want_to_watch"

    resp = client.get("/watchlist", headers=headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["title"] == "Fight Club"


def test_add_duplicate_watchlist_item_rejected(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    first = client.post("/watchlist", json=_item_payload(), headers=headers)
    assert first.status_code == 201

    second = client.post("/watchlist", json=_item_payload(), headers=headers)
    assert second.status_code == 400


def test_update_watchlist_item_status_and_rating(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    created = client.post("/watchlist", json=_item_payload(), headers=headers).json()

    resp = client.patch(
        f"/watchlist/{created['id']}",
        json={"status": "watched", "rating": 1},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "watched"
    assert body["rating"] == 1


def test_update_watchlist_item_rejects_invalid_rating(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    created = client.post("/watchlist", json=_item_payload(), headers=headers).json()

    resp = client.patch(
        f"/watchlist/{created['id']}",
        json={"rating": 3},
        headers=headers,
    )
    assert resp.status_code == 422


def test_remove_watchlist_item(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    created = client.post("/watchlist", json=_item_payload(), headers=headers).json()

    resp = client.delete(f"/watchlist/{created['id']}", headers=headers)
    assert resp.status_code == 204

    resp = client.get("/watchlist", headers=headers)
    assert resp.json() == []


def test_watchlist_requires_auth(client):
    resp = client.get("/watchlist")
    assert resp.status_code == 403  # no bearer credentials supplied


def test_cannot_modify_another_users_watchlist_item(client, make_user, auth_headers):
    owner = make_user(email="owner@example.com")
    intruder = make_user(email="intruder@example.com")

    created = client.post(
        "/watchlist", json=_item_payload(), headers=auth_headers(owner)
    ).json()

    resp = client.patch(
        f"/watchlist/{created['id']}",
        json={"status": "watched"},
        headers=auth_headers(intruder),
    )
    assert resp.status_code == 404

    resp = client.delete(f"/watchlist/{created['id']}", headers=auth_headers(intruder))
    assert resp.status_code == 404
