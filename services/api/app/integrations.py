"""Real third-party integrations. Every function fails soft: on any error it returns None / False so an outage never
breaks a task. Nothing here moves money or contacts a hospital: those stay as clearly-labelled sandbox connectors."""

import asyncio
import base64
import json
import logging
import math
import time
from urllib.parse import quote

import httpx

from .config import settings

log = logging.getLogger("aangan.integrations")
UA = {"User-Agent": "aangan-prototype/0.1"}
_CACHE: dict[str, tuple[float, object]] = {}


def _cached(key: str, ttl: int):
    hit = _CACHE.get(key)
    return hit[1] if hit and hit[0] > time.monotonic() else None


def _put(key: str, ttl: int, value):
    _CACHE[key] = (time.monotonic() + ttl, value)
    return value


# ---------------------------------------------------------------- Supabase Storage
def _sb_headers() -> dict:
    k = settings.supabase_service_role_key
    return {"apikey": k, "Authorization": f"Bearer {k}"}


BUCKET = "documents"


async def ensure_bucket() -> None:
    if not settings.supabase_url:
        return
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            await c.post(f"{settings.supabase_url}/storage/v1/bucket", headers=_sb_headers(),
                         json={"id": BUCKET, "name": BUCKET, "public": False})  # 400/409 if it already exists: fine
    except httpx.HTTPError as e:
        log.warning("bucket check failed: %s", e)


async def store_file(path: str, data: bytes, content_type: str) -> bool:
    if not settings.supabase_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{quote(path)}",
                             headers={**_sb_headers(), "Content-Type": content_type, "x-upsert": "true"}, content=data)
        return r.status_code < 300
    except httpx.HTTPError as e:
        log.warning("storage upload failed: %s", e)
        return False


async def signed_url(path: str, seconds: int = 300) -> str | None:
    if not settings.supabase_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{settings.supabase_url}/storage/v1/object/sign/{BUCKET}/{quote(path)}",
                             headers=_sb_headers(), json={"expiresIn": seconds})
        if r.status_code >= 300:
            return None
        return f"{settings.supabase_url}/storage/v1{r.json()['signedURL']}"
    except (httpx.HTTPError, KeyError):
        return None


# ---------------------------------------------------------------- Gemini document reading
EXTRACT_PROMPT = (
    "You read Indian family documents (prescriptions, lab reports, insurance policies, utility bills, property papers, "
    "ID cards). Return JSON only: {\"title\": short title, \"category\": one of medical|insurance|utility|property|"
    "identity|will|other, \"text\": the full text you can read, \"fields\": {optional keys expiry (YYYY-MM-DD), "
    "due_date (YYYY-MM-DD), amount_inr (digits), policy_no, bp (e.g. 130/80), hba1c, medicines (comma list)}}. "
    "If you cannot read the document, return {\"title\": \"Unreadable document\", \"category\": \"other\", \"text\": \"\", \"fields\": {}}."
)


async def read_document(data: bytes, mime: str) -> dict | None:
    """Gemini's free tier returns 429/503 under load, so retry a couple of times before giving up."""
    if not settings.gemini_api_key:
        return None
    body = {"contents": [{"role": "user", "parts": [
        {"text": EXTRACT_PROMPT}, {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=40) as c:
                r = await c.post(url, headers={"x-goog-api-key": settings.gemini_api_key}, json=body)
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            r.raise_for_status()
            parts = r.json()["candidates"][0]["content"]["parts"]
            out = json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))
            return out if isinstance(out, dict) else None
        except (httpx.HTTPError, KeyError, ValueError, IndexError) as e:
            log.warning("document reading failed (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))
    return None


# ---------------------------------------------------------------- Sarvam speech-to-text
async def to_wav(data: bytes) -> bytes | None:
    """Normalise any recording (browser WebM, Android M4A/3GP, iOS CAF...) to 16 kHz mono WAV with a bundled ffmpeg."""
    try:
        import imageio_ffmpeg

        proc = await asyncio.create_subprocess_exec(
            imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
            "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, err = await asyncio.wait_for(proc.communicate(data), 30)
        if proc.returncode != 0 or len(out) < 100:
            log.warning("ffmpeg could not decode the recording: %s", err.decode(errors="ignore")[:200])
            return None
        return out
    except (OSError, asyncio.TimeoutError, ImportError) as e:
        log.warning("audio conversion failed: %s", e)
        return None


async def transcribe(data: bytes, mime: str) -> str | None:
    if not settings.sarvam_api_key:
        return None
    wav = await to_wav(data)
    if wav is None:
        return None
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post("https://api.sarvam.ai/speech-to-text", headers={"api-subscription-key": settings.sarvam_api_key},
                             files={"file": ("voice.wav", wav, "audio/wav")}, data={"model": "saarika:v2.5"})
        r.raise_for_status()
        return (r.json().get("transcript") or "").strip() or None
    except (httpx.HTTPError, ValueError) as e:
        log.warning("transcription failed: %s", e)
        return None


# ---------------------------------------------------------------- geocoding, hospitals, weather (no keys needed)
async def geocode(city: str) -> tuple[float, float] | None:
    key = f"geo:{city.lower()}"
    if (hit := _cached(key, 0)) is not None:
        return hit or None  # type: ignore[return-value]
    try:
        async with httpx.AsyncClient(timeout=10, headers=UA) as c:
            r = await c.get("https://geocoding-api.open-meteo.com/v1/search", params={"name": city, "count": 1, "country_code": "IN"})
        res = (r.json().get("results") or [None])[0]
        if res:
            return _put(key, 86400, (res["latitude"], res["longitude"]))  # type: ignore[return-value]
    except (httpx.HTTPError, ValueError, KeyError):
        pass
    try:  # fallback: OpenStreetMap Nominatim knows smaller towns
        async with httpx.AsyncClient(timeout=10, headers=UA) as c:
            r = await c.get("https://nominatim.openstreetmap.org/search", params={"q": f"{city}, India", "format": "json", "limit": 1})
        res = r.json()
        if res:
            return _put(key, 86400, (float(res[0]["lat"]), float(res[0]["lon"])))  # type: ignore[return-value]
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        pass
    return None


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


_INFLIGHT: dict[str, asyncio.Task] = {}


async def _fetch_hospitals(city: str, limit: int) -> list[dict]:
    pos = await geocode(city)
    return await _hospitals_via_nominatim(pos, limit) if pos else []


async def _hospitals_via_nominatim(pos: tuple[float, float], limit: int) -> list[dict]:
    """Real hospitals from OpenStreetMap Nominatim: names and locations (no phone numbers). Overpass was dropped: its
    free public servers are frequently at capacity, which is unacceptable inside an emergency flow."""
    d = 0.09  # about 10 km box
    try:
        async with httpx.AsyncClient(timeout=10, headers=UA) as c:
            r = await c.get("https://nominatim.openstreetmap.org/search",
                            params={"q": "hospital", "format": "jsonv2", "limit": 15, "bounded": 1,
                                    "viewbox": f"{pos[1]-d},{pos[0]+d},{pos[1]+d},{pos[0]-d}"})
        out, seen = [], set()
        for x in r.json():
            if x.get("category") != "amenity" or x.get("type") not in ("hospital", "clinic"):
                continue  # drop roads and other places whose name merely contains "hospital"
            name = x.get("name") or x["display_name"].split(",")[0]
            if name.lower() in seen:
                continue
            seen.add(name.lower())
            lat, lon = float(x["lat"]), float(x["lon"])
            out.append({"name": name, "phone": "", "emergency": False,
                        "lat": lat, "lon": lon, "distance_km": round(_km(pos, (lat, lon)), 1),
                        "maps_url": f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=17/{lat}/{lon}"})
        out.sort(key=lambda h: h["distance_km"])
        return out[:limit]
    except (httpx.HTTPError, ValueError, KeyError):
        return []


async def nearby_hospitals(city: str, limit: int = 4, budget: float = 8.0) -> list[dict]:
    """Real hospitals around a city centre from OpenStreetMap.

    Never blocks longer than `budget` seconds: a slow lookup keeps running in the background and fills the cache,
    so the next request is instant. An emergency flow must not wait on a free public server."""
    if not settings.live_lookups or not city.strip():
        return []
    key = f"hosp:{city.lower()}"
    if (hit := _cached(key, 0)) is not None:
        return hit  # type: ignore[return-value]
    task = _INFLIGHT.get(key)
    if task is None or task.done():
        async def run():
            res = await _fetch_hospitals(city, limit)
            if res:
                _put(key, 6 * 3600, res)
            return res
        task = _INFLIGHT[key] = asyncio.create_task(run())
    try:
        return await asyncio.wait_for(asyncio.shield(task), budget)
    except (TimeoutError, asyncio.TimeoutError):
        return []
    except Exception:  # noqa: BLE001 - a lookup failure must never break the caller
        return []


WMO = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle",
       55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 80: "Showers",
       81: "Showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm"}


async def weather(city: str) -> dict | None:
    if not settings.live_lookups or not city.strip():
        return None
    key = f"wx:{city.lower()}"
    if (hit := _cached(key, 0)) is not None:
        return hit  # type: ignore[return-value]
    pos = await geocode(city)
    if not pos:
        return None
    try:
        async with httpx.AsyncClient(timeout=10, headers=UA) as c:
            r = await c.get("https://api.open-meteo.com/v1/forecast",
                            params={"latitude": pos[0], "longitude": pos[1], "current": "temperature_2m,weather_code,is_day"})
        cur = r.json()["current"]
        return _put(key, 900, {"city": city, "temp_c": round(cur["temperature_2m"]), "summary": WMO.get(cur["weather_code"], "—"),
                               "is_day": bool(cur["is_day"])})  # type: ignore[return-value]
    except (httpx.HTTPError, ValueError, KeyError):
        return None


# ---------------------------------------------------------------- WhatsApp Cloud API
async def send_whatsapp(to: str, body: str) -> tuple[bool, str]:
    """Returns (ok, reason). WhatsApp only allows free-form text within 24h of the user's last message."""
    if not (settings.whatsapp_access_token and settings.whatsapp_phone_number_id):
        return False, "not_configured"
    digits = "".join(ch for ch in to if ch.isdigit())
    if not digits:
        return False, "no phone number on file"
    allowed = {x.strip()[-10:] for x in settings.whatsapp_allowed_recipients.split(",") if x.strip()}
    if allowed and digits[-10:] not in allowed:
        return False, "blocked: number is not on the test allow-list"  # never message someone who has not opted in
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_number_id}/messages",
                             headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
                             json={"messaging_product": "whatsapp", "to": digits, "type": "text", "text": {"body": body}})
        if r.status_code < 300:
            return True, "sent"
        err = (r.json().get("error") or {}).get("message", r.text[:120])
        return False, err[:140]
    except (httpx.HTTPError, ValueError) as e:
        return False, f"network error: {e.__class__.__name__}"
