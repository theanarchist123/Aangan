"""Open Partner API ("Build-Over" stack): hospitals, banks, insurers.

Every call: authenticated by API key -> rate limited -> usage metered -> consent checked against the family's
consent engine (grantee "partner:<id>"). Families, not partners, decide what a partner may read or write."""

import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, HttpUrl
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..agents import orchestrator
from ..db import get_session
from ..models import Document, Partner, Person, UsageEvent, WebhookDelivery, WebhookSub
from ..safety import has_consent, redact_text

public = APIRouter(prefix="/partners", tags=["partner-signup"])
router = APIRouter(prefix="/partner/v1", tags=["partner"])

_WINDOWS: dict[str, deque[float]] = defaultdict(deque)


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class PartnerIn(BaseModel):
    name: str
    kind: str  # hospital | bank | insurer


@public.post("", summary="Self-serve sandbox signup. The API key is shown once.")
async def signup(body: PartnerIn, session: AsyncSession = Depends(get_session)):
    if body.kind not in ("hospital", "bank", "insurer"):
        raise HTTPException(422, "kind must be hospital, bank or insurer")
    key = "ak_test_" + secrets.token_urlsafe(24)
    p = Partner(name=body.name, kind=body.kind, key_hash=_hash(key))
    session.add(p)
    await session.commit()
    return {"partner_id": p.id, "api_key": key, "note": "Store this key now. It cannot be shown again."}


async def current_partner(
    x_api_key: str = Header(default=""), session: AsyncSession = Depends(get_session)
) -> Partner:
    if not x_api_key:
        raise HTTPException(401, "missing X-API-Key header")
    p = (await session.execute(select(Partner).where(Partner.key_hash == _hash(x_api_key)))).scalar_one_or_none()
    if not p:
        raise HTTPException(401, "invalid API key")
    now = time.monotonic()
    w = _WINDOWS[p.id]
    while w and now - w[0] > 60:
        w.popleft()
    if len(w) >= p.rate_limit_per_min:
        session.add(UsageEvent(partner_id=p.id, endpoint="rate_limited", status=429))
        await session.commit()
        raise HTTPException(429, "rate limit exceeded", headers={"Retry-After": "60"})
    w.append(now)
    return p


async def meter(session: AsyncSession, p: Partner, endpoint: str, status: int = 200) -> None:
    session.add(UsageEvent(partner_id=p.id, endpoint=endpoint, status=status))


async def require_consent(session: AsyncSession, p: Partner, family_id: str, scope: str) -> None:
    if not await has_consent(session, family_id, f"partner:{p.id}", scope):
        await meter(session, p, f"denied:{scope}", 403)
        await audit.log(session, family_id, f"partner:{p.name}", "partner.access_denied", {"scope": scope})
        await session.commit()
        raise HTTPException(403, f"the family has not granted '{scope}' to this partner")


@router.get("/me", summary="Who am I, and my usage this month")
async def me(p: Partner = Depends(current_partner), session: AsyncSession = Depends(get_session)):
    n = (await session.execute(select(func.count()).select_from(UsageEvent).where(UsageEvent.partner_id == p.id))).scalar_one()
    await meter(session, p, "me")
    await session.commit()
    return {"partner_id": p.id, "name": p.name, "kind": p.kind, "rate_limit_per_min": p.rate_limit_per_min, "calls": n}


# ---------- hospital stack ----------
@router.get("/families/{fid}/emergency-packet", summary="Pre-arrival emergency patient packet")
async def emergency_packet(fid: str, person_id: str, p: Partner = Depends(current_partner), session: AsyncSession = Depends(get_session)):
    await require_consent(session, p, fid, "health.read")
    person = await session.get(Person, person_id)
    if not person or person.family_id != fid:
        raise HTTPException(404, "person not found in this family")
    contacts = (await session.execute(select(Person).where(Person.family_id == fid, Person.is_emergency_contact))).scalars().all()
    await meter(session, p, "emergency-packet")
    await audit.log(session, fid, f"partner:{p.name}", "partner.emergency_packet_read", {"person": person.id})
    await session.commit()
    # Aadhaar / PAN are never included unless the 'id.unmask' scope is granted to this partner.
    return {
        "name": person.name, "blood_group": person.blood_group, "allergies": person.allergies,
        "conditions": person.conditions, "medications": person.medications,
        "emergency_contacts": [{"name": c.name, "phone": c.phone} for c in contacts],
    }


def _fhir_bundle(person: Person) -> dict:
    """Minimal HL7 FHIR R4 Bundle: Patient + AllergyIntolerance + MedicationStatement."""
    entries: list[dict] = [{"resource": {"resourceType": "Patient", "id": person.id, "name": [{"text": person.name}],
                                         "address": [{"city": person.city, "country": "IN"}]}}]
    for a in person.allergies:
        entries.append({"resource": {"resourceType": "AllergyIntolerance", "patient": {"reference": f"Patient/{person.id}"},
                                     "code": {"text": a}, "clinicalStatus": {"coding": [{"code": "active"}]}}})
    for m in person.medications:
        entries.append({"resource": {"resourceType": "MedicationStatement", "status": "active",
                                     "subject": {"reference": f"Patient/{person.id}"},
                                     "medicationCodeableConcept": {"text": m.get("name", "")}}})
    for c in person.conditions:
        entries.append({"resource": {"resourceType": "Condition", "subject": {"reference": f"Patient/{person.id}"},
                                     "code": {"text": c}}})
    return {"resourceType": "Bundle", "type": "collection", "entry": entries}


@router.get("/families/{fid}/fhir/Patient/{person_id}", summary="FHIR R4 patient bundle")
async def fhir_patient(fid: str, person_id: str, p: Partner = Depends(current_partner), session: AsyncSession = Depends(get_session)):
    await require_consent(session, p, fid, "health.read")
    person = await session.get(Person, person_id)
    if not person or person.family_id != fid:
        raise HTTPException(404, "person not found in this family")
    await meter(session, p, "fhir-patient")
    await audit.log(session, fid, f"partner:{p.name}", "partner.fhir_read", {"person": person.id})
    await session.commit()
    return _fhir_bundle(person)


class DischargeIn(BaseModel):
    person_id: str
    summary: str
    follow_up: str = ""
    needs_home_nursing: bool = False


@router.post("/families/{fid}/discharge-summaries", summary="Push a discharge summary into the family vault")
async def discharge(fid: str, body: DischargeIn, p: Partner = Depends(current_partner), session: AsyncSession = Depends(get_session)):
    await require_consent(session, p, fid, "health.write")
    from .api import extract_fields  # lazy import: same parsing + redaction as any vault upload

    doc = Document(family_id=fid, person_id=body.person_id, title=f"Discharge summary from {p.name}", category="medical",
                   text=redact_text(body.summary), extracted={**extract_fields(body.summary), "source": p.name})
    session.add(doc)
    task_id = None
    if body.needs_home_nursing:
        # Triggers the post-discharge home-care workflow; the NRI's limits still apply to any spend.
        task = await orchestrator.create_task(session, fid, f"Book home nursing after discharge from {p.name}")
        task_id = task.id
    await meter(session, p, "discharge-summary")
    await audit.log(session, fid, f"partner:{p.name}", "partner.discharge_pushed", {"doc": doc.id, "task": task_id})
    await session.commit()
    if task_id:
        await orchestrator.run_task(session, task_id)
    return {"document_id": doc.id, "homecare_task_id": task_id}


# ---------- insurer / TPA stack ----------
class EligibilityIn(BaseModel):
    policy_no: str
    person_id: str


@router.post("/insurance/eligibility", summary="Real-time eligibility check (sandbox)")
async def eligibility(body: EligibilityIn, fid: str, p: Partner = Depends(current_partner), session: AsyncSession = Depends(get_session)):
    if p.kind != "insurer":
        raise HTTPException(403, "only insurer partners may call this endpoint")
    await require_consent(session, p, fid, "insurance.read")
    docs = (await session.execute(select(Document).where(Document.family_id == fid, Document.category == "insurance"))).scalars().all()
    match = next((d for d in docs if d.extracted.get("policy_no") == body.policy_no), None)
    await meter(session, p, "eligibility")
    await session.commit()
    if not match:
        return {"eligible": False, "reason": "policy not found in the family vault"}
    expiry = match.extracted.get("expiry")
    active = not expiry or datetime.fromisoformat(expiry).replace(tzinfo=UTC) > datetime.now(UTC)
    return {"eligible": active, "policy_no": body.policy_no, "expiry": expiry, "reason": None if active else "policy expired"}


# ---------- webhooks ----------
class WebhookIn(BaseModel):
    url: HttpUrl
    events: list[str]


@router.post("/webhooks", summary="Subscribe to platform events")
async def subscribe(body: WebhookIn, p: Partner = Depends(current_partner), session: AsyncSession = Depends(get_session)):
    sub = WebhookSub(partner_id=p.id, url=str(body.url), events=body.events, secret="whsec_" + secrets.token_urlsafe(24))
    session.add(sub)
    await meter(session, p, "webhook-subscribe")
    await session.commit()
    return {"id": sub.id, "secret": sub.secret, "events": sub.events}


def sign(secret: str, body: str) -> str:
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


async def emit(session: AsyncSession, event: str, payload: dict) -> int:
    """Fan an event out to subscribed partners. Signed with HMAC-SHA256; failures are recorded for retry."""
    subs = (await session.execute(select(WebhookSub))).scalars().all()
    n = 0
    for s in subs:
        if event not in s.events:
            continue
        body = json.dumps({"event": event, "data": payload}, sort_keys=True)
        d = WebhookDelivery(sub_id=s.id, event=event, payload=payload, signature=sign(s.secret, body))
        session.add(d)
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                r = await c.post(s.url, content=body, headers={"Content-Type": "application/json", "X-Aangan-Signature": d.signature})
            d.status = "delivered" if r.status_code < 300 else "failed"
        except httpx.HTTPError:
            d.status = "failed"
        d.attempts = 1
        n += 1
    await session.commit()
    return n


@router.get("/webhooks/deliveries", summary="Delivery log")
async def deliveries(p: Partner = Depends(current_partner), session: AsyncSession = Depends(get_session)):
    subs = [s.id for s in (await session.execute(select(WebhookSub).where(WebhookSub.partner_id == p.id))).scalars().all()]
    rows = (await session.execute(select(WebhookDelivery).where(WebhookDelivery.sub_id.in_(subs)).order_by(WebhookDelivery.created_at.desc()).limit(50))).scalars().all() if subs else []
    return [{"id": d.id, "event": d.event, "status": d.status, "attempts": d.attempts} for d in rows]
