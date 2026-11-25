import re
from datetime import UTC, datetime, timedelta

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit, tokens
from ..agents import guardian, orchestrator
from ..config import settings
from ..db import get_session
from ..deps import AuthUser, current_user, member_of
from ..models import Approval, AuditLog, Consent, Document, Family, FamilyMember, Notification, Person, Task, TaskStep
from ..safety import has_consent, mask_aadhaar, mask_pan, redact_text

router = APIRouter()
DB = Depends(get_session)
U = Depends(current_user)
SPONSOR = ("sponsor",)  # money, limits, consent, sharing
EDITORS = ("sponsor", "relative")  # may create tasks, people, documents


# ---------- schemas ----------
class FamilyIn(BaseModel):
    name: str
    sponsor_name: str
    sponsor_city: str = ""
    sponsor_timezone: str = "America/Los_Angeles"


class PersonIn(BaseModel):
    name: str
    role: str
    city: str = ""
    timezone: str = "Asia/Kolkata"
    language: str = "en"
    phone: str = ""
    is_emergency_contact: bool = False
    blood_group: str = ""
    allergies: list[str] = []
    conditions: list[str] = []
    medications: list[dict] = []
    aadhaar: str = ""
    pan: str = ""


class LimitsIn(BaseModel):
    auto_approve_limit_inr: int | None = None
    category_rules: dict | None = None


class GoalIn(BaseModel):
    goal: str


class SosIn(BaseModel):
    person_id: str | None = None
    simulate_dispatch_failure: bool = False


class DecisionIn(BaseModel):
    approve: bool
    signature: str = ""  # hex Ed25519 signature over the approval challenge


class ConsentIn(BaseModel):
    grantee: str
    scope: str
    granted: bool = True
    ttl_hours: int | None = None


class DocIn(BaseModel):
    title: str
    category: str = "other"
    person_id: str = ""
    text: str = ""


class DeviceKeyIn(BaseModel):
    public_key_hex: str


# ---------- helpers ----------
async def _family(session: AsyncSession, user: AuthUser, fid: str, roles: tuple[str, ...] | None = None) -> Family:
    """Load a family only if the caller belongs to it (and has one of `roles`, when given)."""
    await member_of(session, user, fid, roles)
    fam = await session.get(Family, fid)
    if not fam:
        raise HTTPException(404, "family not found")
    return fam


def person_out(p: Person, unmask: bool = False) -> dict:
    return {
        "id": p.id, "family_id": p.family_id, "name": p.name, "role": p.role, "city": p.city,
        "timezone": p.timezone, "language": p.language, "phone": p.phone,
        "is_emergency_contact": p.is_emergency_contact, "blood_group": p.blood_group,
        "allergies": p.allergies, "conditions": p.conditions, "medications": p.medications,
        "aadhaar": p.aadhaar if unmask else (mask_aadhaar(p.aadhaar) if p.aadhaar else ""),
        "pan": p.pan if unmask else (mask_pan(p.pan) if p.pan else ""),
        "last_checkin_at": p.last_checkin_at, "avatar": p.avatar,
    }


def step_out(s: TaskStep) -> dict:
    return {"id": s.id, "seq": s.seq, "agent": s.agent, "title": s.title, "detail": s.detail, "status": s.status}


async def task_out(session: AsyncSession, t: Task) -> dict:
    steps = (await session.execute(select(TaskStep).where(TaskStep.task_id == t.id).order_by(TaskStep.seq))).scalars().all()
    appr = (await session.execute(select(Approval).where(Approval.task_id == t.id).order_by(Approval.created_at))).scalars().all()
    return {
        "id": t.id, "family_id": t.family_id, "goal": t.goal, "kind": t.kind, "status": t.status,
        "created_at": t.created_at, "escalation_reason": t.state.get("escalation_reason"),
        "steps": [step_out(s) for s in steps],
        "approvals": [approval_out(a) for a in appr],
    }


def approval_out(a: Approval) -> dict:
    return {"id": a.id, "task_id": a.task_id, "action": a.action, "reason": a.reason, "amount_inr": a.amount_inr,
            "category": a.category, "status": a.status, "challenge": a.challenge, "created_at": a.created_at}


# ---------- families & people ----------
@router.post("/families")
async def create_family(body: FamilyIn, user: AuthUser = U, session: AsyncSession = DB):
    fam = Family(name=body.name, auto_approve_limit_inr=settings.default_auto_approve_limit_inr)
    session.add(fam)
    await session.flush()
    session.add(Person(family_id=fam.id, name=body.sponsor_name, role="sponsor", city=body.sponsor_city,
                       timezone=body.sponsor_timezone))
    session.add(FamilyMember(family_id=fam.id, user_id=user.id, email=user.email, role="sponsor"))
    await audit.log(session, fam.id, "human:sponsor", "family.created", {"name": body.name})
    await session.commit()
    return {"id": fam.id, "name": fam.name}


@router.get("/families/{fid}")
async def get_family(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    fam = await _family(session, user, fid)
    return {"id": fam.id, "name": fam.name, "auto_approve_limit_inr": fam.auto_approve_limit_inr,
            "category_rules": fam.category_rules, "device_registered": bool(fam.device_public_key)}


@router.patch("/families/{fid}/limits")
async def set_limits(fid: str, body: LimitsIn, user: AuthUser = U, session: AsyncSession = DB):
    fam = await _family(session, user, fid, SPONSOR)
    if body.auto_approve_limit_inr is not None:
        if body.auto_approve_limit_inr < 0:
            raise HTTPException(422, "limit must be >= 0")
        fam.auto_approve_limit_inr = body.auto_approve_limit_inr
    if body.category_rules is not None:
        fam.category_rules = body.category_rules
    await audit.log(session, fid, "human:sponsor", "limits.updated",
                    {"limit": fam.auto_approve_limit_inr, "rules": fam.category_rules})
    await session.commit()
    return {"auto_approve_limit_inr": fam.auto_approve_limit_inr, "category_rules": fam.category_rules}


@router.post("/families/{fid}/device-key")
async def register_device_key(fid: str, body: DeviceKeyIn, user: AuthUser = U, session: AsyncSession = DB):
    fam = await _family(session, user, fid, SPONSOR)
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(body.public_key_hex))
    except ValueError as e:
        raise HTTPException(422, "invalid Ed25519 public key") from e
    fam.device_public_key = body.public_key_hex
    await audit.log(session, fid, "human:sponsor", "device.registered", {})
    await session.commit()
    return {"ok": True}


def _last10(phone: str) -> str:
    return re.sub(r"\D", "", phone)[-10:]


@router.post("/families/{fid}/people")
async def add_person(fid: str, body: PersonIn, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, EDITORS)
    if _last10(body.phone):
        everyone = (await session.execute(select(Person))).scalars().all()
        if any(_last10(p.phone) == _last10(body.phone) for p in everyone):
            # Inbound WhatsApp/calls are routed by phone number, so one number must mean one person.
            raise HTTPException(409, "this phone number is already registered to someone on Aangan")
    p = Person(family_id=fid, **body.model_dump())
    session.add(p)
    await audit.log(session, fid, "human:sponsor", "person.added", {"name": body.name, "role": body.role})
    await session.commit()
    return person_out(p)


@router.get("/families/{fid}/people")
async def list_people(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    rows = (await session.execute(select(Person).where(Person.family_id == fid))).scalars().all()
    return [person_out(p) for p in rows]


@router.get("/people/{pid}/health")
async def person_health(pid: str, unmask: bool = False, user: AuthUser = U, session: AsyncSession = DB):
    p = await session.get(Person, pid)
    if not p:
        raise HTTPException(404)
    await member_of(session, user, p.family_id, SPONSOR if unmask else None)
    if unmask and not await has_consent(session, p.family_id, "sponsor", "id.unmask"):
        raise HTTPException(403, "grant the 'id.unmask' consent first (e.g. for a KYC or hospital admission)")
    return person_out(p, unmask=unmask)


@router.post("/people/{pid}/checkin")
async def checkin(pid: str, user: AuthUser = U, session: AsyncSession = DB):
    p = await session.get(Person, pid)
    if not p:
        raise HTTPException(404)
    await member_of(session, user, p.family_id, None)
    p.last_checkin_at = datetime.now(UTC)
    await audit.log(session, p.family_id, f"human:{p.name}", "checkin", {})
    await session.commit()
    return {"ok": True, "at": p.last_checkin_at}


@router.post("/people/{pid}/medication-taken")
async def medication_taken(pid: str, name: str, user: AuthUser = U, session: AsyncSession = DB):
    p = await session.get(Person, pid)
    if not p:
        raise HTTPException(404)
    await member_of(session, user, p.family_id, None)
    await audit.log(session, p.family_id, f"human:{p.name}", "med.taken", {"person": p.id, "medicine": name})
    await session.commit()
    return {"ok": True}


# ---------- tasks / agents ----------
@router.post("/families/{fid}/tasks")
async def create_task(fid: str, body: GoalIn, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, EDITORS)
    if not body.goal.strip():
        raise HTTPException(422, "goal is empty")
    task = await orchestrator.create_task(session, fid, body.goal.strip())
    task = await orchestrator.run_task(session, task.id)
    return await task_out(session, task)


@router.get("/families/{fid}/tasks")
async def list_tasks(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    rows = (await session.execute(select(Task).where(Task.family_id == fid).order_by(Task.created_at.desc()))).scalars().all()
    return [await task_out(session, t) for t in rows]


@router.get("/tasks/{tid}")
async def get_task(tid: str, user: AuthUser = U, session: AsyncSession = DB):
    t = await session.get(Task, tid)
    if not t:
        raise HTTPException(404)
    await member_of(session, user, t.family_id, None)
    return await task_out(session, t)


@router.post("/families/{fid}/sos")
async def sos(fid: str, body: SosIn, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    who, ctx = "a family member", {}
    if body.person_id:
        p = await session.get(Person, body.person_id)
        if p and p.family_id == fid:
            who, ctx = p.name, {"city": p.city, "person": p.name}
    task = await orchestrator.create_task(session, fid, f"SOS: {who} needs emergency help (chest pain)", ctx)
    if body.simulate_dispatch_failure:
        plan = task.state["plan"]
        plan[0]["args"] = {**plan[0].get("args", {}), "fail": True}
        task.state = {**task.state, "plan": plan}
        await session.commit()
    task = await orchestrator.run_task(session, task.id)
    return await task_out(session, task)


@router.get("/families/{fid}/approvals")
async def list_approvals(fid: str, status: str | None = None, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    q = select(Approval).where(Approval.family_id == fid).order_by(Approval.created_at.desc())
    if status:
        q = q.where(Approval.status == status)
    return [approval_out(a) for a in (await session.execute(q)).scalars().all()]


@router.post("/approvals/{aid}/decision")
async def decide(aid: str, body: DecisionIn, user: AuthUser = U, session: AsyncSession = DB):
    appr = await session.get(Approval, aid)
    if not appr:
        raise HTTPException(404)
    await member_of(session, user, appr.family_id, SPONSOR)  # only the sponsor can release money
    if body.approve and settings.require_signature:
        fam = await session.get(Family, appr.family_id)
        if not fam.device_public_key or not body.signature:
            raise HTTPException(401, "biometric signature required")
        try:
            Ed25519PublicKey.from_public_bytes(bytes.fromhex(fam.device_public_key)).verify(
                bytes.fromhex(body.signature), appr.challenge.encode()
            )
        except (InvalidSignature, ValueError) as e:
            raise HTTPException(401, "invalid signature") from e
        appr.signature = body.signature
    try:
        task = await orchestrator.decide_approval(session, aid, body.approve)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    return await task_out(session, task)


# ---------- consent ----------
@router.get("/families/{fid}/consents")
async def list_consents(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    rows = (await session.execute(select(Consent).where(Consent.family_id == fid).order_by(Consent.created_at))).scalars().all()
    latest: dict[tuple, Consent] = {}
    for c in rows:
        latest[(c.grantee, c.scope)] = c
    return [{"grantee": c.grantee, "scope": c.scope, "granted": c.granted, "expires_at": c.expires_at}
            for c in latest.values()]


@router.post("/families/{fid}/consents")
async def set_consent(fid: str, body: ConsentIn, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, SPONSOR)
    exp = datetime.now(UTC) + timedelta(hours=body.ttl_hours) if body.ttl_hours else None
    session.add(Consent(family_id=fid, grantee=body.grantee, scope=body.scope, granted=body.granted, expires_at=exp))
    await audit.log(session, fid, "human:sponsor", "consent.granted" if body.granted else "consent.revoked",
                    {"grantee": body.grantee, "scope": body.scope})
    await session.commit()
    return {"ok": True}


# ---------- vault ----------
def extract_fields(text: str) -> dict:
    out: dict = {}
    for key, pat in {
        "expiry": r"(?:expiry|expires|valid (?:till|until))[:\s]+(\d{4}-\d{2}-\d{2})",
        "due_date": r"due(?: date)?[:\s]+(\d{4}-\d{2}-\d{2})",
        "amount_inr": r"(?:₹|rs\.?|inr)\s*([\d,]+)",
        "policy_no": r"policy (?:no\.?|number)[:\s]+([A-Z0-9-]+)",
        "bp": r"\bbp[:\s]+(\d{2,3}/\d{2,3})",
        "hba1c": r"hba1c[:\s]+([\d.]+)",
    }.items():
        m = re.search(pat, text, re.I)
        if m:
            out[key] = m.group(1)
    return out


@router.post("/families/{fid}/documents")
async def add_document(fid: str, body: DocIn, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, EDITORS)
    d = Document(family_id=fid, person_id=body.person_id, title=body.title, category=body.category,
                 text=redact_text(body.text), extracted=extract_fields(body.text))
    session.add(d)
    await audit.log(session, fid, "human:sponsor", "document.added", {"title": body.title, "category": body.category})
    await session.commit()
    return {"id": d.id, "title": d.title, "category": d.category, "extracted": d.extracted}


@router.get("/families/{fid}/documents")
async def list_documents(fid: str, q: str | None = None, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    rows = (await session.execute(select(Document).where(Document.family_id == fid).order_by(Document.created_at.desc()))).scalars().all()
    if q:
        rows = [d for d in rows if q.lower() in (d.title + " " + d.text).lower()]
    return [{"id": d.id, "title": d.title, "category": d.category, "text": d.text, "extracted": d.extracted,
             "has_file": bool(d.file_path), "created_at": d.created_at} for d in rows]


# ---------- notifications / audit ----------
@router.get("/families/{fid}/notifications")
async def notifications(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    rows = (await session.execute(select(Notification).where(Notification.family_id == fid).order_by(Notification.created_at.desc()).limit(50))).scalars().all()
    return [{"id": n.id, "channel": n.channel, "to": n.to, "message": n.message, "urgent": n.urgent,
             "task_id": n.task_id, "delivery": n.delivery, "created_at": n.created_at} for n in rows]


@router.get("/families/{fid}/audit")
async def audit_trail(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    rows = (await session.execute(select(AuditLog).where(AuditLog.family_id == fid).order_by(AuditLog.id.desc()).limit(100))).scalars().all()
    return {"intact": await audit.verify_chain(session, fid),
            "entries": [{"id": r.id, "actor": r.actor, "action": r.action, "payload": r.payload,
                         "hash": r.hash[:12], "created_at": r.created_at} for r in rows]}


# ---------- guardian / digest ----------
@router.post("/families/{fid}/guardian/run")
async def run_guardian(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, EDITORS)
    return {"findings": await guardian.run_checks(session, fid)}


@router.get("/families/{fid}/digest")
async def digest(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    """'Maa's Day' stories for the swipeable daily digest."""
    people = (await session.execute(select(Person).where(Person.family_id == fid, Person.role == "parent"))).scalars().all()
    today = datetime.now(UTC).date()
    audits = (await session.execute(select(AuditLog).where(AuditLog.family_id == fid).order_by(AuditLog.id.desc()).limit(300))).scalars().all()
    stories = []
    for p in people:
        taken = [a for a in audits if a.action == "med.taken" and a.payload.get("person") == p.id and a.created_at.date() == today]
        n_meds = len(p.medications)
        n_taken = len({a.payload.get("medicine") for a in taken})
        stories.append({"person": p.name, "kind": "medicines", "person_id": p.id,
                        "title": f"{p.name} took {min(n_taken, n_meds)} of {n_meds} medicines" if n_meds else f"{p.name}: no medicines on file",
                        "value": min(1.0, n_taken / n_meds) if n_meds else 0.0,
                        "ok": bool(n_meds) and n_taken >= n_meds})
        ci = p.last_checkin_at
        checked = bool(ci and ci.date() == today)
        stories.append({"person": p.name, "kind": "checkin", "person_id": p.id,
                        "title": f"{p.name} checked in today" if checked else f"{p.name} hasn't checked in yet",
                        "value": 1.0 if checked else 0.0, "ok": checked})
    done = (await session.execute(select(Task).where(Task.family_id == fid, Task.status == "done"))).scalars().all()
    for t in done[:3]:
        stories.append({"person": "", "kind": "task", "title": f"Done: {t.goal}", "ok": True})
    return {"stories": stories}


# ---------- emergency card & caregiver links ----------
@router.post("/people/{pid}/emergency-card")
async def emergency_card(pid: str, ttl_hours: int = 24 * 365, user: AuthUser = U, session: AsyncSession = DB):
    p = await session.get(Person, pid)
    if not p:
        raise HTTPException(404)
    await member_of(session, user, p.family_id, SPONSOR)
    token = tokens.issue("emergency", p.id, ttl_hours * 3600)
    await audit.log(session, p.family_id, "human:sponsor", "emergency_card.issued", {"person": p.id})
    await session.commit()
    return {"token": token, "url": f"/e/{token}"}


@router.get("/emergency/{token}")
async def emergency_view(token: str, session: AsyncSession = DB):
    payload = tokens.verify(token, "emergency")
    if not payload:
        raise HTTPException(403, "link expired or invalid")
    p = await session.get(Person, payload["s"])
    contacts = (await session.execute(select(Person).where(Person.family_id == p.family_id, Person.is_emergency_contact))).scalars().all()
    await audit.log(session, p.family_id, "public:emergency_card", "emergency_card.viewed", {"person": p.id})
    await session.commit()
    return {"name": p.name, "blood_group": p.blood_group, "allergies": p.allergies, "conditions": p.conditions,
            "medications": p.medications, "contacts": [{"name": c.name, "role": c.role, "phone": c.phone} for c in contacts]}


@router.post("/tasks/{tid}/caregiver-link")
async def caregiver_link(tid: str, hours: int = 12, user: AuthUser = U, session: AsyncSession = DB):
    t = await session.get(Task, tid)
    if not t:
        raise HTTPException(404)
    await member_of(session, user, t.family_id, SPONSOR)
    token = tokens.issue("caregiver", t.id, hours * 3600)
    await audit.log(session, t.family_id, "human:sponsor", "caregiver_link.issued", {"task": t.id, "hours": hours})
    await session.commit()
    return {"token": token, "url": f"/c/{token}"}


class CheckinIn(BaseModel):
    status: str  # arrived | done | issue
    note: str = ""


@router.get("/caregiver/{token}")
async def caregiver_view(token: str, session: AsyncSession = DB):
    payload = tokens.verify(token, "caregiver")
    if not payload:
        raise HTTPException(403, "link expired or invalid")
    t = await session.get(Task, payload["s"])
    steps = (await session.execute(select(TaskStep).where(TaskStep.task_id == t.id).order_by(TaskStep.seq))).scalars().all()
    # Scoped view: the job and the steps. Never bank, ID or health details.
    return {"task_id": t.id, "job": t.goal, "steps": [{"title": s.title, "status": s.status} for s in steps]}


@router.post("/caregiver/{token}/checkin")
async def caregiver_checkin(token: str, body: CheckinIn, session: AsyncSession = DB):
    payload = tokens.verify(token, "caregiver")
    if not payload:
        raise HTTPException(403, "link expired or invalid")
    if body.status not in ("arrived", "done", "issue"):
        raise HTTPException(422, "status must be arrived|done|issue")
    t = await session.get(Task, payload["s"])
    await audit.log(session, t.family_id, "caregiver", f"caregiver.{body.status}", {"task": t.id, "note": body.note})
    session.add(Notification(family_id=t.family_id, task_id=t.id, channel="push", to="sponsor",
                             message=f"Caregiver update: {body.status}. {body.note}".strip(), urgent=body.status == "issue"))
    await session.commit()
    return {"ok": True}


# ---------- inbound messages (WhatsApp) ----------
class WhatsAppIn(BaseModel):
    from_phone: str
    text: str


async def process_inbound(session: AsyncSession, from_phone: str, text: str) -> dict:
    """Channel-agnostic: a parent's message (typed or transcribed voice note) becomes a check-in or an agent task."""
    digits = re.sub(r"\D", "", from_phone)[-10:]
    people = (await session.execute(select(Person))).scalars().all()
    person = next((p for p in people if digits and re.sub(r"\D", "", p.phone)[-10:] == digits), None)
    if not person:
        return {"reply": "Sorry, I don't recognise this number. Please ask your family to add you on Aangan."}
    t = text.strip().lower()
    if t in ("1", "ok", "took", "taken", "done", "✅", "theek", "thik", "ठीक"):
        person.last_checkin_at = datetime.now(UTC)
        await audit.log(session, person.family_id, f"human:{person.name}", "checkin", {"via": "whatsapp"})
        await session.commit()
        return {"reply": "Thank you! I've let your family know you're fine. 🦜"}
    task = await orchestrator.create_task(session, person.family_id, f"{text} (from {person.name} on WhatsApp)",
                                          {"city": person.city, "person": person.name})
    task = await orchestrator.run_task(session, task.id)
    if task.kind == "sos" and task.status == "escalated":
        msg = "I could not confirm an ambulance yet. Our emergency team and your family have been alerted right now."
    elif task.kind == "sos":
        msg = "Help is on the way, and your family has been alerted."
    else:
        msg = "I'm on it. I'll update you soon."
    return {"reply": msg, "task_id": task.id}


@router.post("/dev/whatsapp", summary="Dev-only: simulate an inbound WhatsApp text without Meta")
async def dev_whatsapp(body: WhatsAppIn, session: AsyncSession = DB):
    if not settings.enable_dev_endpoints:
        raise HTTPException(404)
    return await process_inbound(session, body.from_phone, body.text)


@router.get("/app/latest", summary="Newest installable app version (for the in-app update prompt)")
async def app_latest():
    return {"version_code": settings.app_latest_version_code, "version_name": settings.app_latest_version_name,
            "min_version_code": settings.app_min_version_code, "apk_url": settings.app_apk_url,
            "notes": settings.app_release_notes}


@router.get("/health")
async def health():
    return {"ok": True, "llm": settings.llm_provider}


# ---------- me / members ----------
@router.get("/me/families")
async def my_families(user: AuthUser = U, session: AsyncSession = DB):
    """Families the caller belongs to (claims any pending email invites first)."""
    invites = (await session.execute(select(FamilyMember).where(FamilyMember.user_id == "", FamilyMember.email == user.email))).scalars().all() if user.email else []
    for inv in invites:
        inv.user_id = user.id
    if invites:
        await session.commit()
    rows = (await session.execute(select(FamilyMember, Family).join(Family, Family.id == FamilyMember.family_id).where(FamilyMember.user_id == user.id))).all()
    return [{"id": f.id, "name": f.name, "role": m.role} for m, f in rows]


class MemberIn(BaseModel):
    email: str
    role: str = "relative"


@router.get("/families/{fid}/members")
async def list_members(fid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid)
    rows = (await session.execute(select(FamilyMember).where(FamilyMember.family_id == fid))).scalars().all()
    return [{"id": m.id, "email": m.email, "role": m.role, "joined": bool(m.user_id)} for m in rows]


@router.post("/families/{fid}/members")
async def invite_member(fid: str, body: MemberIn, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, SPONSOR)
    email = body.email.strip().lower()
    if "@" not in email or body.role not in ("relative", "parent"):
        raise HTTPException(422, "a valid email and a role of relative or parent are required")
    existing = (await session.execute(select(FamilyMember).where(FamilyMember.family_id == fid, FamilyMember.email == email))).scalars().first()
    if existing:
        raise HTTPException(409, "that person is already in this family")
    session.add(FamilyMember(family_id=fid, user_id="", email=email, role=body.role))
    await audit.log(session, fid, f"human:{user.email}", "member.invited", {"email": email, "role": body.role})
    await session.commit()
    return {"ok": True, "note": "They get access the first time they sign in with this email."}


@router.delete("/families/{fid}/members/{mid}")
async def remove_member(fid: str, mid: str, user: AuthUser = U, session: AsyncSession = DB):
    await _family(session, user, fid, SPONSOR)
    m = await session.get(FamilyMember, mid)
    if not m or m.family_id != fid:
        raise HTTPException(404)
    if m.user_id == user.id:
        raise HTTPException(409, "you can't remove yourself")
    await session.delete(m)
    await audit.log(session, fid, f"human:{user.email}", "member.removed", {"email": m.email})
    await session.commit()
    return {"ok": True}
