"""Goal -> plan. Offline deterministic planner by default; Claude planner when configured.
The model only *proposes* steps; tool names are validated against the registry and every
step still passes the deterministic safety gate at execution time."""

import json
import re

from pydantic import BaseModel, Field, ValidationError

from ..config import settings
from ..connectors import TOOLS
from ..safety import redact_text


class PlannedStep(BaseModel):
    tool: str
    title: str
    args: dict = Field(default_factory=dict)
    amount_inr: int = 0
    category: str | None = None  # defaults to the tool's category


class Plan(BaseModel):
    kind: str = "general"
    steps: list[PlannedStep]


def _amount(goal: str, default: int) -> int:
    m = re.search(r"(?:₹|rs\.?|inr)\s*([\d,]+)", goal, re.I)
    return int(m.group(1).replace(",", "")) if m else default


# Emergency phrases in the languages the parents actually speak. Deliberately broad: a false alarm is cheap,
# a missed emergency is not.
EMERGENCY_WORDS = (
    "chest pain", "ambulance", "sos", "emergency", "fell", "fall", "unconscious", "breath", "heart attack", "stroke",
    "सीने में दर्द", "एम्बुलेंस", "एंबुलेंस", "बेहोश", "गिर", "सांस", "साँस", "दिल का दौरा", "आपातकाल", "बचाओ",
    "छातीत दुखत", "रुग्णवाहिका", "चक्कर", "श्वास",
    "நெஞ்சு வலி", "ஆம்புலன்ஸ்", "மூச்சு", "மயக்கம்",
    "ఛాతీ నొప్పి", "అంబులెన్స్", "శ్వాస", "స్పృహ",
    "বুকে ব্যথা", "অ্যাম্বুলেন্স", "শ্বাস", "অজ্ঞান",
    "છાતીમાં દુખાવો", "એમ્બ્યુલન્સ", "શ્વાસ", "બેભાન",
    "ਛਾਤੀ ਵਿੱਚ ਦਰਦ", "ਐਂਬੂਲੈਂਸ", "ਸਾਹ", "ਬੇਹੋਸ਼",
)


def is_emergency(goal: str) -> bool:
    g = goal.lower()
    return any(w in g for w in EMERGENCY_WORDS)


def mock_plan(goal: str) -> Plan:
    g = goal.lower()
    if is_emergency(goal):
        return Plan(
            kind="sos",
            steps=[
                PlannedStep(tool="dispatch_ambulance", title="Dispatch nearest ambulance with GPS location"),
                PlannedStep(
                    tool="send_hospital_summary",
                    title="Send medical summary to the ER before arrival",
                    args={"hospital": "nearest ER"},
                ),
                PlannedStep(tool="send_message", title="Alert family and local contacts", args={"to": "family"}),
                PlannedStep(
                    tool="pay_bill",
                    title="Pay hospital admission deposit",
                    args={"biller": "Hospital admission deposit"},
                    amount_inr=_amount(goal, 15000),
                    category="emergency",
                ),
            ],
        )
    if any(w in g for w in ("blood test", "diagnostic", "lab", "sugar test", "checkup")):
        return Plan(
            kind="diagnostics",
            steps=[
                PlannedStep(tool="place_call", title="Call partner lab to confirm a slot", args={"to": "partner lab"}),
                PlannedStep(
                    tool="book_diagnostics",
                    title="Book home sample collection",
                    args={"test": "Blood test (home collection)"},
                    amount_inr=_amount(goal, 899),
                    category="medical_service",
                ),
                PlannedStep(tool="send_message", title="Confirm slot with parent on WhatsApp", args={"to": "parent"}),
            ],
        )
    if any(w in g for w in ("bill", "electricity", "water", "gas", "tax", "recharge")):
        biller = "Electricity" if "electric" in g else "Utility"
        return Plan(
            kind="bill",
            steps=[
                PlannedStep(
                    tool="pay_bill",
                    title=f"Pay {biller.lower()} bill via BBPS",
                    args={"biller": biller},
                    amount_inr=_amount(goal, 1840),
                    category="utility",
                ),
                PlannedStep(tool="send_message", title="Save receipt to the vault and notify you", args={"to": "sponsor"}),
            ],
        )
    if any(w in g for w in ("plumber", "electrician", "repair", "driver", "inspection", "maid", "carpenter")):
        svc = next((w for w in ("plumber", "electrician", "driver", "carpenter", "inspection") if w in g), "Technician")
        return Plan(
            kind="errand",
            steps=[
                PlannedStep(
                    tool="book_service",
                    title=f"Schedule a verified {svc}",
                    args={"service": svc.title()},
                    amount_inr=_amount(goal, 600),
                    category="home_service",
                ),
                PlannedStep(tool="send_message", title="Tell the caretaker and building secretary", args={"to": "local contacts"}),
            ],
        )
    return Plan(
        kind="general",
        steps=[PlannedStep(tool="send_message", title="Share your request with the family circle", args={"to": "family"})],
    )


SYSTEM = (
    "You are the Master Orchestrator for an NRI family-care platform in India. "
    "Convert the user's goal into a short plan (max 6 steps). Reply with JSON only: "
    '{"kind": "sos|diagnostics|bill|errand|general", "steps": [{"tool": str, "title": str, "args": object, '
    '"amount_inr": int, "category": str|null}]}. '
    f"Allowed tools: {', '.join(TOOLS)}. Never invent tools. Put real INR costs in amount_inr."
)


async def llm_plan(goal: str) -> Plan:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2000,
        system=SYSTEM,
        messages=[{"role": "user", "content": redact_text(goal)}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    start, end = text.find("{"), text.rfind("}")
    return Plan.model_validate(json.loads(text[start : end + 1]))


async def gemini_plan(goal: str) -> Plan:
    import httpx

    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent",
            headers={"x-goog-api-key": settings.gemini_api_key},
            json={
                "systemInstruction": {"parts": [{"text": SYSTEM}]},
                "contents": [{"role": "user", "parts": [{"text": redact_text(goal)}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
            },
        )
        r.raise_for_status()
    parts = r.json()["candidates"][0]["content"]["parts"]
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    return Plan.model_validate(json.loads(text))


MONEY_TOOLS = {"pay_bill", "book_diagnostics", "book_service"}


def _amount_in_goal(goal: str) -> int | None:
    m = re.search(r"(?:₹|rs\.?|inr)\s*([\d,]+)", goal, re.I)
    return int(m.group(1).replace(",", "")) if m else None


def harden(plan: Plan, goal: str) -> Plan:
    """The LLM proposes; it must not control what the safety gate sees.
    - Non-spending tools carry no amount.
    - Spending tools take the amount from the user's own words; an LLM-invented or missing amount
      is never trusted: unknown amounts are routed to a human via the 'unknown_amount' category."""
    stated = _amount_in_goal(goal)
    for st in plan.steps:
        if st.tool not in MONEY_TOOLS:
            st.amount_inr = 0
            continue
        amount = stated if stated is not None else st.amount_inr
        st.amount_inr = max(0, int(amount))
        if stated is None:
            st.category = "unknown_amount"
    return plan


async def make_plan(goal: str) -> Plan:
    plan = mock_plan(goal)
    if plan.kind == "sos":
        return plan  # emergencies never wait on (or trust) an LLM
    provider = settings.llm_provider
    if (provider == "anthropic" and settings.anthropic_api_key) or (provider == "gemini" and settings.gemini_api_key):
        try:
            candidate = await (gemini_plan(goal) if provider == "gemini" else llm_plan(goal))
            if candidate.kind == "sos":
                return mock_plan("SOS emergency ambulance")  # the model may flag an emergency; it never writes the plan
            if candidate.steps and all(s.tool in TOOLS for s in candidate.steps):
                return harden(candidate, goal)
        except (ValidationError, ValueError, Exception):  # noqa: BLE001 - never let the planner crash a task
            pass
    return plan
