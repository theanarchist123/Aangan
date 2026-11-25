from app import integrations
from app.agents import guardian

A = {"X-Test-User": "alice"}
B = {"X-Test-User": "bob"}
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


async def _seed(client):
    return (await client.post("/v1/demo/seed", headers=A)).json()["family_id"]


def _stub_ai(monkeypatch, *, ai, stored=True):
    async def fake_read(data, mime):
        return ai

    async def fake_store(path, data, mime):
        return stored

    monkeypatch.setattr(integrations, "read_document", fake_read)
    monkeypatch.setattr(integrations, "store_file", fake_store)


async def test_upload_is_read_stored_redacted_and_searchable(client, monkeypatch):
    _stub_ai(monkeypatch, ai={
        "title": "Star Health policy", "category": "insurance",
        "text": "Policy no: SH-1 Expiry: 2031-04-01. Insured Aadhaar 2345 6789 0123, PAN ABCDE1234F",
        "fields": {"expiry": "2031-04-01", "policy_no": "SH-1", "junk": "ignored"}})
    fid = await _seed(client)
    r = await client.post(f"/v1/families/{fid}/documents/upload", headers=A, files={"file": ("p.png", PNG, "image/png")})
    assert r.status_code == 200
    d = r.json()
    assert d["title"] == "Star Health policy" and d["category"] == "insurance" and d["stored"] and d["ai_read"]
    assert d["extracted"]["expiry"] == "2031-04-01" and "junk" not in d["extracted"]
    docs = (await client.get(f"/v1/families/{fid}/documents?q=star", headers=A)).json()
    assert docs[0]["has_file"] is True
    assert "2345 6789" not in docs[0]["text"] and "ABCDE1234F" not in docs[0]["text"]  # identity numbers never stored in clear text
    audit = (await client.get(f"/v1/families/{fid}/audit", headers=A)).json()
    assert any(e["action"] == "document.uploaded" for e in audit["entries"])


async def test_upload_survives_ai_outage_and_says_so(client, monkeypatch):
    _stub_ai(monkeypatch, ai=None, stored=True)
    fid = await _seed(client)
    r = (await client.post(f"/v1/families/{fid}/documents/upload", headers=A, files={"file": ("old_policy-scan.png", PNG, "image/png")})).json()
    assert r["title"] == "Old Policy Scan" and r["ai_read"] is False and "unavailable" in r["note"]


async def test_upload_validation_and_access(client, monkeypatch):
    _stub_ai(monkeypatch, ai={"title": "x", "category": "other", "text": "", "fields": {}})
    fid = await _seed(client)
    url = f"/v1/families/{fid}/documents/upload"
    assert (await client.post(url, headers=A, files={"file": ("a.exe", b"MZ", "application/x-msdownload")})).status_code == 415
    assert (await client.post(url, headers=A, files={"file": ("a.png", b"", "image/png")})).status_code == 422
    assert (await client.post(url, headers=A, files={"file": ("a.png", b"0" * (10 * 1024 * 1024 + 1), "image/png")})).status_code == 413
    assert (await client.post(url, headers=B, files={"file": ("a.png", PNG, "image/png")})).status_code == 404  # not my family


async def test_original_file_link_is_private(client, monkeypatch):
    _stub_ai(monkeypatch, ai={"title": "Bill", "category": "utility", "text": "due: 2030-01-01", "fields": {}})

    async def fake_sign(path, seconds=300):
        return f"https://signed.example/{path}?t=1"

    monkeypatch.setattr(integrations, "signed_url", fake_sign)
    fid = await _seed(client)
    doc = (await client.post(f"/v1/families/{fid}/documents/upload", headers=A, files={"file": ("b.png", PNG, "image/png")})).json()
    ok = await client.get(f"/v1/documents/{doc['id']}/file", headers=A)
    assert ok.status_code == 200 and ok.json()["url"].startswith("https://signed.example/")
    assert (await client.get(f"/v1/documents/{doc['id']}/file", headers=B)).status_code == 404


async def test_voice_transcription(client, monkeypatch):
    async def fake_stt(data, mime):
        return "मुझे सीने में दर्द है" if data else None

    monkeypatch.setattr(integrations, "transcribe", fake_stt)
    fid = await _seed(client)
    ok = await client.post(f"/v1/families/{fid}/voice/transcribe", headers=A, files={"file": ("v.m4a", b"audio", "audio/m4a")})
    assert ok.status_code == 200 and "सीने" in ok.json()["transcript"]
    assert (await client.post(f"/v1/families/{fid}/voice/transcribe", headers=A, files={"file": ("v.txt", b"x", "text/plain")})).status_code == 415
    assert (await client.post(f"/v1/families/{fid}/voice/transcribe", headers=B, files={"file": ("v.m4a", b"a", "audio/m4a")})).status_code == 404

    async def nothing(data, mime):
        return None

    monkeypatch.setattr(integrations, "transcribe", nothing)
    assert (await client.post(f"/v1/families/{fid}/voice/transcribe", headers=A, files={"file": ("v.m4a", b"a", "audio/m4a")})).status_code == 502


async def test_guardian_does_not_nag_twice_in_a_day(client):
    from app.db import SessionLocal

    fid = await _seed(client)
    async with SessionLocal() as s:
        first = await guardian.run_checks(s, fid)
        await guardian.run_checks(s, fid)
    notes = (await client.get(f"/v1/families/{fid}/notifications", headers=A)).json()
    texts = [n["message"] for n in notes if n["message"].startswith("Aangan Guardian:")]
    assert first and len(texts) == len(set(texts)) == len(first)  # one notification per finding, not two


async def test_weather_and_hospitals_endpoints(client, monkeypatch):
    async def fake_wx(city):
        return {"city": city, "temp_c": 30, "summary": "Clear", "is_day": True}

    async def fake_h(city, limit=4, budget=8.0):
        return [{"name": "Shintre Hospital", "distance_km": 1.0}]

    monkeypatch.setattr(integrations, "weather", fake_wx)
    monkeypatch.setattr(integrations, "nearby_hospitals", fake_h)
    fid = await _seed(client)
    maa = next(p for p in (await client.get(f"/v1/families/{fid}/people", headers=A)).json() if "Maa" in p["name"])
    wx = (await client.get(f"/v1/families/{fid}/weather?person_id={maa['id']}", headers=A)).json()
    assert wx["weather"]["city"] == "Pune"
    h = (await client.get(f"/v1/families/{fid}/nearby-hospitals?person_id={maa['id']}", headers=A)).json()
    assert h["hospitals"][0]["name"] == "Shintre Hospital"
    assert (await client.get(f"/v1/families/{fid}/weather?city=Pune", headers=B)).status_code == 404


# ---------- phones mislabel files: the server must go by the real bytes ----------
PDF = b"%PDF-1.4\n" + b"0" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


async def test_wrong_or_missing_mime_labels_are_corrected_from_the_bytes(client, monkeypatch):
    _stub_ai(monkeypatch, ai={"title": "Scan", "category": "other", "text": "", "fields": {}})
    fid = await _seed(client)
    url = f"/v1/families/{fid}/documents/upload"
    for name, data, label in [("a.jpg", JPEG, "image/jpg"), ("b.pdf", PDF, "application/octet-stream"),
                              ("c.png", PNG, ""), ("d.jpeg", JPEG, "application/pdf")]:
        r = await client.post(url, headers=A, files={"file": (name, data, label or "application/octet-stream")})
        assert r.status_code == 200, (name, label, r.text)


async def test_disguised_executables_are_still_rejected(client, monkeypatch):
    _stub_ai(monkeypatch, ai={"title": "x", "category": "other", "text": "", "fields": {}})
    fid = await _seed(client)
    r = await client.post(f"/v1/families/{fid}/documents/upload", headers=A, files={"file": ("virus.pdf", b"MZ\x90\x00" + b"0" * 64, "application/pdf")})
    assert r.status_code == 415


async def test_base64_upload_route_used_by_the_mobile_app(client, monkeypatch):
    import base64

    _stub_ai(monkeypatch, ai={"title": "Lab report", "category": "medical", "text": "BP: 120/80", "fields": {"hba1c": "6.1"}})
    fid = await _seed(client)
    url = f"/v1/families/{fid}/documents/upload-b64"
    body = {"filename": "IMG_001.jpg", "mime": "", "data": base64.b64encode(JPEG).decode()}
    r = await client.post(url, headers=A, json=body)
    assert r.status_code == 200 and r.json()["category"] == "medical" and r.json()["extracted"]["hba1c"] == "6.1"
    # data-URL prefixes are tolerated; garbage is a clean 422, not a crash
    assert (await client.post(url, headers=A, json={**body, "data": "data:image/jpeg;base64," + body["data"]})).status_code == 200
    assert (await client.post(url, headers=A, json={**body, "data": "%%%not base64%%%"})).status_code in (415, 422)
    assert (await client.post(url, headers=B, json=body)).status_code == 404  # still family-scoped
    pdf = await client.post(url, headers=A, json={"filename": "policy.pdf", "mime": "application/pdf", "data": base64.b64encode(PDF).decode()})
    assert pdf.status_code == 200


async def test_voice_base64_route(client, monkeypatch):
    import base64

    async def fake_stt(data, mime):
        return "namaste" if data else None

    monkeypatch.setattr(integrations, "transcribe", fake_stt)
    fid = await _seed(client)
    r = await client.post(f"/v1/families/{fid}/voice/transcribe-b64", headers=A, json={"mime": "audio/mp4", "data": base64.b64encode(b"audio").decode()})
    assert r.status_code == 200 and r.json()["transcript"] == "namaste"
