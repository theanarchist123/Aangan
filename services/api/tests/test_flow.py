from datetime import UTC, datetime, timedelta

from app import safety, tokens
from app.agents.planner import mock_plan
from app.models import Family


# ---------- pure safety logic ----------
def test_masking_and_redaction():
    assert safety.mask_aadhaar("2345 6789 0123") == "XXXX XXXX 0123"
    assert safety.mask_pan("ABCDE1234F") == "ABXXXXXXXF"
    out = safety.redact_text("Aadhaar 2345 6789 0123, PAN ABCDE1234F, call 9822000111")
    assert "2345" not in out and "ABCDE1234F" not in out and "9822000111" not in out


def test_spend_threshold():
    fam = Family(name="x", auto_approve_limit_inr=2500, category_rules={"rent": "never_auto"})
    assert safety.decide_spend(fam, 2500, "utility").allowed_auto
    assert not safety.decide_spend(fam, 2501, "utility").allowed_auto
    assert not safety.decide_spend(fam, 10, "rent").allowed_auto
    assert not safety.decide_spend(fam, 0, "medical_consent").allowed_auto


def test_tokens_expire_and_reject_tampering():
    t = tokens.issue("emergency", "p1", 60)
    assert tokens.verify(t, "emergency")["s"] == "p1"
    assert tokens.verify(t, "caregiver") is None
    assert tokens.verify(t[:-2] + "00", "emergency") is None
    assert tokens.verify(tokens.issue("emergency", "p1", -1), "emergency") is None


def test_planner_routes_goals():
    assert mock_plan("chest pain, send ambulance").kind == "sos"
    assert mock_plan("get Mom's blood test done").kind == "diagnostics"
    assert mock_plan("pay electricity bill Rs 3,200").steps[0].amount_inr == 3200


# ---------- end-to-end ----------
async def test_small_bill_runs_automatically(client, fid):
    r = await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay electricity bill Rs 1,840"})
    t = r.json()
    assert t["status"] == "done" and not t["approvals"]


async def test_large_bill_needs_approval_then_completes(client, fid):
    t = (await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay electricity bill Rs 9,000"})).json()
    assert t["status"] == "awaiting_approval"
    assert t["steps"][0]["status"] == "blocked"  # money has NOT moved
    appr = t["approvals"][0]
    t2 = (await client.post(f"/v1/approvals/{appr['id']}/decision", json={"approve": True})).json()
    assert t2["status"] == "done"
    assert (await client.post(f"/v1/approvals/{appr['id']}/decision", json={"approve": True})).status_code == 409


async def test_declined_approval_never_executes(client, fid):
    t = (await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay electricity bill Rs 9,000"})).json()
    t2 = (await client.post(f"/v1/approvals/{t['approvals'][0]['id']}/decision", json={"approve": False})).json()
    assert t2["steps"][0]["status"] == "failed" and "Declined" in t2["steps"][0]["detail"]


async def test_raising_limit_removes_gate(client, fid):
    await client.patch(f"/v1/families/{fid}/limits", json={"auto_approve_limit_inr": 20000})
    t = (await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay electricity bill Rs 9,000"})).json()
    assert t["status"] == "done"


async def test_sos_dispatches_then_gates_deposit(client, fid):
    t = (await client.post(f"/v1/families/{fid}/sos", json={})).json()
    assert t["kind"] == "sos" and t["status"] == "awaiting_approval"
    by = {s["title"]: s["status"] for s in t["steps"]}
    assert by["Dispatch nearest ambulance with GPS location"] == "done"
    assert by["Pay hospital admission deposit"] == "blocked"


async def test_sos_failure_escalates_to_desk_and_contacts(client, fid):
    t = (await client.post(f"/v1/families/{fid}/sos", json={"simulate_dispatch_failure": True})).json()
    assert t["status"] == "escalated"
    notes = (await client.get(f"/v1/families/{fid}/notifications")).json()
    recipients = {n["to"] for n in notes if n["urgent"]}
    assert "24x7 command desk" in recipients and "Mr. Kulkarni" in recipients
    assert all(n["channel"] in ("desk", "push", "whatsapp") for n in notes if n["urgent"])


async def test_watchdog_escalates_stalled_sos(client, fid):
    from app.agents.orchestrator import escalate_stalled, create_task
    from app.db import SessionLocal

    async with SessionLocal() as s:
        task = await create_task(s, fid, "SOS ambulance needed")  # planned but never run -> "running"
        n = await escalate_stalled(s, now=datetime.now(UTC) + timedelta(seconds=31))
        assert n >= 1
        await s.refresh(task)
        assert task.status == "escalated"


async def test_aadhaar_masked_unless_consented(client, fid):
    people = (await client.get(f"/v1/families/{fid}/people")).json()
    maa = next(p for p in people if "Maa" in p["name"])
    assert maa["aadhaar"] == "XXXX XXXX 0123"
    assert (await client.get(f"/v1/people/{maa['id']}/health?unmask=true")).status_code == 403
    await client.post(f"/v1/families/{fid}/consents", json={"grantee": "sponsor", "scope": "id.unmask", "ttl_hours": 1})
    ok = await client.get(f"/v1/people/{maa['id']}/health?unmask=true")
    assert ok.status_code == 200 and ok.json()["aadhaar"] == "2345 6789 0123"
    await client.post(f"/v1/families/{fid}/consents", json={"grantee": "sponsor", "scope": "id.unmask", "granted": False})
    assert (await client.get(f"/v1/people/{maa['id']}/health?unmask=true")).status_code == 403


async def test_audit_chain_detects_tampering(client, fid):
    await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Pay electricity bill Rs 100"})
    assert (await client.get(f"/v1/families/{fid}/audit")).json()["intact"] is True
    from sqlalchemy import update
    from app.db import SessionLocal
    from app.models import AuditLog

    blocked = False
    try:
        async with SessionLocal() as s:
            await s.execute(update(AuditLog).where(AuditLog.family_id == fid, AuditLog.action == "task.created").values(actor="evil"))
            await s.commit()
    except Exception:  # noqa: BLE001 - Postgres: the append-only trigger rejects the UPDATE outright
        blocked = True
    if not blocked:  # SQLite has no trigger, so the hash chain must expose the edit
        assert (await client.get(f"/v1/families/{fid}/audit")).json()["intact"] is False


async def test_emergency_card_and_caregiver_scope(client, fid):
    people = (await client.get(f"/v1/families/{fid}/people")).json()
    maa = next(p for p in people if "Maa" in p["name"])
    tok = (await client.post(f"/v1/people/{maa['id']}/emergency-card")).json()["token"]
    card = (await client.get(f"/v1/emergency/{tok}")).json()
    assert card["blood_group"] == "B+" and "Penicillin" in card["allergies"] and "aadhaar" not in card
    assert (await client.get("/v1/emergency/garbage")).status_code == 403

    t = (await client.post(f"/v1/families/{fid}/tasks", json={"goal": "Send a plumber"})).json()
    link = (await client.post(f"/v1/tasks/{t['id']}/caregiver-link")).json()["token"]
    view = (await client.get(f"/v1/caregiver/{link}")).json()
    assert set(view) == {"task_id", "job", "steps"}
    assert (await client.post(f"/v1/caregiver/{link}/checkin", json={"status": "arrived"})).status_code == 200
    assert (await client.post(f"/v1/caregiver/{link}/checkin", json={"status": "bogus"})).status_code == 422


async def test_guardian_flags_expiring_policy_and_bill(client, fid):
    f = (await client.post(f"/v1/families/{fid}/guardian/run")).json()["findings"]
    kinds = {x["type"] for x in f}
    assert {"expiring_document", "bill_due", "missed_checkin"} <= kinds  # Papa never checked in


async def test_whatsapp_sos_honest_reply(client, fid):
    r = (await client.post("/v1/dev/whatsapp", json={"from_phone": "+919822000112", "text": "chest pain, need ambulance"})).json()
    assert "Help is on the way" in r["reply"] or "alerted" in r["reply"]
    unknown = (await client.post("/v1/dev/whatsapp", json={"from_phone": "+10000000000", "text": "hi"})).json()
    assert "recognise" in unknown["reply"]


async def test_vault_extracts_and_redacts(client, fid):
    d = (await client.post(f"/v1/families/{fid}/documents", json={
        "title": "KYC", "category": "identity", "text": "Aadhaar 2345 6789 0123 Policy no: AB-123 Expiry: 2030-01-01"})).json()
    assert d["extracted"]["expiry"] == "2030-01-01"
    docs = (await client.get(f"/v1/families/{fid}/documents?q=kyc")).json()
    assert "2345 6789" not in docs[0]["text"]


# ---------- LLM output is never trusted by the gate ----------
def test_llm_plan_cannot_hide_or_invent_amounts():
    from app.agents.planner import Plan, PlannedStep, harden

    # Model says INR 0 for a payment the user said was 50,000, and invents a cost for an ambulance.
    plan = Plan(kind="bill", steps=[
        PlannedStep(tool="pay_bill", title="pay", amount_inr=0),
        PlannedStep(tool="dispatch_ambulance", title="amb", amount_inr=2500),
    ])
    out = harden(plan, "Pay the hospital Rs 50,000")
    assert out.steps[0].amount_inr == 50000 and out.steps[1].amount_inr == 0

    # No amount in the user's words -> never auto-run, whatever the model says.
    out2 = harden(Plan(kind="bill", steps=[PlannedStep(tool="pay_bill", title="pay", amount_inr=10)]), "pay the bill")
    fam = Family(name="x", auto_approve_limit_inr=2500, category_rules={})
    assert out2.steps[0].category == "unknown_amount"
    assert not safety.decide_spend(fam, out2.steps[0].amount_inr, out2.steps[0].category).allowed_auto


async def test_sos_never_calls_llm(monkeypatch):
    from app.agents import planner
    from app.config import settings

    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "k")

    async def boom(_):  # would be called if SOS went through the model
        raise AssertionError("LLM must not be called for SOS")

    monkeypatch.setattr(planner, "gemini_plan", boom)
    plan = await planner.make_plan("Papa has chest pain, send ambulance")
    assert plan.kind == "sos" and plan.steps[0].tool == "dispatch_ambulance"
