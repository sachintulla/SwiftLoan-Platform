# Running the unified customer journey (WS5) locally

Everything below is **already running on this machine** and was verified end to
end on 2026-07-31. Nothing has been committed or pushed.

| Service | URL | Notes |
|---|---|---|
| Admin dashboard | http://localhost:4001 | `admin@swiftloan.com` / `admin123` |
| Marketing website | http://localhost:4002 | Ello voice widget enabled |
| API | http://localhost:4000 | also on the LAN, see §5 |
| Postgres 17.10 | `127.0.0.1:5432` | db `swiftloan_db` |

---

## 1. Restarting after a reboot

Postgres here is a **portable install**, not a Windows service, so it does not
come back on its own. There was no Postgres, Docker or admin rights available,
and `winget install` hit a UAC prompt that cannot be approved non-interactively.

```sh
# 1. Postgres
C:/pg17/bin/pg_ctl.exe -D C:/Users/veerendra.bhimireddy/pgdata \
  -l C:/Users/veerendra.bhimireddy/pgdata/server.log start

# 2. the three apps (separate terminals)
cd server        && npm start      # :4000
cd admin         && npm run dev    # :4001
cd website-next  && npm run dev    # :4002
```

> **Worth doing before the team demo:** install PostgreSQL properly
> (`winget install PostgreSQL.PostgreSQL.17`, approve the UAC prompt) so it runs
> as a service and survives reboots. Then just point `DATABASE_URL` at it.

**Gotchas that cost real time here, so they are written down:**
- The portable cluster lives at `C:\pg17` + `C:\Users\veerendra.bhimireddy\pgdata`
  on purpose. Running it from the scratchpad failed with
  `plpgsql is not available` and then `0xC0000142` — the scratchpad path is
  ~200 characters, and Postgres blew past Windows' `MAX_PATH` once it appended
  its own subdirectories. Keep these paths short.
- `prisma generate` fails behind the corporate TLS interception with
  `self-signed certificate in certificate chain`. Prefix it:
  `NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate`. That is only needed to
  download the engine binary — never put it in a deployed script.
- The portable build ships only `initdb`, `pg_ctl` and `postgres` — there is no
  `psql`. Use `npx prisma db execute --url … --stdin` for ad-hoc SQL.

## 2. Rebuilding the database from scratch

```sh
cd server
NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate
npx prisma db push          # creates the 7 new WS5 tables
npm run seed                # lender-partner catalog
npm run seed:ws4            # demo users / events / leads / downloads
npm run seed:integrations   # Ello + Upshot config from server/.env
```

## 3. The demo walkthrough (all of this was verified working)

A customer named **Demo Kumar / 9876500011** already exists with the full
journey on it. Search for them in **Customers 360**.

```
[website ] lead_captured      form submit with ?utm_campaign=diwali
[voice   ] call_queued
[voice   ] call_completed     Ello webhook → stage "contacted"
[app     ] otp_requested
[app     ] otp_verified       ← the stitch: website + app become one record
```

The record shows origin **campaign / diwali / google**, the app account
**linked**, and next action *"Nudge to check eligibility"*. OTP verify returned
`priorInquiries` with the ₹5,00,000 Personal Loan, so the in-app voice agent
opens by referencing the website enquiry instead of starting cold.

**To run it live in front of the team:**
1. http://localhost:4002/?utm_campaign=diwali → "Check your rate" → submit with
   a fresh 10-digit number.
2. Admin → **Customers 360** → the person appears at `lead_captured`, already
   attributed to the campaign.
3. Trigger a call (Campaigns, or `POST /api/admin/calls/trigger`). With Ello
   disabled this records a `failed` attempt with a clear reason; posting Ello's
   `call.completed` webhook shape advances them to `contacted`.
4. Request + verify OTP for the same number (dev OTP `123456`) → they advance to
   `registered` and the pre-install and post-install activity merge.

### Campaigns (verified)
Campaigns → New campaign → upload a spreadsheet. Recognised headings are
case/spacing-insensitive: `name`/`full name`, `phone`/`mobile number`, `email`,
`city`, `product`/`loan type`, `amount`/`loan amount`. Unknown columns are kept
in `extra`.

A 7-row test file produced **4 inserted, 3 skipped** with per-row reasons
(duplicate phone in file, invalid number, missing phone). `+91 98765 00022` and
`09876500023` both normalised to bare 10 digits; rupee amounts converted to
paise. Start respects `concurrency`, guards against double-start, and
auto-completes.

### Drop-off nudges (verified)
`stageStallDetector` runs every 5 minutes. Any non-terminal customer whose
`stageEnteredAt` is older than `STAGE_STALL_MINUTES` (default 20) gets a nudge,
rate-limited by `NUDGE_COOLDOWN_MINUTES` (default 120). It fired within 20s of a
customer being backdated, recorded `stage_stalled` + `nudge_sent`, and queued
`OutboundRequest` rows.

With Upshot disabled those rows sit at `pending` with
`lastError: "Upshot integration is disabled"`, retrying with exponential backoff
and giving up at 5 attempts. **Nothing is lost** — once Upshot is configured they
start sending.

> To watch it fire quickly, drop `STAGE_STALL_MINUTES` to `1` in `server/.env`
> and restart the API. **Put it back to 20 afterwards**, or the demo nudges
> everybody constantly.
>
> If you backdate a row by hand, use `(now() at time zone 'utc')` — Postgres
> `now()` returns IST wall-clock while Prisma reads the column as UTC, so a
> plain `now() - interval '30 minutes'` lands 5.5 hours in the *future* and the
> detector correctly ignores it.

## 4. Integrations (P2 — Upshot still needs credentials)

Managed at **http://localhost:4001/integrations**; seeded from `server/.env` via
`npm run seed:integrations`. Secrets are write-only — never read back.

**Ello** is wired to the real API
(<https://docs.getello.ai/api-reference/calls/create-call>):
`POST {baseUrl}/api/agents/{agentId}/calls` with an `X-API-Key` header,
`to_number` in E.164, `agent_type: "telephonic"`, `call_type: "outbound"`, and
the call id read from `data.conversation_id`. Your key and agent
`6a6c630e2f3448069caa1fe5` are in `server/.env`.

Ello fires **four events per call** (`call.started`, `call.completed`,
`call.processed`, `call.recording`) and sends **no outcome field**, so the
handler derives status from the event name plus `error_reason` and records the
timeline entry only on the first terminal event — otherwise every call would be
counted two or three times.

For a real call the webhook must be publicly reachable:
```sh
npx localtunnel --port 4000     # or: ngrok http 4000
# then set ELLO_WEBHOOK_URL to https://<tunnel>/api/webhooks/ello/call-outcome
```
Ello documents no signature header, so the route falls back to our own
`X-Webhook-Secret` / `ELLO_WEBHOOK_SECRET`. If Ello cannot send that header the
route is effectively unauthenticated — restrict it at the network level before
production.

**Upshot** is built to the enterprise-access spec (auth travels in the request
**body**, not headers): `POST /event/add` with `{auth, data}` where `data.eventId`
must be unique (we send the `OutboundRequest` id, so retries are idempotent), and
`POST /userprofile/add` with `{filter, updateSet.profile, auth}` sent only on
first contact.

Still needed — set in `server/.env` and re-run `npm run seed:integrations`:
```
UPSHOT_BASE_URL=""      # India region host
UPSHOT_APP_ID=""
UPSHOT_ACCOUNT_ID=""
UPSHOT_API_KEY=""
```
The India host is deliberately blank rather than guessed: their docs are a
JS-rendered Swagger UI, and a wrong region would silently write to the wrong
tenant.

## 5. Running the app on a physical phone

Set `DEV_API_BASE` in [`src/config/build.ts`](../src/config/build.ts) to your
laptop's LAN address, then build:

```ts
const DEV_API_BASE = 'http://172.18.6.28:4000/api';   // this machine's Wi-Fi IP
```

```sh
npx react-native start --reset-cache
npm run android          # or: npm run ios
```

The API already answers on `http://172.18.6.28:4000` (verified), so a phone on
the same Wi-Fi can reach it. `localhost` and the emulator alias `10.2.2.2`/
`10.0.2.2` are not reachable from a real device — that is what makes "Send OTP"
appear to hang for ~30 seconds.

**Set it back to `''` before any real build.** `DEV_API_BASE` also drives
`SWIFTLOAN_TRACK_BASE` now; previously that was declared but never assigned, so
tracking always went to the deployed host regardless of `API_BASE`.

## 6. State of the tree

All three TypeScript workspaces typecheck at zero errors, the 143 Jest tests
pass, and the admin dashboard builds all 16 routes.

The work is additive: no existing Prisma model was changed, no existing route
changed except added journey side-effects, and the WebRTC/voice stack was not
touched.

One deliberate behaviour change: **six mobile events were previously wrong**, not
merely missing. They fired on screen *arrival* — "OTP Verified" fired when the
user reached the OTP screen, before typing anything. They now fire on the real
action, so funnel numbers will legitimately differ from last week's.
