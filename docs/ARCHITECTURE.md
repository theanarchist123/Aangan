# Architecture & stack decisions

## Shape

```
apps/web (Next.js 16)  ┐
apps/mobile (Expo)     ├──► services/api (FastAPI) ──► SQLAlchemy ──► SQLite (dev) / Postgres+pgvector (prod)
partner systems        ┘        │
                                ├─ agents/orchestrator.py  LangGraph: plan → gate → execute → pause/resume
                                ├─ safety.py               deterministic limits, masking, consent (no LLM)
                                ├─ connectors.py           mock hospital / ambulance / BBPS / calls
                                └─ audit.py                hash-chained audit log
```

## Why these choices

- **FastAPI + Python**: the agent and FHIR ecosystems are Python-first; Pydantic gives strict tool schemas and automatic OpenAPI for partners.
- **LangGraph over CrewAI/AutoGen**: workflows are explicit graphs, so routing is predictable and a run can pause for human approval and resume. Free-form agent chat is the wrong model for ambulance dispatch or payments.
- **The model only proposes.** Tool names are validated against a registry, and every step passes `safety.decide_spend` before it executes. The spending limit, masking and escalation are ordinary code the LLM cannot skip.
- **Next.js + Expo (TypeScript)**: one language across web and mobile, and the RFP requires Next.js for the web portals.
- **Relational family graph, not Neo4j**: a family has dozens of nodes, and SQL plus row-level security keeps one database, one backup and one consent model.
- **Mock connectors behind real interfaces**: BBPS, hospital, ambulance and TPA access need commercial agreements. Each connector is one function returning a `ToolResult`, so swapping in the real provider doesn't touch the orchestrator.

## Safety guarantees (all covered by tests in `services/api/tests`)

| Guarantee | Test |
|---|---|
| A spend above the family limit does not execute until approved; declined means never | `test_large_bill_needs_approval_then_completes`, `test_declined_approval_never_executes` |
| Medical consent, document sharing and legal actions always ask | `test_spend_threshold` |
| Failed SOS dispatch escalates to the desk and every emergency contact | `test_sos_failure_escalates_to_desk_and_contacts` |
| A stalled SOS is escalated by the watchdog after 30 s | `test_watchdog_escalates_stalled_sos` |
| Aadhaar/PAN masked unless consent is granted; revocation takes effect | `test_aadhaar_masked_unless_consented` |
| Editing an audit row is detected | `test_audit_chain_detects_tampering` |
| Partners see nothing without the family's consent, and never another family's data | `test_no_consent_no_data_then_grant_then_revoke`, `test_cannot_read_another_familys_person` |
| Emergency/caregiver links expire and can't be forged | `test_tokens_expire_and_reject_tampering` |

## Moving to production (suggested order)

1. Run `supabase/migrations/0001_core_schema.sql` against Postgres and switch `DATABASE_URL`. Verify RLS with real JWTs.
2. Add authentication (Supabase Auth phone OTP) and replace "family id in the URL" with `family_members` membership checks.
3. Envelope-encrypt Aadhaar/PAN (KMS) and move documents to India-region object storage.
4. Move timers (escalation, Guardian, webhook retries) to a durable scheduler (Inngest or Temporal).
5. Real connectors, starting with WhatsApp Cloud API and ABDM sandbox, then telephony.
6. Register the phone's Ed25519 key in the apps and turn on `REQUIRE_SIGNATURE`.
