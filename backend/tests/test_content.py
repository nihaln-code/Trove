def _fake_tmdb_get(discover_results=None, providers_by_path=None):
    """Builds a stand-in for app.routers.content.tmdb_get that answers
    /discover/*, /search/multi, and .../watch/providers without hitting TMDB."""
    discover_results = discover_results or []
    providers_by_path = providers_by_path or {}

    def _fake(path: str, params: dict | None = None) -> dict:
        if path.startswith("/discover/"):
            return {"results": discover_results}
        if path == "/search/multi":
            return {"results": discover_results, "total_pages": 1}
        if path.endswith("/watch/providers"):
            return providers_by_path
        return {}

    return _fake


def test_regular_user_without_services_gets_empty_browse(client, make_user, auth_headers):
    user = make_user()

    resp = client.get(
        "/content/browse", params={"media_type": "movie"}, headers=auth_headers(user)
    )
    assert resp.status_code == 200
    assert resp.json() == {"results": [], "total_pages": 0, "total_results": 0}


def test_guest_can_browse_without_streaming_services(client, make_guest, auth_headers, monkeypatch):
    guest = make_guest()
    fake = _fake_tmdb_get(
        discover_results=[
            {"id": 550, "title": "Fight Club", "poster_path": None, "overview": "", "vote_average": 8.4, "popularity": 50}
        ],
        providers_by_path={"results": {"US": {"flatrate": [{"provider_id": 8, "provider_name": "Netflix"}]}}},
    )
    monkeypatch.setattr("app.routers.content.tmdb_get", fake)

    resp = client.get(
        "/content/browse", params={"media_type": "movie"}, headers=auth_headers(guest)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["results"]) == 1
    assert body["results"][0]["available_on"] == ["Netflix"]


def test_guest_search_shows_availability_across_all_providers(client, make_guest, auth_headers, monkeypatch):
    guest = make_guest()
    fake = _fake_tmdb_get(
        discover_results=[{"id": 550, "media_type": "movie", "title": "Fight Club"}],
        providers_by_path={
            "results": {
                "US": {
                    "flatrate": [
                        {"provider_id": 8, "provider_name": "Netflix"},
                        {"provider_id": 9, "provider_name": "Hulu"},
                    ]
                }
            }
        },
    )
    monkeypatch.setattr("app.routers.content.tmdb_get", fake)

    resp = client.get(
        "/content/search", params={"query": "fight club"}, headers=auth_headers(guest)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert sorted(body["results"][0]["available_on"]) == ["Hulu", "Netflix"]
