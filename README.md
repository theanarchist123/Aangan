# Aangan: agentic family care for NRIs

> Your family's courtyard, wherever you are. AI agents that look after parents in India, while the NRI child stays in charge of every big decision.

Built against the *Agentic AI Family Care & Concierge Platform for NRIs* RFP. This is a working **prototype** with real login, a real database, and several real integrations. The parts that need commercial agreements (ambulances, hospital systems, BBPS payments, telephony) are **sandbox connectors**, and the app says so wherever they appear.

## Run it

```bash
# API (Python 3.12+, uv)               http://localhost:8000   Swagger at /docs
cd services/api && uv sync
cp ../../.env.example .env             # fill in your keys (see "Configuration")
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Web                                   http://localhost:3000
cd apps/web && npm install && npm run build && npx next start -p 3000

# Mobile (Expo Go on your phone)
cd apps/mobile && npm install
# put EXPO_PUBLIC_API_URL=http://<your-PC-Wi-Fi-IP>:8000 in apps/mobile/.env
npx expo start -c                      # scan the QR with Expo Go
```

Tests: `cd services/api && uv run pytest -q` (53 tests, offline). Against Postgres: `TEST_DATABASE_URL=<url> uv run pytest`.

## What is real

| Capability | How | Status |
|---|---|---|
| **Accounts & login** | Supabase Auth (email + password), proxied through `/v1/auth/*`; every request's token is verified with Supabase and cached 60 s | Real, live-tested |
| **Authorization** | Every family route checks membership and role: `sponsor` (money, limits, consent, sharing), `relative` (view + create), `parent` (check-in, SOS). Non-members get 404 | Real, tested incl. cross-user isolation |
| **Database** | Supabase Postgres (Mumbai pooler), row-level security on every table (the public anon key reads nothing), append-only audit trigger | Real |
| **Documents** | Photo/PDF → private Supabase Storage → Gemini reads it (title, category, dates, amounts) → Aadhaar/PAN redacted from searchable text. Original opens through a 5-minute signed link | Real, live-tested |
| **Voice** | Recording → bundled ffmpeg → Sarvam speech-to-text (Hindi, Marathi, Tamil, mixed speech). WebM, M4A, 3GP, OGG all verified | Real, live-tested |
| **WhatsApp** | Meta Cloud API webhook (handshake, HMAC signature check, replay protection), text and voice notes; alerts are sent through it | Real, needs your Meta setup; delivery status is recorded honestly |
| **Hospitals & weather** | OpenStreetMap (Nominatim) nearest hospitals; Open-Meteo weather for the parent's city | Real, live-tested |
| **AI planner** | Gemini proposes plans; tool names are validated, amounts come from the user's own words, SOS never calls an LLM | Real |
| **Safety gate** | Spending limit, always-ask categories, masking, 30 s escalation: plain code the model cannot bypass | Real, tested |
| **Guardian** | Background loop (hourly) checks every family; no repeat alerts within 24 h | Real |
| **Partner API** | API keys, rate limits, metering, consent-gated hospital packet, FHIR R4 bundle, discharge push, signed webhooks | Real, tested |
| **Light / dark theme** | System / Light / Dark on web and mobile, remembered | Real |

## What is a sandbox

Clearly labelled in the UI wherever it appears:

- **Ambulance dispatch, hospital summary delivery, bill payment (BBPS), diagnostics and home-service booking, outbound phone calls.** They simulate success. In an emergency call **112 / 108**.
- **Biometric approval** uses the phone's real fingerprint/Face ID prompt as a local gate. The server-side Ed25519 signature path exists (`REQUIRE_SIGNATURE=true`) but the apps do not hold a signing key yet.
- **Email is not verified at sign-up** (accounts are created pre-confirmed so the free email quota doesn't block users). Add verification or Google sign-in before going public.

## Configuration (`services/api/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?ssl=require` (or leave for SQLite) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Auth + Storage. The service-role key stays on the server |
| `LLM_PROVIDER=gemini`, `GEMINI_API_KEY` | Planner and document reading (free tier may train on prompts: **fake data only**) |
| `SARVAM_API_KEY` | Voice transcription |
| `WHATSAPP_*` | `VERIFY_TOKEN`, `APP_SECRET`, `ACCESS_TOKEN`, `PHONE_NUMBER_ID`, and `ALLOWED_RECIPIENTS` (test-mode allow-list) |

Database setup: start the API once (it creates the tables), then run `supabase/migrations/0001…0003` in order.

## WhatsApp setup (Meta test number)

1. Run the API **and the webhook-only gateway**: `cd services/api && uv run uvicorn tools.webhook_gateway:app --port 8001`. Tunnel only the gateway; the main API is not meant to be public.
2. `cloudflared tunnel --url http://localhost:8001`, then in Meta → WhatsApp → **Configuration**: callback `<tunnel>/v1/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to **messages**.
3. API Setup → add your own number to the recipient list. Add the same number to `WHATSAPP_ALLOWED_RECIPIENTS`.
4. Message the test number. WhatsApp only allows free-form replies within 24 h of your last message, so a failed delivery shows as "not delivered" with the reason.

## Roles

| Role | Can |
|---|---|
| `sponsor` | Everything: approve money, change limits, consent, invite people, emergency cards |
| `relative` | View everything, create tasks/documents/people. Cannot approve, change limits or share |
| `parent` | Check in, mark medicines, trigger SOS |

## Still not built

- Real telephony (Exotel), BBPS/UPI/Account Aggregator, ABDM, hospital and TPA integrations.
- Email verification, password reset, Google/phone sign-in (phone needs a paid SMS provider).
- Encryption of Aadhaar/PAN at rest with KMS (stored as plain text in the dev database).
- A durable scheduler (Inngest/Temporal): timers run in-process and are lost on restart. Webhook delivery is inline.
- Push notifications (Expo Go no longer supports remote push; needs a development build).
- The mobile app has been verified in a phone-sized browser and bundles for Android, but has **not** been run on a physical phone by me.
