# Production readiness plan

Written 2026-08-01. Every finding below was verified against the code, not
assumed — file and line references included so each can be checked.

Ordered by **risk, not effort**. P0 items are things that can lose money, leak
data, or let someone in. Nothing in P0 should be deferred for a demo date.

---

## P0 — must fix before any real customer data exists

### 0.1 JWT secrets silently fall back to a known value 🔴

`server/src/config/env.ts:12-13`

```ts
jwtAccessSecret: req('JWT_ACCESS_SECRET', 'dev-access'),
jwtRefreshSecret: req('JWT_REFRESH_SECRET', 'dev-refresh'),
```

If either env var is missing in production the server **starts anyway** using a
secret that is public in this repo. Anyone who reads it can forge an admin token
and call every `/api/admin/*` route.

**Fix:** drop the fallbacks so a missing secret is a hard boot failure in
production. Keep dev defaults only when `NODE_ENV !== 'production'`, and assert
a minimum length so a placeholder like `"changeme"` cannot ship.

### 0.2 Default admin `admin@swiftloan.com` / `admin123` 🔴

`server/prisma/seed.ws4.ts:74-83`

The demo seed creates a `super_admin` with a published password. If `seed:ws4`
is ever run against production — easy to do by accident, it is in the setup docs
— that account exists with full access.

**Fix:** refuse to run the demo seed when `NODE_ENV=production`. Add a separate
`seed:admin` that requires the password to be supplied via env and enforces a
strength rule. Force a password change on first login.

### 0.3 The Ello outcome webhook accepts unsigned posts 🔴

`server/src/modules/webhooks.routes.ts:96-105`

With `ELLO_WEBHOOK_SECRET` unset the route accepts anything. I made that choice
deliberately so local testing works, and it is commented as such — but in
production it means **anyone on the internet can fabricate call outcomes**:
mark customers `contacted`, inject transcripts, or push someone to `lost` via a
`do_not_call` outcome.

**Fix:** require the secret when `NODE_ENV=production` (fail the request, not the
boot). Ello documents no signature header, so also restrict by source IP or put
the route behind a gateway. Add rate limiting — see 1.3.

### 0.4 No database migrations 🔴

`server/prisma/migrations/` does not exist. Every schema change so far used
`prisma db push`.

`db push` is a dev tool: no version history, no reviewable diff, no rollback,
and it will **drop columns to match the schema** — silent data loss on a
production database.

**Fix, in order:**
1. `prisma migrate dev --name init_baseline` against a scratch database to
   capture the current schema as migration 0.
2. Mark it applied on the existing database with `prisma migrate resolve
   --applied`.
3. Switch deploys to `prisma migrate deploy`, and **remove `db push` from every
   script and doc** so nobody reaches for it again.
4. Review each migration for destructive statements before it ships.

### 0.5 Secrets are committed to the repository 🟠

The Ello key appears in four tracked files:

```
render.yaml:53
admin/.env.local.example:15
website-next/.env.local.example:13
website/js/voice-widget.js:17
```

The widget key is *publishable* by design (it ships in the browser bundle), so
exposure is inherent — but committing it means rotation requires a code change
and a deploy, and it is now permanently in git history.

**Fix:** move it to platform env vars, replace the values in `.example` files
with placeholders, and rotate the key with Upshot/Ello once. Treat git history as
compromised for that value. Add a secret scanner to CI (1.2) so this does not
recur.

---

## P1 — before real traffic

### 1.1 The server has no tests 🟠

`server/package.json` has no test script and no framework. The highest-risk
logic in the system is unguarded:

- campaign cadence and the timezone window (I verified it with a throwaway
  script — **27 assertions, all passing** — but that script is not in the repo
  and runs in no pipeline)
- `journey.ts` stage machine and PII redaction
- the stall-rule evaluator and its cooldown
- webhook outcome mapping and the double-count guard

**Fix:** add Vitest (fastest with the existing ESM/tsx setup). Port the 27
schedule assertions in as the first suite, then cover journey stage transitions,
`redactMetadata`, and webhook idempotency. These are pure functions — cheap to
test, and exactly where a silent regression costs real money.

### 1.2 No CI 🟠

`.github/workflows/` does not exist. Nothing stops a broken deploy.

**Fix:** one workflow running on every PR — typecheck all four workspaces, `npx
jest` (mobile), the new server suite, an `admin` production build, plus
`gitleaks` for secret scanning and `npm audit --production`.

### 1.3 Public endpoints are unthrottled 🟠

`server/src/app.ts:39-54` — the limiter covers only `/api/auth` and
`/api/admin/auth`. Unprotected and public:

- `/api/track/*` — anyone can flood `ActivityEvent`/`JourneyEvent`
- `/api/context/create` — anyone can create unlimited leads, **each of which now
  triggers an automatic outbound call** (see 1.4)
- `/api/webhooks/ello/call-outcome`

**Fix:** a global limiter with tighter per-route buckets. `/api/context/create`
needs the strictest, plus a per-phone cap.

### 1.4 Lead auto-call has no spend ceiling 🟠

`server/src/lib/leadCaller.ts` calls every new website lead. Combined with 1.3,
a scripted form-spam attack becomes **a telephony bill and a stream of calls to
real people who never asked**.

**Fix:** a per-phone cooldown (one auto-call per number per 24h), a global
per-hour cap with an alert on breach, and a kill switch
(`LEAD_AUTOCALL_ENABLED=false` already exists — document it as the incident
lever).

### 1.5 Provider credentials are unresolved 🟠

- **Upshot**: no `AppId`, `OwnerId`, `apiKey`, or India region host. Every nudge
  currently queues as `pending` and never sends.
- **Ello**: the campaign key `ak_5LmXxVYD…` returns 401 on all three hosts
  (`api`, `api-dev`, `api-stage`) with *"Invalid API key signature (rejected
  without DB hit)"* — a signature failure, not an expiry. The workspace we can
  reach also has **no agent with a phone number attached**, so real PSTN
  delivery is unproven.

**Fix:** obtain working production credentials for both, then re-run the
end-to-end flow against a real handset before launch.

### 1.6 `patch-package` on a broken upstream 🟡

`patches/react-native-upshotsdk+0.4.9.patch` rewrites `jcenter()` (sunset Feb
2022) to `mavenCentral()`. Correct and CI-safe, but the patch silently stops
applying if Upshot publish a new version.

**Fix:** pin the exact version (not `^0.4.9`), and have CI fail loudly if the
patch does not apply. Ask Upshot to publish a fixed build.

---

## P2 — operational readiness

| # | Item | Why |
|---|---|---|
| 2.1 | **Managed Postgres + automated backups + restore drill** | Today it is a portable install started by hand (`C:\pg17`) that does not survive a reboot. Untested backups are not backups. |
| 2.2 | **Redis for BullMQ** | `startJobs()` falls back to in-process `setInterval`. With more than one API instance **every job runs on every instance** — duplicate calls, duplicate nudges. |
| 2.3 | **Error tracking + uptime alerts** | No Sentry equivalent. Job failures currently vanish into `console.error`. |
| 2.4 | **Structured logging + request ids** | `morgan('dev')` only, and disabled in production. Nothing correlates a webhook to the call it updated. |
| 2.5 | **Health/readiness split** | `/api/health` does not check the database, so a dead DB still reports healthy to a load balancer. |
| 2.6 | **Graceful shutdown** | A deploy mid-`tickCampaign` can leave contacts marked `queued` with no call placed. |
| 2.7 | **Runbook** | How to pause all outbound calling, drain the dispatch queue, and rotate provider keys — while an incident is happening. |

---

## P3 — compliance, and non-negotiable for lending in India

| # | Item | Note |
|---|---|---|
| 3.1 | **DND / DNC scrubbing before every outbound call** | TRAI TCCCP. Neither `leadCaller` nor the campaign dialer checks a registry today. Consent is captured on the website form; it must be *recorded per lead and checked before dialling*, not assumed. |
| 3.2 | **Calling-hour enforcement everywhere** | `leadCaller` honours 09:00–21:00 IST and campaigns have their own window — but a manual `POST /api/admin/calls/trigger` bypasses both. |
| 3.3 | **Data retention policy** | `JourneyEvent` is an unbounded behavioural log on a regulated product. No retention or purge exists. |
| 3.4 | **PII audit** | `redactMetadata()` strips PAN/Aadhaar from journey metadata, but `CallAttempt.rawPayload` stores provider bodies **verbatim** and transcripts are unredacted. |
| 3.5 | **Call recording consent** | Ello returns `recording_url`. Recording without disclosure is unlawful; the agent script must announce it. |
| 3.6 | **RBI DLG alignment** | The website already states LSP status, KFS and grievance officer. Confirm the *voice agent* script makes the same disclosures — it is a Digital Lending App touchpoint. |
| 3.7 | **DPDP Act** | Consent artefacts, purpose limitation, erasure requests. `Consent` model exists but is not wired into the new journey flows. |

---

## Suggested sequence

1. **Week 1 — P0.** Nothing else matters while admin auth can be forged and a
   schema change can drop a column. Migrations (0.4) first; it gates safe
   iteration on everything after.
2. **Week 2 — P1.1–1.4.** Tests and CI before more features, then the rate
   limits and spend ceiling that make the system safe to expose.
3. **Week 3 — P1.5 + P2.** Real credentials and a genuine end-to-end call, in
   parallel with managed Postgres, Redis and error tracking.
4. **Before launch — P3.** DND scrubbing and consent are legal gates, not
   polish. 3.1 and 3.5 in particular can stop a launch.

## What is already solid

Worth stating so effort goes where it is needed: all four workspaces typecheck
clean, 143 mobile tests pass, the journey spine is additive (no existing model
changed), provider calls are timeout-bounded and never throw into a request
path, the dispatch queue has idempotency and backoff, and the campaign scheduler
correctly refuses to dial outside its window — verified live.
