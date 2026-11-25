"""Deterministic safety boundaries. Nothing in here calls an LLM, and agents cannot bypass it:
every money/medical/sensitive action is routed through these functions by the tool executor."""

import re
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Consent, Family

AADHAAR_RE = re.compile(r"\b(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b")
PAN_RE = re.compile(r"\b([A-Z]{5})(\d{4})([A-Z])\b")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?91[ -]?)?[6-9]\d{9}(?!\d)")


def mask_aadhaar(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    return f"XXXX XXXX {digits[-4:]}" if len(digits) == 12 else "XXXX XXXX XXXX"


def mask_pan(value: str) -> str:
    v = value.strip().upper()
    return f"{v[:2]}XXX{'X' * 4}{v[-1]}" if len(v) == 10 else "XXXXXXXXXX"


def redact_text(text: str) -> str:
    """Strip Aadhaar / PAN / phone numbers before any text leaves for an LLM."""
    text = AADHAAR_RE.sub(lambda m: f"XXXX XXXX {m.group(3)}", text)
    text = PAN_RE.sub(lambda m: f"{m.group(1)[:2]}XXX{'X' * 4}{m.group(3)}", text)
    return PHONE_RE.sub("[phone]", text)


@dataclass
class SpendDecision:
    allowed_auto: bool
    reason: str


# Categories that always need a human regardless of amount.
ALWAYS_ASK = {"medical_consent", "document_share", "legal", "property_sale", "unknown_amount"}


def decide_spend(family: Family, amount_inr: int, category: str) -> SpendDecision:
    rule = (family.category_rules or {}).get(category)
    if category == "unknown_amount":
        return SpendDecision(False, "the exact amount isn't confirmed, so a human must check it first")
    if category in ALWAYS_ASK or rule == "always_ask":
        return SpendDecision(False, f"'{category}' always needs your approval")
    if rule == "never_auto":
        return SpendDecision(False, f"you set '{category}' to never run automatically")
    if amount_inr > family.auto_approve_limit_inr:
        return SpendDecision(
            False, f"INR {amount_inr:,} is above your auto-approve limit of INR {family.auto_approve_limit_inr:,}"
        )
    return SpendDecision(True, f"INR {amount_inr:,} is within your INR {family.auto_approve_limit_inr:,} limit")


async def has_consent(session: AsyncSession, family_id: str, grantee: str, scope: str) -> bool:
    rows = (
        (
            await session.execute(
                select(Consent).where(
                    Consent.family_id == family_id, Consent.grantee == grantee, Consent.scope == scope
                )
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(UTC)
    for c in sorted(rows, key=lambda r: r.created_at):  # latest decision wins
        last = c
    if not rows:
        return False
    exp = last.expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    return last.granted and (exp is None or exp > now)
