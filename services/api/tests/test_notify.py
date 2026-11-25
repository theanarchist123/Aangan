from app import notify

A = {"X-Test-User": "alice"}


async def _seed(client):
    return (await client.post("/v1/demo/seed", headers=A)).json()["family_id"]


async def test_unconfigured_whatsapp_is_reported_not_faked(client):
    fid = await _seed(client)
    await client.post(f"/v1/families/{fid}/sos", json={"simulate_dispatch_failure": True}, headers=A)
    notes = (await client.get(f"/v1/families/{fid}/notifications", headers=A)).json()
    people_notes = [n for n in notes if n["to"] != "24x7 command desk"]
    assert people_notes and all(n["delivery"] == "not_configured" for n in people_notes)


async def test_delivery_outcomes_are_recorded_per_person(client, monkeypatch):
    sent_to = []

    async def fake_send(to, body):
        sent_to.append(to)
        if to.endswith("0222"):  # Mr. Kulkarni's number: simulate WhatsApp's 24-hour rule
            return False, "Re-engagement message: recipient has not messaged in 24 hours"
        return True, "sent"

    monkeypatch.setattr(notify, "send_whatsapp", fake_send)
    fid = await _seed(client)
    await client.post(f"/v1/families/{fid}/sos", json={"simulate_dispatch_failure": True}, headers=A)
    notes = (await client.get(f"/v1/families/{fid}/notifications", headers=A)).json()
    by = {n["to"]: n["delivery"] for n in notes if n["urgent"] and n["to"] != "24x7 command desk"}
    assert by["Mr. Kulkarni"].startswith("failed") and "24 hours" in by["Mr. Kulkarni"]
    assert by["Anita (Building Secretary)"] == "sent"
    assert sent_to  # real sends were attempted for people who have a number


async def test_family_message_step_reaches_contacts(client, monkeypatch):
    got = []

    async def fake_send(to, body):
        got.append(body)
        return True, "sent"

    monkeypatch.setattr(notify, "send_whatsapp", fake_send)
    fid = await _seed(client)
    t = (await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay electricity bill Rs 1,840"}, headers=A)).json()
    assert t["status"] == "done"
    msg = next(s for s in t["steps"] if s["agent"] == "Master Orchestrator")
    assert "sent on WhatsApp" in msg["detail"] and got


async def test_hospital_lookup_uses_real_city_and_never_blocks(client, monkeypatch):
    from app import connectors

    async def fake_hospitals(city, limit=4, budget=8.0):
        return [{"name": "Shintre Hospital", "distance_km": 1.0}] if city == "Pune" else []

    monkeypatch.setattr(connectors, "nearby_hospitals", fake_hospitals)
    fid = await _seed(client)
    maa = next(p for p in (await client.get(f"/v1/families/{fid}/people", headers=A)).json() if "Maa" in p["name"])
    t = (await client.post(f"/v1/families/{fid}/sos", json={"person_id": maa["id"]}, headers=A)).json()
    summary = next(s for s in t["steps"] if "medical summary" in s["title"].lower())
    assert "Shintre Hospital" in summary["detail"] and "sandbox" in summary["detail"]


async def test_allow_list_blocks_unapproved_numbers(monkeypatch):
    from app import integrations
    from app.config import settings

    monkeypatch.setattr(settings, "whatsapp_access_token", "t")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "1")
    monkeypatch.setattr(settings, "whatsapp_allowed_recipients", "9000000001")
    ok, reason = await integrations.send_whatsapp("+919822000111", "hi")
    assert ok is False and "allow-list" in reason  # blocked before any network call
