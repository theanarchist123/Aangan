"""Master Orchestrator: a LangGraph state machine that executes a plan step by step.
State is checkpointed to the Task row after every step so a crash/restart resumes exactly where it left off.
Approval pauses the graph; `decide_approval` resumes it."""

from datetime import UTC, datetime
from typing import Any, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..config import settings
from ..connectors import TOOLS, ToolResult
from ..models import Approval, Family, Notification, Person, Task, TaskStep
from ..notify import notify
from ..safety import ALWAYS_ASK, decide_spend
from .planner import make_plan


async def _emit_with(session: AsyncSession, event: str, payload: dict) -> None:
    from ..routes.partner import emit  # lazy: partner routes import the orchestrator

    await emit(session, event, payload)


class GraphState(TypedDict):
    task_id: str
    outcome: str  # continue | paused | done | escalated


async def create_task(session: AsyncSession, family_id: str, goal: str, context: dict | None = None) -> Task:
    plan = await make_plan(goal)
    task = Task(
        family_id=family_id,
        goal=goal,
        kind=plan.kind,
        status="running",
        state={"plan": [s.model_dump() for s in plan.steps], "cursor": 0, "approved": [], "context": context or {}},
    )
    session.add(task)
    await session.flush()
    for i, s in enumerate(plan.steps):
        agent = TOOLS[s.tool][2]
        session.add(TaskStep(task_id=task.id, seq=i, agent=agent, title=s.title))
    await audit.log(session, family_id, "agent:Master Orchestrator", "task.created", {"task": task.id, "goal": goal, "kind": plan.kind})
    await session.commit()
    return task


async def _step_row(session: AsyncSession, task_id: str, seq: int) -> TaskStep:
    return (
        await session.execute(select(TaskStep).where(TaskStep.task_id == task_id, TaskStep.seq == seq))
    ).scalar_one()


async def escalate(session: AsyncSession, task: Task, reason: str) -> None:
    """Emergency Escalation Protocol: human command desk + every local emergency contact, immediately."""
    task.status = "escalated"
    task.state = {**task.state, "escalated_at": datetime.now(UTC).isoformat(), "escalation_reason": reason}
    people = (
        (await session.execute(select(Person).where(Person.family_id == task.family_id, Person.is_emergency_contact)))
        .scalars()
        .all()
    )
    session.add(Notification(family_id=task.family_id, task_id=task.id, channel="desk", to="24x7 command desk",
                             message=f"ESCALATION: {reason}. Task: {task.goal}", urgent=True, delivery="in_app"))
    await notify(session, task.family_id, "family", f"URGENT from Aangan: {reason}. Please check on the family now.",
                 task_id=task.id, urgent=True)
    await audit.log(session, task.family_id, "system:escalation", "task.escalated",
                    {"task": task.id, "reason": reason, "notified": [p.name for p in people]})
    await _emit_with(session, "task.escalated", {"family_id": task.family_id, "task_id": task.id, "reason": reason})


async def execute_node(state: GraphState, config: RunnableConfig) -> dict[str, Any]:
    session: AsyncSession = config["configurable"]["session"]
    task = await session.get(Task, state["task_id"])
    family = await session.get(Family, task.family_id)
    plan, cursor = task.state["plan"], task.state["cursor"]

    if cursor >= len(plan):
        task.status = "done"
        await audit.log(session, task.family_id, "agent:Master Orchestrator", "task.completed", {"task": task.id})
        await session.commit()
        await _emit_with(session, "task.completed", {"family_id": task.family_id, "task_id": task.id})
        return {"outcome": "done"}

    step = plan[cursor]
    row = await _step_row(session, task.id, cursor)
    tool_fn, default_category, agent = TOOLS[step["tool"]]
    category = step.get("category") or default_category
    amount = int(step.get("amount_inr") or 0)
    approved = cursor in task.state.get("approved", [])

    # ---- deterministic safety gate (not LLM-controlled) ----
    gated = amount > 0 or category in ALWAYS_ASK or category in (family.category_rules or {})
    if gated and not approved:
        decision = decide_spend(family, amount, category)
        if not decision.allowed_auto:
            appr = Approval(task_id=task.id, family_id=task.family_id, action=step["title"],
                            reason=decision.reason, amount_inr=amount, category=category)
            session.add(appr)
            row.status = "blocked"
            row.detail = f"Waiting for your approval: {decision.reason}"
            task.status = "awaiting_approval"
            await session.flush()
            await notify(session, task.family_id, "sponsor",
                         f"Aangan needs your approval: {step['title']} (INR {amount:,}). Open the app to approve.",
                         task_id=task.id, urgent=task.kind == "sos")
            await audit.log(session, task.family_id, f"agent:{agent}", "approval.requested",
                            {"task": task.id, "approval": appr.id, "amount_inr": amount, "reason": decision.reason})
            await session.commit()
            return {"outcome": "paused"}

    row.status = "running"
    ctx = task.state.get("context", {})
    if step["tool"] == "send_message":
        # Real: records the message and sends it over WhatsApp to everyone in the audience who has a number.
        args = step.get("args", {})
        stats = await notify(session, task.family_id, str(args.get("to", "family")),
                             f"Aangan update: {task.goal.split(' (from')[0]}", task_id=task.id, urgent=task.kind == "sos")
        bits = [f"{stats['sent']} sent on WhatsApp"] if stats["sent"] else []
        if stats["failed"]:
            bits.append(f"{stats['failed']} could not be delivered")
        if stats["in_app"]:
            bits.append(f"{stats['in_app']} in-app")
        result = ToolResult(
            stats["recipients"] > 0,
            f"Alerted {stats['recipients']} people ({', '.join(bits) or 'none'})" if stats["recipients"]
            else "No one to notify yet: add contacts in the Family tab",
        )
    else:
        result = await tool_fn({**step.get("args", {}), "context": ctx})
    await audit.log(session, task.family_id, f"agent:{agent}", f"tool.{step['tool']}",
                    {"task": task.id, "ok": result.ok, "summary": result.summary, "amount_inr": amount})

    if not result.ok:
        row.status = "failed"
        row.detail = result.summary
        if task.kind == "sos" or category == "emergency":
            await escalate(session, task, result.summary)
            await session.commit()
            return {"outcome": "escalated"}
        task.status = "failed"
        await session.commit()
        return {"outcome": "done"}

    row.status = "done"
    row.detail = result.summary
    task.state = {**task.state, "cursor": cursor + 1}
    await session.commit()
    return {"outcome": "continue"}


def _route(state: GraphState) -> str:
    return "execute" if state["outcome"] == "continue" else END


_graph = StateGraph(GraphState)
_graph.add_node("execute", execute_node)
_graph.set_entry_point("execute")
_graph.add_conditional_edges("execute", _route, {"execute": "execute", END: END})
GRAPH = _graph.compile()


async def run_task(session: AsyncSession, task_id: str) -> Task:
    await GRAPH.ainvoke(
        {"task_id": task_id, "outcome": "continue"},
        config={"configurable": {"session": session}, "recursion_limit": 100},
    )
    task = await session.get(Task, task_id)
    await session.refresh(task)
    return task


async def decide_approval(session: AsyncSession, approval_id: str, approve: bool) -> Task:
    appr = await session.get(Approval, approval_id)
    if appr is None or appr.status != "pending":
        raise ValueError("approval not pending")
    task = await session.get(Task, appr.task_id)
    cursor = task.state["cursor"]
    row = await _step_row(session, task.id, cursor)
    appr.status = "approved" if approve else "declined"
    appr.decided_at = datetime.now(UTC)
    await audit.log(session, appr.family_id, "human:sponsor", f"approval.{appr.status}",
                    {"task": task.id, "approval": appr.id, "amount_inr": appr.amount_inr})
    if approve:
        task.state = {**task.state, "approved": [*task.state.get("approved", []), cursor]}
        row.status = "pending"
    else:
        row.status = "failed"
        row.detail = "Declined by you"
        task.state = {**task.state, "cursor": cursor + 1}
    task.status = "running"
    await session.commit()
    return await run_task(session, task.id)


async def escalate_stalled(session: AsyncSession, now: datetime | None = None) -> int:
    """Watchdog: an SOS task that is still 'running' beyond the escalation window is escalated."""
    now = now or datetime.now(UTC)
    tasks = (await session.execute(select(Task).where(Task.kind == "sos", Task.status == "running"))).scalars().all()
    n = 0
    for t in tasks:
        created = t.created_at if t.created_at.tzinfo else t.created_at.replace(tzinfo=UTC)
        if (now - created).total_seconds() > settings.escalation_seconds:
            await escalate(session, t, f"No confirmation within {settings.escalation_seconds}s")
            n += 1
    await session.commit()
    return n
