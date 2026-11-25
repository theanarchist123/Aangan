"""Notifications that actually go somewhere. Every message is recorded in-app; if the recipient has a phone number it is
also sent over WhatsApp, and the real delivery outcome is stored so the UI never claims something was delivered when it
was not. (WhatsApp only allows free-form text to someone who messaged the number in the last 24 hours, and the Meta test
number only reaches phone numbers added to its allow-list, so 'failed' is a normal, visible outcome.)"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .integrations import send_whatsapp
from .models import Notification, Person

LOCAL_ROLES = ("neighbour", "secretary", "relative", "poa", "caregiver")


async def audience_people(session: AsyncSession, family_id: str, audience: str) -> list[Person]:
    people = (await session.execute(select(Person).where(Person.family_id == family_id))).scalars().all()
    a = audience.lower()
    if a == "sponsor":
        return [p for p in people if p.role == "sponsor"]
    if a in ("parent", "parents"):
        return [p for p in people if p.role == "parent"]
    if a in ("local contacts", "local", "caretaker"):
        return [p for p in people if p.is_emergency_contact and p.role != "sponsor" or p.role in LOCAL_ROLES]
    # "family": the sponsor plus everyone marked as an emergency contact
    return [p for p in people if p.role == "sponsor" or p.is_emergency_contact]


async def notify(session: AsyncSession, family_id: str, audience: str, message: str, *, task_id: str = "",
                 urgent: bool = False, whatsapp: bool = True) -> dict:
    """Create a notification per recipient and try WhatsApp for those with a phone number."""
    sent = failed = in_app = 0
    people = await audience_people(session, family_id, audience)
    for p in people:
        delivery = "in_app"
        if whatsapp and p.phone:
            ok, reason = await send_whatsapp(p.phone, message)
            delivery = "sent" if ok else f"failed: {reason}" if reason != "not_configured" else "not_configured"
        sent += delivery == "sent"
        failed += delivery.startswith("failed")
        in_app += delivery in ("in_app", "not_configured")
        session.add(Notification(family_id=family_id, task_id=task_id, channel="whatsapp" if p.phone and whatsapp else "push",
                                 to=p.name, message=message, urgent=urgent, delivery=delivery))
    await session.flush()
    return {"recipients": len(people), "sent": sent, "failed": failed, "in_app": in_app}
