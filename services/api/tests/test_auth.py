import pytest

from app import deps
from app.config import settings
from app.main import app

A = {"X-Test-User": "alice"}
B = {"X-Test-User": "bob"}


async def _seed(client, headers=A):
    return (await client.post("/v1/demo/seed", headers=headers)).json()["family_id"]


async def _people(client, fid, headers=A):
    return (await client.get(f"/v1/families/{fid}/people", headers=headers)).json()


# ---------- isolation: one family can never see another ----------
async def test_other_users_cannot_touch_my_family(client):
    fid = await _seed(client)
    people = await _people(client, fid)
    maa = next(p for p in people if "Maa" in p["name"])["id"]
    task = (await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay electricity bill Rs 9,000"}, headers=A)).json()
    appr = task["approvals"][0]["id"]

    reads = [f"/v1/families/{fid}", f"/v1/families/{fid}/people", f"/v1/families/{fid}/tasks", f"/v1/families/{fid}/approvals",
             f"/v1/families/{fid}/consents", f"/v1/families/{fid}/documents", f"/v1/families/{fid}/notifications",
             f"/v1/families/{fid}/audit", f"/v1/families/{fid}/digest", f"/v1/families/{fid}/members",
             f"/v1/tasks/{task['id']}", f"/v1/people/{maa}/health"]
    for url in reads:
        assert (await client.get(url, headers=B)).status_code == 404, url

    writes = [("post", f"/v1/families/{fid}/tasks", {"goal": "x"}), ("post", f"/v1/families/{fid}/sos", {}),
              ("post", f"/v1/families/{fid}/people", {"name": "x", "role": "parent"}),
              ("post", f"/v1/families/{fid}/documents", {"title": "x"}),
              ("post", f"/v1/families/{fid}/consents", {"grantee": "x", "scope": "health.read"}),
              ("patch", f"/v1/families/{fid}/limits", {"auto_approve_limit_inr": 999999}),
              ("post", f"/v1/approvals/{appr}/decision", {"approve": True}),
              ("post", f"/v1/people/{maa}/checkin", None), ("post", f"/v1/people/{maa}/emergency-card", None),
              ("post", f"/v1/tasks/{task['id']}/caregiver-link", None), ("post", f"/v1/families/{fid}/guardian/run", None)]
    for method, url, body in writes:
        r = await getattr(client, method)(url, headers=B, **({"json": body} if body is not None else {}))
        assert r.status_code == 404, (method, url, r.status_code)

    # the approval was NOT released by the intruder, and the limit is unchanged
    assert (await client.get(f"/v1/families/{fid}", headers=A)).json()["auto_approve_limit_inr"] == 2500
    assert (await client.get(f"/v1/tasks/{task['id']}", headers=A)).json()["status"] == "awaiting_approval"


async def test_my_families_lists_only_mine(client):
    fa = await _seed(client, A)
    fb = await _seed(client, B)
    mine_a = {f["id"] for f in (await client.get("/v1/me/families", headers=A)).json()}
    mine_b = {f["id"] for f in (await client.get("/v1/me/families", headers=B)).json()}
    assert fa in mine_a and fb not in mine_a and fb in mine_b and fa not in mine_b


# ---------- roles ----------
async def test_relative_can_help_but_not_release_money_or_change_rules(client):
    fid = await _seed(client)
    assert (await client.post(f"/v1/families/{fid}/members", json={"email": "bob@test.dev", "role": "relative"}, headers=A)).status_code == 200
    assert (await client.get(f"/v1/families/{fid}/people", headers=B)).status_code == 200  # invite claimed on first use

    t = await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay electricity bill Rs 9,000"}, headers=B)
    assert t.status_code == 200
    appr = t.json()["approvals"][0]["id"]
    assert (await client.post(f"/v1/approvals/{appr}/decision", json={"approve": True}, headers=B)).status_code == 403
    assert (await client.patch(f"/v1/families/{fid}/limits", json={"auto_approve_limit_inr": 99999}, headers=B)).status_code == 403
    assert (await client.post(f"/v1/families/{fid}/consents", json={"grantee": "x", "scope": "id.unmask"}, headers=B)).status_code == 403
    assert (await client.post(f"/v1/families/{fid}/members", json={"email": "c@test.dev"}, headers=B)).status_code == 403
    assert (await client.post(f"/v1/approvals/{appr}/decision", json={"approve": True}, headers=A)).status_code == 200


async def test_parent_role_is_limited_to_checkin_and_sos(client):
    fid = await _seed(client)
    await client.post(f"/v1/families/{fid}/members", json={"email": "bob@test.dev", "role": "parent"}, headers=A)
    maa = next(p for p in await _people(client, fid) if "Maa" in p["name"])["id"]
    assert (await client.post(f"/v1/people/{maa}/checkin", headers=B)).status_code == 200
    assert (await client.post(f"/v1/families/{fid}/sos", json={"person_id": maa}, headers=B)).status_code == 200
    assert (await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay bill Rs 1"}, headers=B)).status_code == 403
    assert (await client.post(f"/v1/families/{fid}/documents", json={"title": "x"}, headers=B)).status_code == 403
    assert (await client.get(f"/v1/people/{maa}/health?unmask=true", headers=B)).status_code == 403


async def test_removed_member_loses_access(client):
    fid = await _seed(client)
    await client.post(f"/v1/families/{fid}/members", json={"email": "bob@test.dev", "role": "relative"}, headers=A)
    await client.get(f"/v1/families/{fid}", headers=B)
    members = (await client.get(f"/v1/families/{fid}/members", headers=A)).json()
    bob = next(m for m in members if m["email"] == "bob@test.dev")
    assert (await client.delete(f"/v1/families/{fid}/members/{bob['id']}", headers=A)).status_code == 200
    assert (await client.get(f"/v1/families/{fid}", headers=B)).status_code == 404
    me = next(m for m in members if m["role"] == "sponsor")
    assert (await client.delete(f"/v1/families/{fid}/members/{me['id']}", headers=A)).status_code == 409


# ---------- real token path (test override removed) ----------
@pytest.fixture
def real_auth():
    saved = app.dependency_overrides.pop(deps.current_user)
    deps._CACHE.clear()
    yield
    app.dependency_overrides[deps.current_user] = saved


async def test_requests_without_a_token_are_rejected(client, real_auth):
    for url in ("/v1/me/families", "/v1/auth/me", "/v1/families/anything"):
        assert (await client.get(url)).status_code == 401
    assert (await client.post("/v1/demo/seed")).status_code == 401
    assert (await client.get("/v1/me/families", headers={"Authorization": "Bearer"})).status_code == 401


async def test_token_is_verified_with_supabase_and_cached(client, real_auth, monkeypatch):
    calls = []

    async def fake_verify(token):
        calls.append(token)
        if token != "good":
            raise deps.HTTPException(401, "your session has expired, please sign in again")
        return deps.AuthUser(id="u-real", email="real@x.dev", name="Real")

    monkeypatch.setattr(deps, "verify_token", fake_verify)
    ok = await client.get("/v1/auth/me", headers={"Authorization": "Bearer good"})
    assert ok.status_code == 200 and ok.json()["email"] == "real@x.dev"
    await client.get("/v1/auth/me", headers={"Authorization": "Bearer good"})
    assert calls.count("good") == 1  # second call served from the 60s cache
    assert (await client.get("/v1/auth/me", headers={"Authorization": "Bearer forged"})).status_code == 401


async def test_signup_validates_input(client, monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "http://127.0.0.1:9")
    assert (await client.post("/v1/auth/signup", json={"email": "nope", "password": "longenough1"})).status_code == 422
    assert (await client.post("/v1/auth/signup", json={"email": "a@b.co", "password": "short"})).status_code == 422
