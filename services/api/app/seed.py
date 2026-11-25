from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import audit
from .deps import AuthUser
from .models import Consent, Document, Family, FamilyMember, Person

DEMO_PHONES = ["+14255550101", "+919822000111", "+919822000112", "+919822000222", "+919822000333"]


async def seed_demo(session: AsyncSession, user: AuthUser) -> str:
    # Phone numbers route inbound messages, so they must be unique: the newest demo family takes the demo numbers.
    old = (await session.execute(select(Person).where(Person.phone.in_(DEMO_PHONES)))).scalars().all()
    for p in old:
        p.phone = ""
    fam = Family(name="The Sharma Family", auto_approve_limit_inr=2500)
    session.add(fam)
    await session.flush()
    fid = fam.id
    session.add(FamilyMember(family_id=fid, user_id=user.id, email=user.email, role="sponsor"))
    soon = (datetime.now(UTC) + timedelta(days=12)).date().isoformat()
    due = (datetime.now(UTC) + timedelta(days=3)).date().isoformat()
    people = [
        Person(family_id=fid, name="Rahul Sharma", role="sponsor", city="Seattle", timezone="America/Los_Angeles",
               language="en", phone="+14255550101", is_emergency_contact=True, avatar="rahul"),
        Person(family_id=fid, name="Sunita Sharma (Maa)", role="parent", city="Pune", language="mr",
               phone="+919822000111", blood_group="B+", allergies=["Penicillin"],
               conditions=["Type 2 diabetes", "Hypertension"],
               medications=[{"name": "Metformin 500mg", "times": ["08:00", "20:00"]},
                            {"name": "Amlodipine 5mg", "times": ["09:00"]}],
               aadhaar="2345 6789 0123", pan="ABCDE1234F", last_checkin_at=datetime.now(UTC), avatar="maa"),
        Person(family_id=fid, name="Mohan Sharma (Papa)", role="parent", city="Pune", language="hi",
               phone="+919822000112", blood_group="O+", allergies=[], conditions=["Hypertension"],
               medications=[{"name": "Telmisartan 40mg", "times": ["09:00"]}],
               aadhaar="3456 7890 1234", pan="PQRSX5678L", avatar="papa"),
        Person(family_id=fid, name="Mr. Kulkarni", role="neighbour", city="Pune", phone="+919822000222",
               is_emergency_contact=True, language="mr"),
        Person(family_id=fid, name="Anita (Building Secretary)", role="secretary", city="Pune",
               phone="+919822000333", is_emergency_contact=True),
    ]
    session.add_all(people)
    session.add_all([
        Document(family_id=fid, title="Maa - HbA1c report (Oct)", category="medical",
                 text="HbA1c: 7.4 BP: 138/86 Lab: Thyrocare Pune", extracted={"hba1c": "7.4", "bp": "138/86"}),
        Document(family_id=fid, title="Star Health policy", category="insurance",
                 text=f"Policy no: SH-884221 Expiry: {soon} Sum insured Rs 5,00,000",
                 extracted={"policy_no": "SH-884221", "expiry": soon}),
        Document(family_id=fid, title="MSEDCL electricity bill", category="utility",
                 text=f"Amount Rs 1,840 due: {due}", extracted={"amount_inr": "1,840", "due_date": due}),
    ])
    session.add(Consent(family_id=fid, grantee="agent:Healthcare & SOS Triage", scope="health.read"))
    await audit.log(session, fid, "system", "demo.seeded", {})
    await session.commit()
    return fid
