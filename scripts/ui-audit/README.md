# Admin dashboard UI audit harness

Four small Playwright scripts that drive the real dashboard in a real browser. They
exist because most of what was wrong with the admin dashboard did not throw — a page
rendered a confident wrong number, or an empty card on a database that had data. Only
looking at the pages caught it.

Findings and history: [`docs/ADMIN_DASHBOARD_REVIEW.md`](../../docs/ADMIN_DASHBOARD_REVIEW.md).

## Setup

Uses **system Edge** via `playwright-core`, so there is no browser download.

```sh
cd scripts/ui-audit
npm init -y            # first time only
npm install playwright-core
```

If Edge lives elsewhere, edit the `EDGE` constant at the top of each script.

Both servers must be running, with a seeded database:

```sh
cd server && npm run seed:all && npm start     # :4000
cd admin  && npm run dev                       # :4001
```

## The scripts

| Script | What it does |
|---|---|
| `audit.js` | Logs in, discovers real entity ids from the API, visits **every** route, and records uncaught page errors, console errors, HTTP ≥ 400, stuck skeletons, which empty states rendered, and a full-page screenshot. Writes `audit/report.json` + `audit/<slug>.png`. |
| `journey-walk.js` | Walks the end-to-end customer journey **by clicking**, never by typing a URL: overview → filtered pipeline → application → customer 360 → app profile → back, plus notification deep-links. Exits non-zero if any hop is broken. |
| `probe.js` | `node probe.js "/leads/<id>" 8000` — follows one route's redirects second by second. Use when a page looks like it hangs, to tell "slow redirect" from "never redirects". |
| `shot.js` | `node shot.js out.png /overview 1440` — one screenshot at a chosen width. |
| `app-tracking-check.js` | Proves the **handset → server → dashboard** path. Logs in the way the mobile app does (OTP), POSTs the exact funnel event names `src/state/store.ts` emits, then asserts each became a JourneyEvent with the right stage — and that telemetry-only events stayed out of the funnel. Needs no browser. |
| `interactive.js` | The controls, not just the pages: filters, search, pagination, deep links, the timeline toggle, mark-as-read, sign-out. Each case is a `TC-*` id from [the test plan](../../docs/ADMIN_DASHBOARD_TEST_PLAN.md). **Mutates** — marks a notification read; re-seed to reset. |
| `manual-extras.js` | The cases the plan had marked "manual" that turned out to be drivable: legacy redirects, role-gated nav (signs in as `ops@`), pagination, audit-log contents. |
| `authguard.js` | Answers one question precisely — is an unauthenticated visitor ever *served data*? Polls the URL every 500ms and records every `/api/admin/*` status, so "slow redirect" cannot be mistaken for "open door". |
| `sms-dryrun.js` | `node sms-dryrun.js ../../server/.env` — builds the exact form body `sendViaVox()` would POST and checks it reproduces the DLT-approved template character-for-character. **Sends nothing.** Worth running before any SMS change: Vox answers `200 Success` even when the operator silently drops a mismatched template. |
| `sms-send.js` | `node sms-send.js ../../server/.env <10-digit-phone> [--send]` — the same request for **one specific number**, printed in full (credentials redacted). Dry run by default; `--send` dials the gateway for real. It **refuses to send** with only half the credential, because the gateway 14xxs every OTP in that state and the failure looks like a DLT problem instead of a config one. Reminds you that HTTP 200 is acceptance, not delivery. |

```sh
node audit.js
node interactive.js
node manual-extras.js
node journey-walk.js
node app-tracking-check.js
node authguard.js
node sms-dryrun.js ../../server/.env
node probe.js "/leads/<id>" 8000
node shot.js overview.png /overview 1280
```

Two lessons baked into these, worth keeping if you edit them:

- **Assert on a condition, not a sleep.** A fixed `waitForTimeout(2500)` reported the auth
  redirect as broken when it was merely slow (~1.5s warm, longer on a cold dev server).
  `waitForURL` fixed it. The same trap produced nine false failures when
  `/customers/[id]` was compiling for the first time.
- **Beware assertions that pass by vacuity.** A "no money under ₹1,000" check ran against a
  website-only customer with no amounts on screen at all, and passed while proving
  nothing. TC-C3 now runs it where money is always present.

## Reading the output

`audit.js` prints one line per route. `clean` means no errors of any kind. Other flags:

- `NAV` — navigation failed outright
- `NET:n` — n requests returned ≥ 400
- `PAGEERR` / `CONSOLE` — uncaught error / console error
- `STUCK_SKELETON:n` — loading skeletons still on screen after settling
- `EMPTY:n` — n empty states rendered. **Not automatically a bug**: a draft campaign
  legitimately has no calls, and an app-origin customer has no website enquiry. Check
  `report.json` for the text and decide.
- `THIN_PAGE` — under 400 characters rendered

## Gotcha: warm the routes first

`next dev` compiles a route on its first request, which can take longer than the
scripts' wait. A cold `/customers/[id]` made `journey-walk.js` report nine false
failures. Hit the routes once before asserting:

```sh
curl -s -o /dev/null localhost:4001/overview
curl -s -o /dev/null localhost:4001/customers/<some-id>
```

`audit.js` is unaffected in practice because it navigates with `waitUntil: 'networkidle'`
and a 5s settle, but a very cold start can still trip it — re-run if a route that
normally passes suddenly flags.

## Also: never `npm run build` while `npm run dev` is running

The build overwrites `admin/.next` underneath the dev server, which then 500s on every
route with `MODULE_NOT_FOUND`. Stop dev, build, delete `.next`, restart dev.
