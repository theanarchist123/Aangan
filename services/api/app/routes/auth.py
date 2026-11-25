"""Email + password accounts on Supabase Auth, proxied through our API so the apps never hold Supabase keys.

Sign-up creates an already-confirmed account through Supabase's admin API (the free tier's built-in email sender is
limited to a few messages an hour, which would block real users). The trade-off: email ownership is NOT verified.
Add email verification (or Google/phone sign-in) before opening this to the public."""

import re
import time
from collections import defaultdict, deque

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..config import settings
from ..deps import AuthUser, current_user

router = APIRouter(prefix="/auth", tags=["auth"])
_HITS: dict[str, deque[float]] = defaultdict(deque)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _limit(key: str, n: int, per: int = 3600) -> None:
    now = time.monotonic()
    q = _HITS[key]
    while q and now - q[0] > per:
        q.popleft()
    if len(q) >= n:
        raise HTTPException(429, "too many attempts, please try again later")
    q.append(now)


def _need_supabase() -> str:
    if not settings.supabase_url:
        raise HTTPException(503, "authentication is not configured on this server")
    return settings.supabase_url


class SignupIn(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


def _session_out(j: dict) -> dict:
    u = j.get("user") or {}
    return {
        "access_token": j["access_token"], "refresh_token": j["refresh_token"], "expires_in": j.get("expires_in", 3600),
        "user": {"id": u.get("id"), "email": u.get("email"), "name": (u.get("user_metadata") or {}).get("name", "")},
    }


@router.post("/signup", summary="Create an account")
async def signup(body: SignupIn, request: Request):
    base = _need_supabase()
    _limit(f"signup:{request.client.host if request.client else '?'}", 10)
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "please enter a valid email address")
    if len(body.password) < 8:
        raise HTTPException(422, "password must be at least 8 characters")
    key = settings.supabase_service_role_key
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{base}/auth/v1/admin/users", headers={"apikey": key, "Authorization": f"Bearer {key}"},
                         json={"email": email, "password": body.password, "email_confirm": True,
                               "user_metadata": {"name": body.name.strip()}})
    if r.status_code in (400, 409, 422):
        msg = (r.json().get("msg") or r.json().get("message") or "").lower()
        if "already" in msg or "registered" in msg or "exists" in msg:
            raise HTTPException(409, "an account with this email already exists, please sign in")
        raise HTTPException(422, "could not create the account: " + (msg or "invalid details"))
    if r.status_code >= 300:
        raise HTTPException(502, "the sign-in service is unavailable, please try again")
    return await login(LoginIn(email=email, password=body.password), request)


@router.post("/login", summary="Sign in with email and password")
async def login(body: LoginIn, request: Request):
    base = _need_supabase()
    _limit(f"login:{request.client.host if request.client else '?'}:{body.email.lower()}", 15, 600)
    key = settings.supabase_anon_key or settings.supabase_service_role_key
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{base}/auth/v1/token?grant_type=password", headers={"apikey": key},
                         json={"email": body.email.strip().lower(), "password": body.password})
    if r.status_code == 400:
        raise HTTPException(401, "that email or password isn't right")
    if r.status_code >= 300:
        raise HTTPException(502, "the sign-in service is unavailable, please try again")
    return _session_out(r.json())


@router.post("/refresh", summary="Exchange a refresh token for a new session")
async def refresh(body: RefreshIn):
    base = _need_supabase()
    key = settings.supabase_anon_key or settings.supabase_service_role_key
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{base}/auth/v1/token?grant_type=refresh_token", headers={"apikey": key},
                         json={"refresh_token": body.refresh_token})
    if r.status_code >= 400:
        raise HTTPException(401, "your session has expired, please sign in again")
    return _session_out(r.json())


@router.get("/me", summary="The signed-in user")
async def me(user: AuthUser = Depends(current_user)):
    return {"id": user.id, "email": user.email, "name": user.name}
