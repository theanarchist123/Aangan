import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .agents import guardian
from .agents.orchestrator import escalate_stalled
from . import integrations
from .models import Family
from sqlalchemy import select
from .config import settings
from .db import SessionLocal, init_db
from .deps import AuthUser, current_user
from .routes.api import router
from .routes.auth import router as auth_router
from .routes.media import router as media_router
from .routes.partner import public as partner_public
from .routes.whatsapp import router as whatsapp_router
from .routes.partner import router as partner_router
from .seed import seed_demo


async def _watchdog_loop() -> None:
    while True:
        await asyncio.sleep(settings.watchdog_interval_seconds)
        try:
            async with SessionLocal() as s:
                await escalate_stalled(s)
        except Exception:  # noqa: BLE001 - the watchdog must never die
            pass


async def _guardian_loop() -> None:
    """The Proactive Guardian: every interval, check every family for missed check-ins, expiring policies and bills."""
    await asyncio.sleep(30)
    while True:
        try:
            async with SessionLocal() as s:
                for fid in (await s.execute(select(Family.id))).scalars().all():
                    await guardian.run_checks(s, fid)
        except Exception:  # noqa: BLE001 - the scheduler must never die
            pass
        await asyncio.sleep(max(1, settings.guardian_interval_minutes) * 60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    await integrations.ensure_bucket()
    tasks = [asyncio.create_task(_watchdog_loop()), asyncio.create_task(_guardian_loop())]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="Aangan API", version="0.1.0", lifespan=lifespan,
              description="Agentic family-care platform for NRIs: data vault, agent engine, safety gates.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_methods=["*"],
                   allow_headers=["*"])
app.include_router(auth_router, prefix="/v1")
app.include_router(router, prefix="/v1")
app.include_router(media_router, prefix="/v1")
app.include_router(whatsapp_router, prefix="/v1")
app.include_router(partner_public, prefix="/v1")
app.include_router(partner_router, prefix="/v1")


@app.post("/v1/demo/seed")
async def demo_seed(user: AuthUser = Depends(current_user)):
    """Creates the Sharma demo family for the signed-in user, who becomes its sponsor."""
    async with SessionLocal() as s:
        return {"family_id": await seed_demo(s, user)}
