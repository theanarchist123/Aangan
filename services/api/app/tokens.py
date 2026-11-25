"""Stateless, signed, expiring tokens for emergency QR cards and caregiver task links."""

import base64
import hashlib
import hmac
import json
import time

from .config import settings


def _sig(body: str) -> str:
    return hmac.new(settings.signing_secret.encode(), body.encode(), hashlib.sha256).hexdigest()[:32]


def issue(kind: str, subject: str, ttl_seconds: int, extra: dict | None = None) -> str:
    payload = {"k": kind, "s": subject, "exp": int(time.time()) + ttl_seconds, **(extra or {})}
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"{body}.{_sig(body)}"


def verify(token: str, kind: str) -> dict | None:
    try:
        body, sig = token.split(".")
        if not hmac.compare_digest(sig, _sig(body)):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except (ValueError, json.JSONDecodeError):
        return None
    if payload.get("k") != kind or payload.get("exp", 0) < time.time():
        return None
    return payload
