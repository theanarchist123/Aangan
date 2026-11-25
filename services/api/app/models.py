import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _id() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(UTC)


class Family(Base):
    __tablename__ = "families"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String)
    auto_approve_limit_inr: Mapped[int] = mapped_column(Integer, default=2500)
    # Category rules: {"medical": "always_ask", "rent": "never_auto"}
    category_rules: Mapped[dict] = mapped_column(JSON, default=dict)
    device_public_key: Mapped[str] = mapped_column(String, default="")  # hex Ed25519, registered by the NRI phone
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FamilyMember(Base):
    """Who may use a family. user_id is the Supabase auth user; an invite has user_id == '' until that email signs in."""

    __tablename__ = "family_members"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[str] = mapped_column(String, default="", index=True)
    email: Mapped[str] = mapped_column(String, default="", index=True)
    role: Mapped[str] = mapped_column(String)  # sponsor | relative | parent
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Person(Base):
    __tablename__ = "people"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    # sponsor | parent | relative | neighbour | secretary | poa | caregiver
    role: Mapped[str] = mapped_column(String)
    city: Mapped[str] = mapped_column(String, default="")
    timezone: Mapped[str] = mapped_column(String, default="Asia/Kolkata")
    language: Mapped[str] = mapped_column(String, default="en")
    phone: Mapped[str] = mapped_column(String, default="")
    is_emergency_contact: Mapped[bool] = mapped_column(Boolean, default=False)
    blood_group: Mapped[str] = mapped_column(String, default="")
    allergies: Mapped[list] = mapped_column(JSON, default=list)
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    medications: Mapped[list] = mapped_column(JSON, default=list)
    aadhaar: Mapped[str] = mapped_column(String, default="")  # dev only; envelope-encrypt in prod
    pan: Mapped[str] = mapped_column(String, default="")
    last_checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    avatar: Mapped[str] = mapped_column(String, default="")


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"), index=True)
    goal: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String, default="general")  # general | sos | diagnostics | bill
    # planning | running | awaiting_approval | escalated | done | failed
    status: Mapped[str] = mapped_column(String, default="planning")
    state: Mapped[dict] = mapped_column(JSON, default=dict)  # durable graph checkpoint
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class TaskStep(Base):
    __tablename__ = "task_steps"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    agent: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    detail: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="pending")  # pending|running|done|failed|blocked
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    family_id: Mapped[str] = mapped_column(String, index=True)
    action: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(Text)
    amount_inr: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str] = mapped_column(String, default="general")
    status: Mapped[str] = mapped_column(String, default="pending")  # pending|approved|declined
    # Device-held key signs this challenge (WebAuthn-style); verified server-side in prod.
    challenge: Mapped[str] = mapped_column(String, default=_id)
    signature: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Consent(Base):
    __tablename__ = "consents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"), index=True)
    grantee: Mapped[str] = mapped_column(String)  # person id, "agent:<name>", or "partner:<id>"
    scope: Mapped[str] = mapped_column(String)  # health.read, finance.read, docs.read, id.unmask ...
    granted: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"), index=True)
    person_id: Mapped[str] = mapped_column(String, default="")
    title: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String, default="other")  # medical|identity|property|insurance|will
    text: Mapped[str] = mapped_column(Text, default="")
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)
    file_path: Mapped[str] = mapped_column(String, default="")  # private Supabase Storage object
    file_mime: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(String, index=True)
    task_id: Mapped[str] = mapped_column(String, default="")
    channel: Mapped[str] = mapped_column(String)  # push | sms | whatsapp | call | desk
    to: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    delivery: Mapped[str] = mapped_column(String, default="in_app")  # in_app | sent | failed | not_configured
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Partner(Base):
    """An external institution (hospital, bank, insurer/TPA) building on the platform."""

    __tablename__ = "partners"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)  # hospital | bank | insurer
    key_hash: Mapped[str] = mapped_column(String, index=True)  # sha256 of the API key; key shown once
    rate_limit_per_min: Mapped[int] = mapped_column(Integer, default=60)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UsageEvent(Base):
    __tablename__ = "usage_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    partner_id: Mapped[str] = mapped_column(String, index=True)
    endpoint: Mapped[str] = mapped_column(String)
    status: Mapped[int] = mapped_column(Integer, default=200)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WebhookSub(Base):
    __tablename__ = "webhook_subs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    partner_id: Mapped[str] = mapped_column(String, index=True)
    url: Mapped[str] = mapped_column(String)
    events: Mapped[list] = mapped_column(JSON, default=list)  # e.g. ["task.escalated", "claim.updated"]
    secret: Mapped[str] = mapped_column(String)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    sub_id: Mapped[str] = mapped_column(String, index=True)
    event: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    signature: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | delivered | failed
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuditLog(Base):
    """Append-only, hash-chained. Each row commits to the previous row's hash."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    family_id: Mapped[str] = mapped_column(String, index=True)
    actor: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String, default="")
    hash: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
