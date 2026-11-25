"""Proactive Guardian: background checks that prevent emergencies (missed check-ins, expiring policies,
upcoming bills). Run on a schedule (Inngest/cron in production; /guardian/run here)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..models import Document, Notification, Person
from ..notify import notify


def _aware(dt: datetime | None) -> datetime | None:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=UTC)


async def run_checks(session: AsyncSession, family_id: str, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(UTC)
    findings: list[dict] = []

    parents = (
        (await session.execute(select(Person).where(Person.family_id == family_id, Person.role == "parent")))
        .scalars()
        .all()
    )
    for p in parents:
        last = _aware(p.last_checkin_at)
        if last is None or now - last > timedelta(hours=24):
            findings.append({"type": "missed_checkin", "severity": "high", "person": p.name,
                             "message": f"{p.name} has not checked in for over 24 hours"})

    docs = (await session.execute(select(Document).where(Document.family_id == family_id))).scalars().all()
    for d in docs:
        exp = (d.extracted or {}).get("expiry")
        if exp:
            try:
                when = datetime.fromisoformat(exp).replace(tzinfo=UTC)
            except ValueError:
                continue
            days = (when - now).days
            if days <= 30:
                findings.append({"type": "expiring_document", "severity": "medium" if days >= 0 else "high",
                                 "message": f"{d.title} {'expires in ' + str(days) + ' days' if days >= 0 else 'has expired'}"})
        due = (d.extracted or {}).get("due_date")
        if due:
            try:
                when = datetime.fromisoformat(due).replace(tzinfo=UTC)
            except ValueError:
                continue
            days = (when - now).days
            if 0 <= days <= 5:
                findings.append({"type": "bill_due", "severity": "medium",
                                 "message": f"{d.title} due in {days} days"})

    fresh = []
    for f in findings:
        text = f"Aangan Guardian: {f['message']}"
        recent = (await session.execute(select(Notification).where(
            Notification.family_id == family_id, Notification.message == text,
            Notification.created_at > now - timedelta(hours=24)))).scalars().first()
        if recent:
            continue  # already told them today
        fresh.append(f)
        await notify(session, family_id, "sponsor", text, urgent=f["severity"] == "high")
    if fresh:
        await audit.log(session, family_id, "agent:Proactive Guardian", "guardian.findings", {"count": len(fresh)})
    await session.commit()
    return findings
