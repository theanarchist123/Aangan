"""Real-world inputs: photographed/uploaded documents (stored in Supabase Storage, read by Gemini), voice (Sarvam),
and live lookups (nearest hospitals, weather)."""

import base64
import binascii
import logging
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit, integrations
from ..db import get_session
from ..deps import AuthUser, current_user, member_of
from ..models import Document, Person
from ..safety import redact_text
from .api import EDITORS, _family, extract_fields

log = logging.getLogger("aangan.media")
router = APIRouter(tags=["media"])
DB = Depends(get_session)
U = Depends(current_user)
MAX_BYTES = 10 * 1024 * 1024
DOC_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf")
AUDIO_TYPES = ("audio/", "video/mp4", "application/octet-stream")
CATEGORIES = {"medical", "insurance", "utility", "property", "identity", "will", "other"}


def _clean_fields(raw: object) -> dict:
    if not isinstance(raw, dict):
        return {}
    out = {}
    for k, v in raw.items():
        if k in ("expiry", "due_date", "amount_inr", "policy_no", "bp", "hba1c", "medicines") and v not in (None, "", []):
            out[k] = str(v).strip()[:120]
    return out


def sniff_mime(data: bytes) -> str | None:
    """Identify the real file type from its first bytes. Phones and pickers often report the wrong MIME type
    (image/jpg, application/octet-stream, or none at all), so we never trust the label alone."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if b"%PDF-" in data[:1024]:  # the PDF spec allows a little junk before the header
        return "application/pdf"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"hevc", b"mif1", b"msf1", b"heim", b"heis"):
        return "image/heic"
    return None


async def _ingest(session: AsyncSession, user: AuthUser, fid: str, data: bytes, claimed_mime: str, filename: str, person_id: str) -> dict:
    if not data:
        raise HTTPException(422, "that file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"that file is {len(data) // (1024 * 1024)} MB; the limit is 10 MB")
    mime = sniff_mime(data)  # the file's own bytes decide; the client's label is only logged
    if mime not in DOC_TYPES:
        log.warning("upload rejected: claimed=%s size=%d", claimed_mime, len(data))
        raise HTTPException(415, "please upload a photo (JPG, PNG, WebP, HEIC) or a PDF")
    log.info("upload accepted: %s %d bytes (claimed %s)", mime, len(data), claimed_mime)

    ai = await integrations.read_document(data, mime)
    text = redact_text(str((ai or {}).get("text", "")))  # Aadhaar / PAN never stay in searchable text
    fields = {**extract_fields(str((ai or {}).get("text", ""))), **_clean_fields((ai or {}).get("fields"))}
    category = str((ai or {}).get("category", "other")).lower()
    category = category if category in CATEGORIES else "other"
    fallback_title = re.sub(r"[_-]+", " ", (filename or "Uploaded document").rsplit(".", 1)[0]).strip().title() or "Uploaded document"
    title = (str((ai or {}).get("title", "")).strip() or fallback_title)[:120]

    path = f"{fid}/{uuid.uuid4().hex}"
    stored = await integrations.store_file(path, data, mime)
    doc = Document(family_id=fid, person_id=person_id, title=title, category=category, text=text, extracted=fields,
                   file_path=path if stored else "", file_mime=mime)
    session.add(doc)
    await audit.log(session, fid, f"human:{user.email}", "document.uploaded",
                    {"title": title, "category": category, "stored": stored, "ai_read": ai is not None, "bytes": len(data)})
    await session.commit()
    return {"id": doc.id, "title": title, "category": category, "extracted": fields, "stored": stored,
            "ai_read": ai is not None and bool(text),
            "note": None if ai else "Saved, but the AI reader was unavailable so nothing was extracted."}


@router.post("/families/{fid}/documents/upload", summary="Upload a photo/PDF (multipart): stored privately and read by AI")
async def upload_document(fid: str, file: UploadFile = File(...), person_id: str = Form(""),
                          user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, EDITORS)
    return await _ingest(session, user, fid, await file.read(), file.content_type or "", file.filename or "", person_id)


class Base64Upload(BaseModel):
    filename: str = ""
    mime: str = ""
    data: str  # base64 file contents
    person_id: str = ""


def _decode(b64: str) -> bytes:
    try:
        return base64.b64decode(b64.split(",", 1)[-1], validate=False)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(422, "the file data could not be decoded") from e


@router.post("/families/{fid}/documents/upload-b64", summary="Upload a photo/PDF as base64 JSON (what the mobile app uses)")
async def upload_document_b64(fid: str, body: Base64Upload, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, EDITORS)
    return await _ingest(session, user, fid, _decode(body.data), body.mime, body.filename, body.person_id)


@router.get("/documents/{doc_id}/file", summary="Short-lived link to the original file")
async def document_file(doc_id: str, user: AuthUser = U, session: AsyncSession = DB):
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404)
    await member_of(session, user, doc.family_id)
    if not doc.file_path:
        raise HTTPException(404, "this document has no stored file")
    url = await integrations.signed_url(doc.file_path, 300)
    if not url:
        raise HTTPException(502, "could not open the file right now")
    return {"url": url, "expires_in": 300, "mime": doc.file_mime}


async def _transcribe(data: bytes, mime: str) -> dict:
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(413, "recordings must be non-empty and under 10 MB")
    text = await integrations.transcribe(data, mime)
    if not text:
        raise HTTPException(502, "I couldn't make out that recording. Please try again or type it.")
    return {"transcript": text}


@router.post("/families/{fid}/voice/transcribe", summary="Speech to text (Hindi, Marathi, Tamil... and mixed speech)")
async def voice_transcribe(fid: str, file: UploadFile = File(...), user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    mime = (file.content_type or "").lower()
    if not mime.startswith(AUDIO_TYPES):
        raise HTTPException(415, "please send an audio recording")
    return await _transcribe(await file.read(), mime)


@router.post("/families/{fid}/voice/transcribe-b64", summary="Speech to text from base64 JSON (what the mobile app uses)")
async def voice_transcribe_b64(fid: str, body: Base64Upload, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    return await _transcribe(_decode(body.data), body.mime or "audio/mp4")


async def _city(session: AsyncSession, fid: str, person_id: str, city: str) -> str:
    if city.strip():
        return city.strip()[:80]
    if person_id:
        p = await session.get(Person, person_id)
        if p and p.family_id == fid:
            return p.city
    return ""


@router.get("/families/{fid}/nearby-hospitals", summary="Real hospitals near a person (OpenStreetMap)")
async def nearby(fid: str, person_id: str = "", city: str = "", user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    c = await _city(session, fid, person_id, city)
    return {"city": c, "hospitals": await integrations.nearby_hospitals(c, limit=5, budget=8) if c else []}


@router.get("/families/{fid}/weather", summary="Live weather for a person's city (Open-Meteo)")
async def weather(fid: str, person_id: str = "", city: str = "", user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    c = await _city(session, fid, person_id, city)
    return {"weather": await integrations.weather(c) if c else None}
