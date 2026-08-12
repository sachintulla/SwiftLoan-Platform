# SwiftLoan — Ello agents & API reference

Verified against the live system on 2026-08-11.

> Secrets are **not** in this file: the repo is public. `<secret>` values live in
> `server/.env` (gitignored) and in Render's environment settings. Agent ids are
> written in full — they are identifiers, not credentials, and are useless
> without the API key.

---

## 1. Ello — connection

| Setting | Value |
|---|---|
| REST base (India) | `https://api-in.getello.ai` |
| WebSocket | `wss://connect-in.getello.ai/ws-ello` |
| Auth header | `X-API-Key: <secret>` |
| Place a call | `POST /api/agents/{agentId}/calls` |
| List agents | `GET /api/agents` |
| Update an agent | `PUT /api/agents/{agentId}` |

Notes that cost time to rediscover:

- **Do not use the `*-stage` hosts.** `connect-stage.getello.ai` does not
  resolve; the HTTPS publish still succeeds while the socket dies with code
  1006, so it looks like a client bug rather than a dead host.
- `PUT` is the only verb that updates an agent — `POST` and `PATCH` both 404.
- `dynamic_variables` must be an **array of plain strings**. Objects are
  rejected with `"dynamic_variables[0]" must be a string`.
- Ello sends **no outcome field** on any webhook. Outcome is either reported by
  the agent through a tool, or inferred from the transcript — see
  `server/src/lib/callOutcome.ts`, which records which of the two it was.

---

## 2. Ello — agents

| Role | Agent id | Name | Phone |
|---|---|---|---|
| `leadCallback` | `6a6c630e2f3448069caa1fe5` | Loan_campaign_agent | **+91 92475 19113** |
| `campaign` | `6a6c630e2f3448069caa1fe5` | Loan_campaign_agent | **+91 92475 19113** |
| `companion` | `6a7197be89c98da763e29b22` | MobileApp companion app | — |
| `websiteCompanion` | `6a7197ff89c98da763e29b23` | Website companion app | — |
| `adminNavigator` | `6a71988489c98da763e29b24` | SwiftLoanAdminUser companion app | — |

All are `type: hybrid`, `voiceEngine: elevenlabs`, status active.

**Only `Loan_campaign_agent` has a phone number**, so it is the only agent that
can place a real outbound call. `leadCallback` and `campaign` therefore point at
the same agent today, and its prompt branches internally on `agent_purpose`
(`website_lead_followup` / `app_dropoff_followup` / `manual_dashboard_call` /
`campaign`). Give them separate agents only when a second number exists.

**What each role does**

| Role | Direction | Purpose |
|---|---|---|
| `leadCallback` | outbound | Calls a visitor ~1 min after they submit the rate form, already knowing what they asked for |
| `campaign` | outbound | Works an uploaded contact list on the campaign schedule |
| `companion` | in-app WebRTC | Mobile app copilot — navigates screens, fills fields by voice |
| `websiteCompanion` | in-browser | The "Talk to Ruby" widget on swiftloan.ai |
| `adminNavigator` | in-browser | Drives the admin dashboard by voice |

**Role → agent id resolution** (first hit wins) — `server/src/lib/agents.ts`:

1. `IntegrationConfig.settings.agents[role]` — set from the dashboard ← *in use*
2. `ELLO_AGENT_<ROLE>` env var
3. `IntegrationConfig.settings.assistantId` — workspace default

Change the mapping at **Configs → Voice agents**, or `PUT /api/admin/agents/roles`.

**Prompts** live in `prompts/` and are pushed with:

```sh
cd server && npm run ello:sync -- --role leadCallback   # or campaign, companion, …
npm run ello:sync -- --role leadCallback --dry          # preview, sends nothing
```

The script backs up the current agent document first (`server/.ello-agent-backup.<role>.json`)
because a prompt is the agent's entire behaviour and Ello keeps no version history.

### ⚠️ Webhook URL — needs changing before go-live

```
current : http://localhost:4000/api/webhooks/ello/call-outcome
required: https://swiftloan-api.onrender.com/api/webhooks/ello/call-outcome
```

Ello cannot reach `localhost`. With the current value **every call is closed as
`failed` after 30 minutes** by the reconciler, and its transcript, outcome,
summary and recording are lost — the call connects, but nothing about it is
recorded, and the conversation memory never gets the summary. Three of the last
five call attempts show exactly this failure.

It is stored in the database, so this is a dashboard change with **no deploy**:
Configs → Voice calling → `webhookUrl`.

---

## 3. Our API

Base URL: `https://swiftloan-api.onrender.com` (local `http://localhost:4000`).
All responses: `{ success, data, message, pagination?, error? }`.

### Public — the lead and voice entry points

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/context/create` | none | **Website lead capture.** Creates Customer + Lead, raises `lead_captured`, returns a context token + `landingUrl`. This is what puts the number in front of the auto-caller. |
| `GET /api/context/{token}` | none | The app resolves a lead's context on first open |
| `POST /api/voice/session` | none | Brokers an Ello session for the browser/app. Holds the API key server-side and resolves role → agent, so no key ever ships to a client. |
| `GET /api/health` | none | Health check |

`POST /api/context/create` body:

```json
{
  "name": "…", "phone": "9XXXXXXXXX", "email": "…", "city": "…",
  "product": "Personal Loan", "amount": 50000000,
  "summary": "…", "source": "website",
  "utm_source": "…", "utm_campaign": "…", "campaignId": "…"
}
```

`amount` is in **paise**. `product` accepts `loanType` as an alias.

### Webhooks — provider → us

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/webhooks/ello/call-outcome` | shared secret | Call status, transcript, recording, `context_data` |
| `POST /api/webhooks/ello/call-outcome-report` | shared secret | Post-processing report |
| `POST /api/webhooks/upshot/trigger-call` | `x-api-key` / `x-webhook-secret` | Lets an Upshot journey place a call |

`trigger-call` enforces **every** guard server-side rather than trusting the
journey: do-not-call refusal, TRAI hours 09:00–21:00 IST, 24h per-number
cooldown, lifetime cap per customer, and an idempotency key claimed *before*
dialling. A refusal returns **200 with `called: false`** and a reason, so a
journey step is not retried into a call.

### Agent-facing — cross-channel memory

Auth: `x-api-key` **or** `x-webhook-secret`. Never open, even in dev.

| Endpoint | Purpose |
|---|---|
| `POST /api/conversations/context` | **Pre-call.** Send `{ phone }`, get the rolling brief of everything said on any channel. `brief` and `known` are mirrored at the top level because Ello's response mapper extracts by name and may not walk nested objects. |
| `GET /api/conversations/context?phone=` | Same, as a GET |
| `POST /api/conversations` | **Post-call.** Record what happened: `{ phone, channel, summary, outcome? }` |
| `GET /api/conversations/summary?phone=` | Just the cumulative summary |

`channel` is one of `phone_outbound`, `phone_inbound`, `website_widget`,
`mobile_app`, `admin`, `whatsapp`.

**Leave `outcome` out if you are unsure** — an unknown outcome is far better
than a wrong one, because it decides who gets contacted next.

### Admin — requires an admin JWT

`POST /api/admin/auth/login` → `data.accessToken`, then `Authorization: Bearer <token>`.

| Endpoint | Role | Purpose |
|---|---|---|
| `POST /api/admin/calls/trigger` | super-admin | Place a call now. `{ phone }`, or `{ phone, lastStep, expectedStep }` to open with a specific drop-off. |
| `GET /api/admin/calls` | admin | Call history, with outcome + provenance |
| `POST /api/admin/whatsapp/send` | super-admin | Send a WhatsApp template or session text |
| `GET /api/admin/whatsapp/status` | admin | Whether WhatsApp is configured |
| `GET /api/admin/agents` | admin | Agents from the Ello account |
| `GET/PUT /api/admin/agents/roles` | admin / super-admin | Read or set the role → agent mapping |
| `GET/PUT /api/admin/integrations/{provider}` | admin | Provider config: `ello`, `upshot`, `infobip` |
| `POST /api/admin/integrations/{provider}/test` | super-admin | Dry run by default; `{ testPhone, confirm: true }` to send for real |
| `GET /api/admin/customers` | admin | The unified people list |
| `GET /api/admin/customers/{id}` | admin | Journey, stage progress, calls, conversations, leads |
| `GET /api/admin/conversations/{phone}` | admin | Conversation history for a number |
| `GET /api/admin/campaigns` | admin | Campaign runner |
| `GET /api/admin/stall-rules` | admin | Step-level drop-off rules |

Both `/calls/trigger` and `/whatsapp/send` reach a real person, so both carry
the same guards: `requireAdmin` + `requireActiveAdmin` + audit logging,
super-admin only, and a do-not-contact refusal that outranks the request.

### App — mobile client

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/otp/request` | Send an OTP (real SMS when a provider is configured; the code is never returned) |
| `POST /api/auth/otp/verify` | Verify and issue tokens — the app's primary login |
| `POST /api/auth/register` | Register by phone |
| `/api/users`, `/api/applications`, `/api/kyc`, `/api/loans`, `/api/catalog`, `/api/support` | The loan funnel |
| `POST /api/track/*` | Fire-and-forget telemetry (event, onboarding step, loan step, session) |

---

## 4. Rate limits

| Scope | Limit |
|---|---|
| `/api` global | shared limiter |
| `/api/auth`, `/api/admin/auth` | tighter — brute-force protection |
| `/api/context` | lead limiter |
| `/api/voice/session` | 20 / minute |
| `/api/conversations` | 120 / minute |
| `/api/webhooks/*` | webhook limiter |
| `/api/track` | track limiter |
