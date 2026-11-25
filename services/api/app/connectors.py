"""Mock provider connectors. Each mirrors the interface a real integration (hospital API,
ambulance aggregator, BBPS via Setu, Exotel calls) would implement, so they can be swapped in later.
Set `fail=True` in args to simulate a provider failure (used to test escalation)."""

import asyncio
from dataclasses import dataclass, field

from .integrations import nearby_hospitals


@dataclass
class ToolResult:
    ok: bool
    summary: str
    data: dict = field(default_factory=dict)


async def _latency() -> None:
    await asyncio.sleep(0)  # keep async shape; real connectors do network IO


async def dispatch_ambulance(args: dict) -> ToolResult:
    await _latency()
    if args.get("fail"):
        return ToolResult(False, "Ambulance aggregator did not confirm dispatch")
    # SANDBOX: no real ambulance network is connected. In India, 108 / 112 are the real emergency numbers.
    return ToolResult(True, "Ambulance dispatched, ETA 11 min (sandbox: call 108 / 112 for a real ambulance)",
                      {"eta_min": 11, "vehicle": "MH-12-AMB-4471", "sandbox": True})


async def send_hospital_summary(args: dict) -> ToolResult:
    await _latency()
    city = (args.get("context") or {}).get("city", "")
    hospitals = await nearby_hospitals(city, limit=3, budget=4) if city else []  # real OpenStreetMap data
    if hospitals:
        h = hospitals[0]
        return ToolResult(True, f"Nearest hospital: {h['name']}, {h['distance_km']} km away. Summary prepared "
                                "(sandbox: hospital systems are not connected, so please call them)",
                          {"hospital": h, "sandbox": True})
    return ToolResult(True, "Medical summary prepared for the nearest ER (sandbox: hospital systems are not connected)",
                      {"sandbox": True})


async def book_diagnostics(args: dict) -> ToolResult:
    await _latency()
    return ToolResult(
        True,
        f"{args.get('test', 'Blood test')} booked for tomorrow 8:00 AM (sandbox booking)",
        {"slot": "08:00", "price_inr": int(args.get("price_inr", 899))},
    )


async def pay_bill(args: dict) -> ToolResult:
    await _latency()
    return ToolResult(
        True, f"Paid {args.get('biller', 'bill')} via BBPS (sandbox: no real money moved)", {"receipt": "BBPS-" + str(abs(hash(str(args))) % 10**8)}
    )


async def book_service(args: dict) -> ToolResult:
    await _latency()
    return ToolResult(True, f"{args.get('service', 'Technician')} scheduled for tomorrow 11:00 AM (sandbox)", {})


async def place_call(args: dict) -> ToolResult:
    await _latency()
    if args.get("fail"):
        return ToolResult(False, "Call to vendor went unanswered after 3 attempts")
    return ToolResult(True, f"Called {args.get('to', 'vendor')} in {args.get('language', 'Hindi')}; confirmed (sandbox: no real call placed)", {})


async def send_message(args: dict) -> ToolResult:
    await _latency()
    return ToolResult(True, f"Message sent to {args.get('to', 'family')}", {})


# name -> (callable, default category, default agent)
TOOLS = {
    "dispatch_ambulance": (dispatch_ambulance, "emergency", "Healthcare & SOS Triage"),
    "send_hospital_summary": (send_hospital_summary, "medical_info", "Healthcare & SOS Triage"),
    "book_diagnostics": (book_diagnostics, "medical_service", "Healthcare & SOS Triage"),
    "pay_bill": (pay_bill, "utility", "Finance, Tax & Claims"),
    "book_service": (book_service, "home_service", "Property & Errand Concierge"),
    "place_call": (place_call, "outreach", "Multilingual Voice & Outreach"),
    "send_message": (send_message, "notify", "Master Orchestrator"),
}
