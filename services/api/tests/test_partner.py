from app.routes.partner import sign


async def _partner(client, kind="hospital"):
    r = (await client.post("/v1/partners", json={"name": "Ruby Hall", "kind": kind})).json()
    return r["partner_id"], {"X-API-Key": r["api_key"]}


async def _maa(client, fid):
    people = (await client.get(f"/v1/families/{fid}/people")).json()
    return next(p for p in people if "Maa" in p["name"])["id"]


async def test_requires_valid_key(client, fid):
    assert (await client.get("/v1/partner/v1/me")).status_code == 401
    assert (await client.get("/v1/partner/v1/me", headers={"X-API-Key": "nope"})).status_code == 401


async def test_no_consent_no_data_then_grant_then_revoke(client, fid):
    pid, h = await _partner(client)
    maa = await _maa(client, fid)
    url = f"/v1/partner/v1/families/{fid}/emergency-packet?person_id={maa}"
    assert (await client.get(url, headers=h)).status_code == 403  # the family has not consented

    await client.post(f"/v1/families/{fid}/consents", json={"grantee": f"partner:{pid}", "scope": "health.read"})
    ok = await client.get(url, headers=h)
    assert ok.status_code == 200
    body = ok.json()
    assert body["blood_group"] == "B+" and "Penicillin" in body["allergies"]
    assert "aadhaar" not in body and "pan" not in body  # identity numbers never leave

    await client.post(f"/v1/families/{fid}/consents", json={"grantee": f"partner:{pid}", "scope": "health.read", "granted": False})
    assert (await client.get(url, headers=h)).status_code == 403

    audit = (await client.get(f"/v1/families/{fid}/audit")).json()
    actions = [e["action"] for e in audit["entries"]]
    assert "partner.access_denied" in actions and "partner.emergency_packet_read" in actions


async def test_fhir_bundle(client, fid):
    pid, h = await _partner(client)
    maa = await _maa(client, fid)
    await client.post(f"/v1/families/{fid}/consents", json={"grantee": f"partner:{pid}", "scope": "health.read"})
    b = (await client.get(f"/v1/partner/v1/families/{fid}/fhir/Patient/{maa}", headers=h)).json()
    kinds = {e["resource"]["resourceType"] for e in b["entry"]}
    assert b["resourceType"] == "Bundle" and {"Patient", "AllergyIntolerance", "MedicationStatement", "Condition"} <= kinds


async def test_cannot_read_another_familys_person(client, fid):
    pid, h = await _partner(client)
    other = (await client.post("/v1/families", json={"name": "Other", "sponsor_name": "X"})).json()["id"]
    await client.post(f"/v1/families/{other}/consents", json={"grantee": f"partner:{pid}", "scope": "health.read"})
    maa = await _maa(client, fid)
    r = await client.get(f"/v1/partner/v1/families/{other}/emergency-packet?person_id={maa}", headers=h)
    assert r.status_code == 404


async def test_discharge_summary_lands_in_vault_and_triggers_homecare(client, fid):
    pid, h = await _partner(client)
    maa = await _maa(client, fid)
    path = f"/v1/partner/v1/families/{fid}/discharge-summaries"
    body = {"person_id": maa, "summary": "Admitted with chest pain. BP: 130/80. Discharged stable.", "needs_home_nursing": True}
    assert (await client.post(path, json=body, headers=h)).status_code == 403  # needs health.write
    await client.post(f"/v1/families/{fid}/consents", json={"grantee": f"partner:{pid}", "scope": "health.write"})
    r = await client.post(path, json=body, headers=h)
    assert r.status_code == 200 and r.json()["homecare_task_id"]
    docs = (await client.get(f"/v1/families/{fid}/documents?q=discharge")).json()
    assert docs and docs[0]["extracted"]["bp"] == "130/80"


async def test_insurer_only_eligibility(client, fid):
    hid, hh = await _partner(client, "hospital")
    body = {"policy_no": "SH-884221", "person_id": "x"}
    assert (await client.post(f"/v1/partner/v1/insurance/eligibility?fid={fid}", json=body, headers=hh)).status_code == 403
    iid, ih = await _partner(client, "insurer")
    await client.post(f"/v1/families/{fid}/consents", json={"grantee": f"partner:{iid}", "scope": "insurance.read"})
    r = (await client.post(f"/v1/partner/v1/insurance/eligibility?fid={fid}", json=body, headers=ih)).json()
    assert r["eligible"] is True
    r2 = (await client.post(f"/v1/partner/v1/insurance/eligibility?fid={fid}", json={**body, "policy_no": "ZZZ"}, headers=ih)).json()
    assert r2["eligible"] is False


async def test_rate_limit(client, fid):
    from app.db import SessionLocal
    from app.models import Partner

    pid, h = await _partner(client)
    async with SessionLocal() as s:
        (await s.get(Partner, pid)).rate_limit_per_min = 3
        await s.commit()
    codes = [(await client.get("/v1/partner/v1/me", headers=h)).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


async def test_webhook_signing_and_failed_delivery_recorded(client, fid):
    pid, h = await _partner(client)
    sub = (await client.post("/v1/partner/v1/webhooks", json={"url": "http://127.0.0.1:9/hook", "events": ["task.escalated"]}, headers=h)).json()
    assert sub["secret"].startswith("whsec_")
    await client.post(f"/v1/families/{fid}/sos", json={"simulate_dispatch_failure": True})
    log = (await client.get("/v1/partner/v1/webhooks/deliveries", headers=h)).json()
    assert log and log[0]["event"] == "task.escalated" and log[0]["status"] == "failed"  # unreachable URL, recorded
    assert sign("k", "body") == sign("k", "body") and sign("k", "body") != sign("k2", "body")
