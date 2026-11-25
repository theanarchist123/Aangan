from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from .config import settings


def normalize_db_url(raw: str) -> str:
    """Forgive the usual copy-paste slips in DATABASE_URL: quotes, a `DATABASE_URL=` prefix, postgres:// schemes,
    sslmode=, Supabase's `[YOUR-PASSWORD]` brackets, and passwords containing @ : / # that need percent-encoding."""
    import re
    from urllib.parse import quote, unquote

    url = raw.strip().strip("\"'").strip()
    if url.upper().startswith("DATABASE_URL="):
        url = url.split("=", 1)[1].strip().strip("\"'")
    if url.startswith("sqlite"):
        return url
    m = re.match(r"^(?:postgres(?:ql)?(?:\+\w+)?)://([^:/@]+):(.*)@([^@/]+)(/[^?]*)?(\?.*)?$", url)
    if not m:
        return url
    user, password, host, path, query = m.group(1), m.group(2), m.group(3), m.group(4) or "/postgres", m.group(5) or ""
    if password.startswith("[") and password.endswith("]"):
        password = password[1:-1]
    query = query.replace("sslmode=require", "ssl=require")
    if "ssl=" not in query:
        query += ("&" if query else "?") + "ssl=require"
    return f"postgresql+asyncpg://{user}:{quote(unquote(password), safe='')}@{host}{path}{query}"


engine = create_async_engine(
    normalize_db_url(settings.database_url), future=True, **({"poolclass": NullPool} if settings.db_null_pool else {"pool_pre_ping": True})
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    from . import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
