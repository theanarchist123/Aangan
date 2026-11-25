"""Authentication and authorization.

Clients sign in with Supabase Auth (email + password) through our /auth endpoints and send the access token as
`Authorization: Bearer <token>`. We verify every token with Supabase itself (no shared secret to leak), cache the
result for a minute, and then check family membership and role on every family-scoped route."""

import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_session
from .models import FamilyMember


@dataclass
class AuthUser:
    id: str
    email: str
    name: str = ""


_CACHE: dict[str, tuple[float, AuthUser]] = {}


async def verify_token(token: str) -> AuthUser:
    if not settings.supabase_url:
        raise HTTPException(503, "authentication is not configured on this server")
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"apikey": settings.supabase_anon_key or settings.supabase_service_role_key,
                         "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as e:
        raise HTTPException(503, "could not reach the sign-in service") from e
    if r.status_code != 200:
        raise HTTPException(401, "your session has expired, please sign in again")
    j = r.json()
    return AuthUser(id=j["id"], email=(j.get("email") or "").lower(), name=(j.get("user_metadata") or {}).get("name", ""))


async def current_user(authorization: str = Header(default="")) -> AuthUser:
    parts = authorization.split(None, 1)
    token = parts[1].strip() if len(parts) == 2 and parts[0].lower() == "bearer" else ""
    if not token:
        raise HTTPException(401, "please sign in", headers={"WWW-Authenticate": "Bearer"})
    hit = _CACHE.get(token)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    user = await verify_token(token)
    if len(_CACHE) > 5000:
        _CACHE.clear()
    _CACHE[token] = (time.monotonic() + 60, user)
    return user


async def member_of(session: AsyncSession, user: AuthUser, family_id: str, roles: tuple[str, ...] | None = None) -> FamilyMember:
    """Return the caller's membership in this family, or raise. Non-members get 404 so a family's existence isn't leaked."""
    m = (await session.execute(
        select(FamilyMember).where(FamilyMember.family_id == family_id, FamilyMember.user_id == user.id)
    )).scalars().first()
    if m is None and user.email:
        invite = (await session.execute(
            select(FamilyMember).where(FamilyMember.family_id == family_id, FamilyMember.user_id == "",
                                       FamilyMember.email == user.email)
        )).scalars().first()
        if invite:  # first sign-in after being invited: claim it
            invite.user_id = user.id
            await session.commit()
            m = invite
    if m is None:
        raise HTTPException(404, "family not found")
    if roles and m.role not in roles:
        raise HTTPException(403, "your role in this family does not allow that")
    return m


CurrentUser = Depends(current_user)
