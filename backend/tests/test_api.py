import pytest

from docksight.ml.features import FEATURES


def test_health_is_public(client):
    assert client.get("/api/health").json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/api/portfolio/summary", "/api/markets", "/api/leases/expiring"])
def test_data_endpoints_require_auth(client, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers={"Authorization": "Bearer nope"}).status_code == 401


def test_bad_credentials_rejected(client):
    r = client.post("/api/auth/token", json={"username": "analyst", "password": "wrong"})
    assert r.status_code == 401


def test_portfolio_summary_is_consistent(client, auth):
    s = client.get("/api/portfolio/summary", headers=auth).json()
    assert 0.5 < s["occupancy"] <= 1
    assert s["leased_sqft"] <= s["total_sqft"]
    assert s["at_risk_24m_sqft"] <= s["expiring_24m_sqft"]
    assert s["expiring_12m_sqft"] <= s["expiring_24m_sqft"]
    assert 0 < s["expected_renewal_rate_24m"] < 1


def test_markets_roll_up_to_portfolio(client, auth):
    markets = client.get("/api/markets", headers=auth).json()
    summary = client.get("/api/portfolio/summary", headers=auth).json()
    assert sum(m["total_sqft"] for m in markets) == summary["total_sqft"]
    assert sum(m["at_risk_24m_sqft"] for m in markets) == summary["at_risk_24m_sqft"]


def test_expiry_schedule_matches_summary(client, auth):
    buckets = client.get("/api/portfolio/expiry-schedule?months=24", headers=auth).json()
    summary = client.get("/api/portfolio/summary", headers=auth).json()
    assert sum(b["high"] + b["medium"] + b["low"] for b in buckets) == summary["expiring_24m_sqft"]
    assert sum(b["high"] for b in buckets) == summary["at_risk_24m_sqft"]
    quarters = [b["quarter"] for b in buckets]
    assert quarters == sorted(quarters) and len(quarters) == 8  # Full quarters only.


def test_market_history(client, auth):
    history = client.get("/api/markets/atl/history", headers=auth).json()
    assert len(history) > 100
    assert client.get("/api/markets/XXX/history", headers=auth).status_code == 404


def test_expiring_leases_sorted_and_paginated(client, auth):
    r = client.get("/api/leases/expiring?months=24&limit=10", headers=auth).json()
    probs = [x["renewal_probability"] for x in r["items"]]
    assert len(probs) == 10 and probs == sorted(probs)
    assert all(x["months_to_expiry"] < 24 for x in r["items"])

    page2 = client.get("/api/leases/expiring?months=24&limit=10&offset=10", headers=auth).json()
    assert {x["lease_id"] for x in page2["items"]}.isdisjoint({x["lease_id"] for x in r["items"]})


def test_expiring_leases_filters(client, auth):
    r = client.get("/api/leases/expiring?band=high&market=DAL&limit=200", headers=auth).json()
    assert all(x["risk_band"] == "high" and x["market"] == "DAL" for x in r["items"])


def test_query_validation(client, auth):
    assert client.get("/api/leases/expiring?limit=5000", headers=auth).status_code == 422
    assert client.get("/api/leases/expiring?sort=bogus", headers=auth).status_code == 422


def test_lease_detail_matches_batch_score(client, auth):
    top = client.get("/api/leases/expiring?limit=1", headers=auth).json()["items"][0]
    detail = client.get(f"/api/leases/{top['lease_id']}", headers=auth).json()
    assert detail["renewal_probability"] == pytest.approx(top["renewal_probability"], abs=1e-3)
    assert len(detail["drivers"]) == len(FEATURES)
    assert client.get("/api/leases/999999", headers=auth).status_code == 404


def test_model_info(client, auth, artifact):
    assert client.get("/api/model", headers=auth).json()["version"] == artifact.version
