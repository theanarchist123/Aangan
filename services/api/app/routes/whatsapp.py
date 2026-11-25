"""WhatsApp Cloud API webhook: Meta's verification handshake, HMAC signature check, text and voice notes.

Voice notes are downloaded from Meta, transcribed with Sarvam (Hindi, Marathi, Tamil, ... and mixed speech),
and then handled exactly like typed text. Emergencies in any supported language trigger the SOS flow."""

import hashlib
import hmac
import logging
from collections import OrderedDict

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from .api import process_inbound

log = logging.getLogger("aangan.whatsapp")
router = APIRouter(prefix="/webhooks", tags=["whatsapp"])
GRAPH = "https://graph.facebook.com/v21.0"

# Meta retries deliveries; remember recent message ids so a retry never creates a second task.
_SEEN: OrderedDict[str, None] = OrderedDict()


def _first_seen(message_id: str) -> bool:
    if message_id in _SEEN:
        return False
    _SEEN[message_id] = None
    while len(_SEEN) > 2000:
        _SEEN.popitem(last=False)
    return True


@router.get("/whatsapp", response_class=PlainTextResponse, summary="Meta webhook verification handshake")
async def verify(
    mode: str = Query("", alias="hub.mode"),
    token: str = Query("", alias="hub.verify_token"),
    challenge: str = Query("", alias="hub.challenge"),
):
    expected = settings.whatsapp_verify_token
    if mode == "subscribe" and expected and hmac.compare_digest(token, expected):
        return challenge
    raise HTTPException(403, "verification failed")


def valid_signature(raw: bytes, header: str) -> bool:
    if not settings.whatsapp_app_secret:
        return False  # never accept unsigned traffic once WhatsApp is configured
    expected = "sha256=" + hmac.new(settings.whatsapp_app_secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header or "")


async def send_text(to: str, body: str) -> bool:
    if not (settings.whatsapp_access_token and settings.whatsapp_phone_number_id):
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                f"{GRAPH}/{settings.whatsapp_phone_number_id}/messages",
                headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
                json={"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": body}},
            )
        if r.status_code >= 300:
            log.warning("WhatsApp send failed: %s %s", r.status_code, r.text[:200])
        return r.status_code < 300
    except httpx.HTTPError as e:
        log.warning("WhatsApp send error: %s", e)
        return False


async def transcribe_voice_note(media_id: str) -> str | None:
    """Download a voice note from Meta and transcribe it with Sarvam. Returns None on any failure."""
    from ..integrations import transcribe

    try:
        auth = {"Authorization": f"Bearer {settings.whatsapp_access_token}"}
        async with httpx.AsyncClient(timeout=30) as c:
            meta = (await c.get(f"{GRAPH}/{media_id}", headers=auth)).json()
            audio = await c.get(meta["url"], headers=auth)
            audio.raise_for_status()
        return await transcribe(audio.content, meta.get("mime_type") or "audio/ogg")
    except (httpx.HTTPError, KeyError, ValueError) as e:
        log.warning("voice note download failed: %s", e)
        return None


@router.post("/whatsapp", summary="Inbound WhatsApp messages (Meta Cloud API)")
async def inbound(request: Request, session: AsyncSession = Depends(get_session)):
    raw = await request.body()
    if not valid_signature(raw, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(403, "bad signature")
    payload = await request.json()
    handled = 0
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            for m in change.get("value", {}).get("messages", []):
                if not _first_seen(m.get("id", "")):
                    continue
                sender = m.get("from", "")
                text: str | None = None
                if m.get("type") == "text":
                    text = m["text"]["body"]
                elif m.get("type") == "audio":
                    text = await transcribe_voice_note(m["audio"]["id"])
                    if text is None:
                        await send_text(sender, "Sorry, I couldn't hear that voice note. Please try again or type your message. "
                                                "In an emergency, call 112.")
                        continue
                else:
                    await send_text(sender, "I can read text and voice notes. Please send one of those.")
                    continue
                result = await process_inbound(session, sender, text)
                await send_text(sender, result["reply"])
                handled += 1
    return {"handled": handled}  # always 200 so Meta doesn't retry
