import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{_db}"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["DB_NULL_POOL"] = "true"
os.environ["ENABLE_DEV_ENDPOINTS"] = "true"
os.environ["LIVE_LOOKUPS"] = "false"
# Tests must never call real services, whatever is in .env
for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_ALLOWED_RECIPIENTS", "SARVAM_API_KEY", "GEMINI_API_KEY"):
    os.environ[_k] = ""

import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.db import init_db  # noqa: E402
from fastapi import Header  # noqa: E402

from app.deps import AuthUser, current_user  # noqa: E402
from app.main import app  # noqa: E402


async def _fake_user(x_test_user: str = Header(default="u1")) -> AuthUser:
    """Tests pick an identity with the X-Test-User header; real token checks have their own tests."""
    return AuthUser(id=x_test_user, email=f"{x_test_user}@test.dev", name=x_test_user)


app.dependency_overrides[current_user] = _fake_user


@pytest_asyncio.fixture
async def client():
    await init_db()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        yield c


@pytest_asyncio.fixture
async def fid(client):
    r = await client.post("/v1/demo/seed")
    return r.json()["family_id"]
