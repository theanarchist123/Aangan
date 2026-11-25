"""Public-facing gateway for Meta's WhatsApp webhook.

Point your tunnel (cloudflared / ngrok) at THIS app (port 8001), not at the main API (port 8000).
It forwards exactly one path and returns 404 for everything else, so the rest of the (login-less)
prototype API is never reachable from the internet.

    uv run uvicorn tools.webhook_gateway:app --port 8001
"""

import os

import httpx
from fastapi import FastAPI, Request, Response

UPSTREAM = os.environ.get("AANGAN_API", "http://127.0.0.1:8000")
ALLOWED = "/v1/webhooks/whatsapp"
FORWARD_HEADERS = {"content-type", "x-hub-signature-256", "x-hub-signature"}

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.api_route(ALLOWED, methods=["GET", "POST"])
async def forward(request: Request) -> Response:
    headers = {k: v for k, v in request.headers.items() if k.lower() in FORWARD_HEADERS}
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.request(request.method, UPSTREAM + ALLOWED, params=request.query_params,
                            content=await request.body(), headers=headers)
    return Response(r.content, status_code=r.status_code, media_type=r.headers.get("content-type"))
