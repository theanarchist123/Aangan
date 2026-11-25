import hashlib
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AuditLog


def _digest(prev: str, family_id: str, actor: str, action: str, payload: dict) -> str:
    body = json.dumps([prev, family_id, actor, action, payload], sort_keys=True, default=str)
    return hashlib.sha256(body.encode()).hexdigest()


async def log(
    session: AsyncSession, family_id: str, actor: str, action: str, payload: dict | None = None
) -> AuditLog:
    payload = payload or {}
    last = (
        await session.execute(
            select(AuditLog).where(AuditLog.family_id == family_id).order_by(AuditLog.id.desc()).limit(1)
        )
    ).scalar_one_or_none()
    prev = last.hash if last else ""
    row = AuditLog(
        family_id=family_id,
        actor=actor,
        action=action,
        payload=payload,
        prev_hash=prev,
        hash=_digest(prev, family_id, actor, action, payload),
    )
    session.add(row)
    await session.flush()
    return row


async def verify_chain(session: AsyncSession, family_id: str) -> bool:
    rows = (
        (await session.execute(select(AuditLog).where(AuditLog.family_id == family_id).order_by(AuditLog.id)))
        .scalars()
        .all()
    )
    prev = ""
    for r in rows:
        if r.prev_hash != prev or r.hash != _digest(prev, r.family_id, r.actor, r.action, r.payload):
            return False
        prev = r.hash
    return True
