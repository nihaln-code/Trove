def _create_group(client, headers, name="Movie Night"):
    resp = client.post("/groups", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.json()


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
