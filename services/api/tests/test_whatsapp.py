import hashlib
import hmac
import json

from app.config import settings
from app.routes import whatsapp as wa


def _sig(body: bytes, secret="appsecret") -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _msg(mid, text, sender="919822000112"):
    return {"entry": [{"changes": [{"value": {"messages": [{"id": mid, "from": sender, "type": "text", "text": {"body": text}}]}}]}]}


async def test_verify_handshake(client, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_verify_token", "tok123")
    ok = await client.get("/v1/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "tok123", "hub.challenge": "777"})
    assert ok.status_code == 200 and ok.text == "777"
    bad = await client.get("/v1/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "777"})
    assert bad.status_code == 403


async def test_rejects_unsigned_and_wrongly_signed(client, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "appsecret")
    body = json.dumps(_msg("m0", "hi")).encode()
    assert (await client.post("/v1/webhooks/whatsapp", content=body)).status_code == 403
    assert (await client.post("/v1/webhooks/whatsapp", content=body, headers={"X-Hub-Signature-256": _sig(body, "wrong")})).status_code == 403


async def test_hindi_emergency_text_triggers_sos_and_replies_once(client, fid, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "appsecret")
    sent = []

    async def fake_send(to, body):
        sent.append((to, body))
        return True

    monkeypatch.setattr(wa, "send_text", fake_send)
    body = json.dumps(_msg("m1", "मुझे सीने में दर्द हो रहा है")).encode()
    h = {"X-Hub-Signature-256": _sig(body)}
    r = await client.post("/v1/webhooks/whatsapp", content=body, headers=h)
    assert r.status_code == 200 and r.json()["handled"] == 1
    assert sent and "Help is on the way" in sent[0][1]
    tasks = (await client.get(f"/v1/families/{fid}/tasks")).json()
    assert any(t["kind"] == "sos" for t in tasks)

    again = await client.post("/v1/webhooks/whatsapp", content=body, headers=h)  # Meta retry
    assert again.json()["handled"] == 0 and len(sent) == 1


async def test_voice_note_is_transcribed_then_handled(client, fid, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "appsecret")
    sent = []

    async def fake_send(to, body):
        sent.append(body)
        return True

    async def fake_stt(media_id):
        return "ambulance bhejiye, papa gir gaye"

    monkeypatch.setattr(wa, "send_text", fake_send)
    monkeypatch.setattr(wa, "transcribe_voice_note", fake_stt)
    payload = {"entry": [{"changes": [{"value": {"messages": [{"id": "v1", "from": "919822000112", "type": "audio", "audio": {"id": "media1"}}]}}]}]}
    body = json.dumps(payload).encode()
    r = await client.post("/v1/webhooks/whatsapp", content=body, headers={"X-Hub-Signature-256": _sig(body)})
    assert r.json()["handled"] == 1 and "Help is on the way" in sent[0]


async def test_failed_transcription_tells_user_to_call_112(client, fid, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "appsecret")
    sent = []

    async def fake_send(to, body):
        sent.append(body)
        return True

    async def fail_stt(media_id):
        return None

    monkeypatch.setattr(wa, "send_text", fake_send)
    monkeypatch.setattr(wa, "transcribe_voice_note", fail_stt)
    payload = {"entry": [{"changes": [{"value": {"messages": [{"id": "v2", "from": "919822000112", "type": "audio", "audio": {"id": "x"}}]}}]}]}
    body = json.dumps(payload).encode()
    await client.post("/v1/webhooks/whatsapp", content=body, headers={"X-Hub-Signature-256": _sig(body)})
    assert sent and "112" in sent[0]


async def test_phone_numbers_are_unique_across_families(client, fid):
    other = (await client.post("/v1/families", json={"name": "Other", "sponsor_name": "X"})).json()["id"]
    dup = await client.post(f"/v1/families/{other}/people", json={"name": "Impostor", "role": "parent", "phone": "98220 00112"})
    assert dup.status_code == 409
