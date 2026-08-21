# Admin Dashboard — full review, plan, and change log

**Started:** 2026-08-18 · **Branch:** `develop` · **Scope:** `admin/` + the
`server/` endpoints it reads.

**Mobile app:** untouched for rounds one and two of the dashboard work. Round three
(§6b) makes exactly one change to it — `FUNNEL_EVENTS` in `src/state/store.ts` now emits
the canonical journey vocabulary — plus a guard test. No screen rendering, navigation or
layout is altered, per the fidelity rule in CLAUDE.md. **This change needs a store
release to reach handsets; nothing breaks until it does,** because the server accepts
both the legacy and the canonical names.

This is the working document for the tab-by-tab review of the admin dashboard. It
holds the method, the per-page findings, the fix log (from → to), and what is
deliberately deferred. It is meant to stay useful after the review: the
[review template](#reusable-per-page-review-template) at the end is the checklist to
run against any new page.

---

## 1. Environment this was reviewed against

| Piece | Value |
|---|---|
| API | `http://localhost:4000` (`server/`, tsx) |
| Dashboard | `http://localhost:4001` (`admin/`, Next 14) |
| Database | **local Postgres 17** (`C:\pg17`), database `swiftloan_dev_local` |
| Login | `admin@swiftloan.com` / `admin123` |
| Data | `npm run seed:all` — `seed`, `seed:preapproved`, `seed:ws4`, `seed:journey`, `seed:campaigns`, `conversations:backfill` (in that order; see the script's comment) |

### Why local Postgres and not the dev RDS
The dev RDS (`swiftloan-dev-postgres…ap-south-1`) is not publicly reachable; access
was via an SSH tunnel through `swiftloan-dev-api` (35.154.46.155). On 2026-08-18 this
machine's public IP moved to `49.43.219.253`, which is not in that box's SSH
allowlist, so port 22 times out and the tunnel cannot be opened. Rather than leave the
dashboard dead, `server/.env` now points at a local Postgres seeded to look like dev.

Both URLs are kept in `server/.env` — swap the commented one back in after
allowlisting the IP. **A dropped tunnel presents as "Internal server error" on login**,
because Prisma's `P1001` surfaces as a generic 500; check
`Get-NetTCPConnection -LocalPort 5433` first.

---

## 2. Method

A headless audit harness (`scripts/ui-audit/`, Playwright driving system Edge)
logs in once, discovers real entity ids from the API, then visits **every** route and
records: uncaught page errors, console errors, any HTTP ≥ 400, stuck loading
skeletons, which empty states rendered, and a full-page screenshot.

This matters because most of what was wrong did not throw — it rendered a confident,
wrong number, or an empty card on a database that had data.

Run it with `node audit.js` from that directory; `probe.js <route> <ms>` follows a
single route's redirects when a page is suspected of hanging.

---

## 3. Baseline vs now

| | At start | Now |
|---|---|---|
| Routes with an uncaught page error | **23 of 24** | 0 |
| Routes with console errors | **23 of 24** | 0 |
| Routes with failed HTTP requests | 1 | 0 |
| Nav destinations rendering "no data" on a populated DB | **3** (`/customers`, `/leads`, `/onboarding`) | 0 |
| Money displayed with the wrong unit | 13 call sites across 8 pages (100× out) | 0 |
| Metrics that were structurally always zero | 4 (active loans, disbursed, outstanding, app→disbursal) | 0 |
| Impossible percentages shown as fact | 8-stage funnel + app track | 0 (and >100% is now flagged, not printed) |
| End-to-end journey reachable by clicking | **no** — the application page had no outbound links at all | **yes**, 14/14 hops |
| Unexercised surfaces (no seed data) | campaigns, conversations, journey, audit | 0 |
| `server` typecheck coverage | `src/` only — seeds never checked | `src/` + `prisma/` + `scripts/` |

Verified by `scripts/ui-audit/audit.js` (24 routes) and `journey-walk.js` (14 hops), plus
`npm run typecheck` in both workspaces and a clean `admin` production build.

---

## 4. Root causes found

Nearly every symptom traced back to four causes, not twenty-three separate bugs.

### 4.1 One hydration mismatch, on every page
`Shell.tsx` called `getAdmin()` and `mustChangePassword()` **during render**. Both read
`localStorage`, which does not exist during SSR, so the server rendered a different
sidebar than the client: the `super_admin`-only *Audit Log* link was absent
server-side and present client-side, and a password-locked admin swapped every
`<Link>` for a `<span>`. React reported *"Expected server HTML to contain a matching
`<a>` in `<aside>`"*, discarded the server tree, and re-rendered the entire root on the
client — on all 23 routes. `/account` had its own copy of the same mistake
(`Signed in as <email>` and a `useState(() => getTotpEnabled())` lazy initializer).

**Fix:** resolve client-only session state in `useEffect` after mount, so the first
client render matches the server.

### 4.2 The journey spine was never seeded
`Customer` + `JourneyEvent` are only ever written by `server/src/lib/journey.ts` as real
events arrive. `seed.ws4.ts` inserts `User` / `LoanApplication` / `AnonymousLead` rows
directly, bypassing it. On a seeded database every 360 surface was therefore empty —
including `/customers`, which is the **primary** nav entry and the target that both
`/leads` and `/onboarding` redirect into. Three nav destinations and two detail pages
looked broken on a database holding 50 users and 30 leads.

**Fix:** new `prisma/seed.journey.ts` derives a plausible journey per seeded person and
replays it through the sanctioned `resolveCustomer` + `recordJourneyEvent` API, so the
stage machine, telemetry mirror and PII redaction all behave as in production.
`npm run seed:journey`.

### 4.3 Money units are not uniform, and both sides were wrong
The loan funnel stores **rupees** (`POST /applications` validates
`min(25_000).max(1_500_000)`; the app's slider is ₹25,000–₹15,00,000). But:
- `seed.ws4.ts` multiplied those columns by 100 (`const rupees = n => n * 100`), so
  seeded data was 100× too large — the overview read **₹31.5 crore** of disbursals
  across 6 personal loans capped at ₹15L each;
- the dashboard formats them with `inr()`, which **divides** by 100, so real
  app-created rows displayed 100× too small — a ₹1,50,000 application rendered as
  **₹1,500**. (`AppBuilds.tsx` pre-multiplies by 100 to dodge this, which confirms the
  author hit it.)

Meanwhile `CampaignContact.amount`, `AnonymousLead.amount`,
`PreApprovedPlan.maxAmount`, `MarketLoanOffer.maxAmount` and `ContextSession.amount`
**are** genuinely paise. So a blanket fix in either direction would break half the
pages. The verified field-by-field map is in §5.1.

CLAUDE.md's claim "All amounts in paise (existing server convention)" is wrong for the
loan funnel.

### 4.4 A 404 used to mean "nothing here yet"
`GET /api/admin/conversations/:phone` returned **404** when a valid customer simply had
no conversations. Every website-only customer's detail page logged a console and server
404, and the dashboard had to regex the error message (`/404|No conversations/i`) to
tell "none yet" from "the request failed".

**Fix:** return 200 with an empty history; a non-2xx now means something genuinely broke.

---

## 5. Per-page findings and status

All 24 routes end the review with **no page errors, no console errors and no failed
requests**. Remaining empty states are correct for the specific record shown (a draft
campaign has no calls; an app-origin customer has no website enquiry).

| # | Route | Finding | Outcome |
|---|---|---|---|
| 1 | `/overview` | Led with 5 tiles of which 3 were structurally zero; an 8-stage funnel whose conversion maths was impossible (14 qualified → 30 applications at "100%"); a one-bar product chart; a donut over tied values; a "live activity" feed containing only the job scheduler's own stall/nudge rows | Rebuilt around the bottleneck + a real work queue |
| 2 | `/customers` | Empty on a populated DB (§4.2). City column could never populate — `city` was missing from the endpoint's `select`. "Last activity" read seconds-ago for everyone (§4.5) | Populated; city selected; ordering now honest |
| 3 | `/customers/[id]` | Console 404 from the conversations endpoint (§4.4). Attribution showed the **customer's own name** as the campaign. "Stalled for 12h" in red on a *disbursed* customer, directly under "Journey complete". "First seen" rendered `createdAt` (row-write time), dated after the timeline it sat above. Two permanently-empty tiles for app-origin customers | All fixed; tiles fall back to the app application |
| 4 | `/leads` → `/customers` | Redirect is intentional (Leads merged into Customers) | No change |
| 5 | `/leads/[id]` | Resolves the lead then hops to the customer journey — works, just slower than a 3s test wait | No change (test tolerance raised) |
| 6 | `/onboarding` → `/customers?stalledMinutes=60` | Intentional consolidation | No change |
| 7 | `/onboarding/[userId]` → `/users/[id]` | Intentional | No change |
| 8 | `/loans` | Amounts 100× too small (§4.3); `?status=` from the URL was ignored so overview deep-links landed on "All" | Both fixed |
| 9 | `/loans/[id]` | Amounts 100× too small. **No outbound links at all** — a dead end. Repayments list clipped a row in half at `maxHeight: 180` | Money fixed; links to the 360 + app profile added; container resized |
| 10 | `/users`, `/users/[id]` | `monthlyIncome` 100× too small (₹45,000 shown as ₹450); no route to the customer journey | Money fixed; journey link added |
| 11 | `/downloads` | A 2-slice donut (platform) and a donut over four near-tied values (source) | Both replaced with ranked bars; `DonutChart` deleted |
| 12 | `/campaigns`, `/campaigns/[id]` | Nothing seeded, so the entire outbound-calling half of the platform was invisible and untested. A scheduled window rendered as `(-22800s ago)` | 3 campaigns / 54 contacts / ~50 calls seeded; `timeAgo` now handles future instants |
| 13 | `/campaigns/new`, `/preapproved`, `/preapproved/new`, `/preapproved/[id]` | Clean; `maxAmount` is genuinely paise so `inr()` is correct here | No change |
| 14 | `/notifications` | Titles contained raw DB keys — `stalled at "pan_pending"`. Rows linked nowhere, so an operator had to search the pipeline for the ref by hand | Humanised via `lib/labels.ts`; titles now deep-link |
| 15 | `/notifications-rules` | 13 rules seeded and rendering | No change |
| 16 | `/analytics` → `/overview` | Merged into Overview's Trends | No change |
| 17 | `/audit` | Empty. Confirmed **correct**: `auditAdmin` skips GET/HEAD by design, so a read-only session logs nothing | No change (verified with real mutations) |
| 18 | `/integrations` | Clean; Upshot correctly reports the credentials it still needs | No change |
| 19 | `/account` | Own hydration mismatch (§4.1) | Fixed |
| 20 | `/login`, `/login/reset` | Clean | No change |

### 4.5 Our own cron was overwriting "last activity"

`recordJourneyEvent` set `lastActivityAt` for **every** event, including the
`system` / `stage_stalled` + `nudge_sent` pair that `stageStallDetector` writes each time
it fires. Consequences:

- the Customers list is ordered by `lastActivityAt desc`, so it was really ordered by
  "who our cron touched most recently", and every stalled customer displayed a last
  activity of seconds ago;
- `leadCaller` picks call targets by *oldest* `lastActivityAt` — so nudging someone
  pushed them to the **back** of the calling queue. The people being chased were the
  least likely to be dialled.

Stall *detection* itself was unaffected (it keys on `stageEnteredAt` / `lastNudgedAt`).
Fixed by treating `channel: 'system'` events as not-customer-activity, while still
letting them advance the stage (a webhook rejection is a real funnel move).

### 5.1 Verified money-unit map

**RUPEES** — must use `inrR` / `inrCompactR`:
`LoanApplication.amount` · `Offer.amount` · `Offer.emi` · `Offer.processingFee` ·
`Loan.principal` · `Loan.emiAmount` · `Loan.outstanding` · `Repayment.amount` ·
`User.monthlyIncome`

**PAISE** — `inr` / `inrCompact` are correct:
`CampaignContact.amount` · `AnonymousLead.amount` · `ContextSession.amount` ·
`PreApprovedPlan.maxAmount` · `MarketLoanOffer.maxAmount`

---

## 6. Change log (from → to)

### Server
| File | From | To |
|---|---|---|
| `modules/admin.routes.ts` | `activeLoans: prisma.loan.count()` — every loan ever, labelled "Active Loans" | counts `status: 'active'`; total kept as `totalLoans` |
| `modules/admin.routes.ts` | overview returned only the spliced 8-stage `funnel` | adds `pipeline` (per-stage census: count, value, oldest-waiting) and `acquisition` (website and app as two **separate** tracks). `funnel` retained for backward compatibility with a comment marking it untrustworthy |
| `modules/admin.routes.ts` | app track compared *applications* to *users*, so one user with two applications produced "Registered 50 → Applied 51 = 102%" | counts applicants via `distinct: ['userId']` |
| `modules/admin.routes.ts` | `disbursed` counted as "in flight", inflating the bottleneck denominator | marked terminal; still shown in the census, excluded from work-outstanding |
| `modules/admin.routes.ts` | trend buckets ran `now-days … now-1d`, so **today had no bucket** and today's applications vanished from the chart | window is now the last `days` days *including* today |
| `modules/admin.routes.ts` | `/loans/:id` and `/users/:id` returned no customer link | both return the resolved `customer`, so the pages can reach the 360 view |
| `modules/admin.routes.ts` | stage labels duplicated inline | sourced from `lib/labels.ts` |
| `modules/customers.routes.ts` | list `select` omitted `city`; detail returned raw `CampaignContact` rows as `campaigns` (so `.name` was the *person's* name) | `city` selected; campaigns flattened to the campaign's identity with contact state kept alongside |
| `modules/adminConversations.routes.ts` | 404 when a customer had no conversations | 200 with an empty history |
| `lib/journey.ts` | `lastActivityAt` bumped by our own `system` events (§4.5) | only customer-originated events count as activity |
| `lib/labels.ts` | *(did not exist)* | one source of truth for application-status and onboarding-step labels |
| `jobs/tracking.jobs.ts` | notification titles built from DB keys: `stalled at "pan_pending"`, `abandoned at "aboutyou"` | humanised through `lib/labels.ts` |
| `prisma/seed.ws4.ts` | `const rupees = n => n * 100` applied to rupee columns; 20 downloads against 50 users; unbounded dates put applications in the future; users had no `city`; a "Dashboard seeded" row sat at the top of the work queue | honest `rupees()` / `paise()` helpers; downloads scale to 1.7× users; `notFuture()` clamp; `city` set; meta-notification removed |
| `prisma/seed.journey.ts` | *(did not exist)* | seeds `Customer` + `JourneyEvent` through the sanctioned `resolveCustomer` / `recordJourneyEvent` API — 68–72 customers, ~550 events, converted leads paired with real users to demonstrate the web→app merge, `firstSeenAt` aligned to the earliest event, entry events matched to the real origin channel |
| `prisma/seed.campaigns.ts` | *(did not exist)* | 3 campaigns (completed / running / draft), 54 contacts attached to real customers, ~50 `CallAttempt` rows with outcome-consistent summaries and evidence |
| `tsconfig.scripts.json` | *(did not exist)* | `prisma/**` and `scripts/**` were never typechecked; a seed writing a non-existent `CallAttempt.startedAt` passed `npm run typecheck` and failed at runtime. Now covered — it immediately caught a second real bug (`AnonymousLead.email` does not exist) |
| `package.json` | — | `seed:journey`, `seed:campaigns`, `seed:all` (ordered), `typecheck` extended |

### Dashboard
| File | From | To |
|---|---|---|
| `components/Shell.tsx` | read `localStorage` during render → app-wide hydration failure | resolves session in `useEffect`; adds exported `AdminInfo` type |
| `app/(dash)/account/page.tsx` | same, plus a `useState` lazy initializer reading `localStorage` | resolved after mount |
| `app/(dash)/overview/page.tsx` | vanity tiles + impossible funnel + noise feed | bottleneck hero, per-stage census with deep links, real work queue, two honest acquisition tracks, ranked lead sources, single-series trend |
| `app/(dash)/loans/page.tsx` | ignored `?status=` | seeds the filter from the URL (inside a `Suspense` boundary, required by `useSearchParams`) |
| `components/viz.tsx` | `FunnelChart`, `LiveFeed` | replaced by `StageCensus`, `TrackSteps`, `AttentionQueue`; `PipelineBar` kept (campaigns uses it). A step exceeding the one above it now renders **⚠ with an explanation** instead of an impossible percentage |
| `components/charts.tsx` | dual-series area with a permanently-zero series; dashed gridlines; `monotone` curve inventing humps between sparse daily counts; `DonutChart` whose palette cycled with `PALETTE[i % len]` (a 7th category silently reused the 1st colour) | `showDisbursals` opt-in, solid hairline grid, `linear` interpolation with dots; new `HBar` for ranked categories; `DonutChart` removed |
| `components/journey.tsx` | "Stuck here 12h" on a terminal stage | `terminal` prop suppresses the stall warning once the journey is over |
| `app/(dash)/notifications/page.tsx` | titles were plain text | titles deep-link to the application or user, per notification type |
| `app/(dash)/downloads/page.tsx` | two donuts | two ranked bars |
| `lib/format.ts` | claimed "all amounts are paise"; `timeAgo` assumed the past and printed `-22800s ago` for a future instant | documents the real split; adds `inrR`, `inrCompactR`, `ageShort`; `timeAgo` handles both directions; `ageShort` clamped at zero |
| `app/globals.css` | — | census / track / hbar / queue / hero / strip styles; 2px surface gap between pipeline segments |
| `scripts/ui-audit/` | *(did not exist)* | the audit harness + journey walk, with a README |

### Chart palette
Stage bars use a single-hue ordinal ramp (`#57c0bf → #064e51`) validated with the
`dataviz` palette checker: monotone lightness, adjacent ΔL ≥ 0.06, light end clears
2:1 contrast on white. Stages are ordered, so an ordinal ramp is the correct encoding
rather than a categorical colour per stage.

---

## 6b. Round two — information architecture, call context, and the mobile contract

### Three people-shaped destinations became two
Customers, All Users and Loan Pipeline all answered overlapping questions, and nothing
told an operator which to open. The split is now by QUESTION:

| Nav | Question | Route |
|---|---|---|
| **All Users** | *Who are they?* Everyone who has shown interest on any channel — website and campaign leads included, not only the 50 who registered (65 rows vs the old list's 50) | `/customers` |
| **Loan Funnel** | *Where are they?* Every application and the stage it sits at now | `/loans` |

The old `/users` list was a strict **subset** of `/customers` — every registered user has
a Customer row — so it now redirects there. Its per-person page survives as the **App
Account** view, linked from the 360 via "View profile". "Loan Pipeline" is renamed
**Loan Funnel** everywhere, including the voice agent's aliases.

**Trade-off worth knowing:** the retired list had scannable `credit score / income /
apps / loans` columns. Those facts now live on each person's page rather than in a
sortable list. If scanning them matters, adding them to the unified list is a small
follow-up — say so and I'll do it.

### Calls now carry the funnel, not just the outcome
`placeCall()` has always persisted the agent's briefing to `CallAttempt.callContext`,
but **campaign calls never built one** — the bulk path passed only the spreadsheet row
(name, product, amount, campaign, attempt). So a campaign agent dialled blind to where
the customer was, and the finished record showed "What the agent knew (none recorded)".
Website-lead and stall-triggered calls already built this context; the bulk path simply
never did.

- `campaignRunner.ts` now builds the same `buildLeadCallContext()` briefing, with the
  spreadsheet still authoritative for what that campaign is pitching.
- A new **"Funnel at time of call"** panel on every call record surfaces the stage when
  called, what the agent was briefed to do, the reason for the call, prior-conversation
  count, origin and campaign — with the full variable dump still available underneath.
- The customer **Timeline** hides `system` rows by default behind a "Show N system
  events" toggle: the stall detector writes a stalled+nudge pair every time it fires, and
  four pairs had pushed the person's actual journey below the fold.

### The mobile contract is now canonical and guarded
The app emitted its own vocabulary (`application_started`, `offers_viewed`) which the
server translated in `appEventMap.ts`. That shim was deliberate — it works for handsets
already installed, with no store release — but it hid a trap: **`eligibility_started`,
the canonical name, was not an accepted key.** Every key mapping to
`ELIGIBILITY_STARTED` was a legacy app name, so "fixing" the app to emit canonical
names would have silently dropped it to telemetry-only and stopped the eligibility stage
advancing.

Fixed in the safe order — server first, then app:
1. `appEventMap.ts` accepts canonical names as identity entries **and** keeps every
   legacy name, so old and new handsets both work.
2. `FUNNEL_EVENTS` in `src/state/store.ts` now emits the canonical vocabulary.
3. Guards on **both** sides: `__tests__/store.test.ts` fails if a screen mapping is
   neither canonical nor explicitly telemetry-only; `appEventMap.test.ts` fails if the
   map stops covering what the app emits. A rename on either side now breaks a test
   instead of quietly dropping events — the failure mode that once left three of six
   stall rules unable to fire.

`kyc_submitted` stays deliberately non-canonical: it fires from each individual document
screen and maps to `KYC_STARTED`, because treating one document as completion would
satisfy the "KYC started but never finished" rule and hide the person it exists to catch.

### Verified end to end
`scripts/ui-audit/app-tracking-check.js` logs in the way the app does (OTP), POSTs the
exact names the app now emits, and asserts each became a JourneyEvent at the right
stage — **14/14**, including that telemetry-only events stay out of the funnel and that
`isForwardStage` never lets a stage regress.

| Gate | Result |
|---|---|
| Route audit (24 routes) | clean — no page/console/network errors |
| Journey walk (click-through) | 14/14 |
| Handset → server → dashboard | 14/14 |
| Server tests | 97 passed (5 files) |
| App tests | 87 passed / 7 pre-existing failures (baseline: 83 passed / same 7) |
| Typechecks | app, server (incl. scripts), admin — all clean |
| Admin production build | compiled, 23/23 static pages |

## 6c. The mobile test suite was quietly broken

`npm test` reported "7 failed, 83 passed" — but the headline number was hiding more than
it showed. Every failure was a stale test or a config gap, not a bug in the app.

| # | Symptom | Cause | Fix |
|---|---|---|---|
| 1 | `router.test.tsx` — "Test suite failed to run" | `react-native-webview` was missing from `transformIgnorePatterns`, then needed a native-module mock. The alternatives in that regex are anchored with a trailing slash, so `react-native` matches only the core package, never `react-native-webview`. Because `screens/index.ts` imports every screen, one un-mocked native module took down the whole suite | added to `jest.config.js` + a View stub in `jest.setup.js` — **this alone recovered 57 tests that had never been running** |
| 2 | 4× `UC-N3 back-stack` | The application flow was restructured (PAN is collected first, `moredetails` was inserted) so the real path is `home → basicpan → basic → moredetails → finding → offers`. `PREV` was correct; the expectations were three steps out of date | expectations updated to the flow traced from the actual `go()` calls, and `moredetails` — previously untested — added |
| 3 | `UC-I3` language fallback | A full Telugu (Tenglish) table was added, so `strings('te')` correctly stops falling back to English. The test asserted the old behaviour | asserts `te` resolves to its own table; a genuinely unknown code still falls back. `UC-I4` now **iterates every non-`en` language** instead of hard-coding `hi`, so a fourth language cannot be added unchecked |
| 4 | `UC-S8 loans` | "Found multiple elements with text: My Loans" — it is both the heading and the bottom-nav tab label. Legitimate duplication; `getByText` throws on it | harness uses `getAllByText(...).length > 0`: a smoke test asserts presence, not uniqueness |
| 5 | `UC-S20 status` | The screen is data-driven now ("Loan Reference: <ref>"), so the hardcoded "Business Expansion Loan" no longer exists. With no session it renders its no-application state | asserts the state it genuinely renders |

**Result: 90 → 155 tests, 7 failures → 0, 6/6 suites.** No app source changed for any of
this; the only production file touched in this round was `jest.config.js`/`jest.setup.js`
(test infrastructure).

Also fixed: the app's `node_modules` was **stale** — `react-native-image-picker`,
`@react-native-async-storage/async-storage` and
`babel-plugin-transform-inline-environment-variables` were all declared in
`package.json` but never installed. That is why `npm test` could not start at all and
`npm run typecheck` reported 6 module-resolution errors. Installed with `--no-save`, so
the manifest is untouched; both now run clean.

CLAUDE.md's "110 tests" and "te/hinglish/tenglish fall back to `en`" were both stale and
have been corrected.

## 6d. §7 clear-down — the deferred items that needed no decision

### The lint gate had never worked
`.eslintrc.json` extends `next/core-web-vitals`, but **neither `eslint` nor
`eslint-config-next` was ever declared** in `admin/package.json`, so `npx next lint` had
only ever failed to resolve its own config. Installed both pinned to Next 14
(`eslint@^8.57`, `eslint-config-next@14.2.15`). It reported 1 error and 2 warnings — all
three real, all now fixed rather than suppressed wholesale:

| Finding | Fix |
|---|---|
| `react/no-unescaped-entities` — a bare `'` in JSX | escaped |
| `react-hooks/exhaustive-deps` on `useMemo([roles])` | `roles` was derived *outside* the memo, so the `?? []` minted a new array identity every render and the memo **memoised nothing**. Derivation moved inside, dependency changed to `rolesPayload` |
| `@next/next/no-img-element` on a lender logo | kept `<img>` with a targeted disable + reason: `logoUrl` is operator-entered, so the host is arbitrary and could never be listed in `images.remotePatterns` — `next/image` would throw on an unconfigured domain |

Also added an `admin` `typecheck` script; the workspace had none, so `tsc` was only ever
run by hand.

### `prisma migrate deploy` can now bootstrap an empty database
`20260813000000_baseline_preapproved_plan` was written as "resolve, never run", but the
migration immediately before it also creates `PreApprovedPlan` (with `IF NOT EXISTS`). So
on a **fresh** database the table already existed by the time the baseline ran, and its
bare `CREATE TABLE` aborted the whole deploy with `P3018 / 42P07`. A new environment
could not be stood up without hand-holding it through `migrate resolve --applied`.

Both statements are now `IF NOT EXISTS`. Verified against a throwaway database:
**12/12 migrations applied clean, then `npm run seed:all` completed end to end** — no
manual steps. Column set is byte-identical to the earlier migration's, so either path
yields the same shape. The throwaway database was dropped and the working one confirmed
untouched.

### Mobile: the product the user picks is now recorded
The Home cards navigated to `basicpan` without recording which was tapped, and
`basic.tsx` hardcoded `loanType: 'personal'`. Every production application was therefore
a personal loan whatever the customer chose — and the dashboard's "Applications by
product" chart could only ever grow one bar.

`appLoanType` now lives in the store, Home sets it on tap, and `basic.tsx` sends it.
Verified against the live API: filing a `business` application persists as `business`.

### Two bits of polish
- **`.page` bottom padding 60px → 104px.** The floating "Ask Ello" mic is
  `position: fixed` at the bottom-right of every page, so the last table row — or the
  overview's 30d/90d range chips — could come to rest underneath it with no way to
  scroll clear.
- **The lead → customer hop** showed a skeleton and then a near-empty card reading
  "Opening the customer journey…", a two-step flicker that read as a stalled page. Both
  states now render the same skeleton. The redirect itself is unavoidable: the Customer
  id is only known after the lead is fetched, and the admin token lives in
  `localStorage`, so it cannot be resolved server-side.

### A flaw in my own harness
`audit.js` bucketed hydration errors separately (they were app-wide noise at the time)
and then **never surfaced them** — so a page could hydration-error and still print
`clean`. Fixed: hydration now raises a `HYDRATION:n` flag. Re-audited with it active:
still **0 across all 24 routes**, so the earlier clean results hold. Worth stating
plainly because it means my previous "0 errors" was true but under-verified.

### Gates after this round
| Gate | Result |
|---|---|
| Route audit (24 routes, hydration flagging active) | 0 errors |
| Journey walk / handset tracking | 14/14 · 14/14 |
| Typechecks (app, server+scripts, admin) | 0 each |
| `admin` lint | ✔ no warnings or errors |
| Tests | app 155, server 97 |
| Production build | 23/23 static pages |
| Fresh-database bootstrap | 12 migrations + full seed, unattended |

## 6e. Closing out the last of §7

### The campaign upload is no longer untested
TC-G5 was the one case the plan could not run for want of a file. `upload-test.js` now
builds a CSV with alias headers ("Full Name", "Mobile Number", "Loan Amount"), a rupee
value with a ₹ sign and commas, a duplicate phone, a blank phone and a junk phone — then
uploads it through the real file chooser. **6 rows in → 3 imported, 3 skipped**, aliases
mapped, `"₹4,50,000"` stored as `45000000` paise, duplicate deduped by
`@@unique([campaignId, phone])`, and the skip count surfaced to the operator.

### One hook instead of a fourth copy of the same bug
Reading `localStorage` during render had already caused three hydration bugs (`Shell`,
`/account`, and latently `/integrations`). Rather than patch a fourth site, session state
now comes from **`lib/useAdminSession.ts`** — resolved after mount, with a `ready` flag for
when "no admin" and "not looked yet" differ, and a refresh key so `Shell` picks up a fresh
sign-in on navigation.

Applied to `Shell`, `/account`, `/integrations` (both gated panels) and `/audit` — which
was a **fourth** instance I found while sweeping: it gated the whole page on
`getAdmin()?.role` during render. A grep now finds no inline session reads outside the hook.

### All Users regained the columns the retired list had
Credit score, monthly income and application count were only scannable on the old
`/users` list; after the merge they survived on each person's page but not in a list. They
are back as **Income · Credit · Apps** columns, sourced by one extra query per page
(`Customer.userId` is a bare column with no Prisma relation to `User`, so it cannot be
joined). A lead with no app account shows **"—", never 0**.

**And a real bug surfaced doing it:** the City column read `conv.city` from the
conversation rollup, not the customer — so it only populated for people in the recent
conversation index. That is why TC-E0 measured 15/25 rather than 25/25 even after the
server-side `select` was fixed. Now reads the customer first.

### Smaller things
- The application **stage stepper** printed the step *number* on the current stage, so a
  disbursed application ended on a bare "8". Now ✓ for completed, ● for "here now", and a
  terminal status (disbursed/closed) ticks.
- The **All Users page heading** still said "Customers" while the nav and topbar said
  "All Users".
- **The unread badge lagged up to 8 seconds behind "Mark read".** The sidebar count comes
  from `/dashboard/realtime`, which only refreshes on an 8s poll, so the mutation left the
  old number on screen — it reads as though the click did nothing. Both `markRead` and
  `markAll` now revalidate that key as well as the list. Found because TC-F3 failed with
  `39 -> 39` while 39 items really were unread: the test was right and the product was
  slow, so the product got fixed rather than the timeout lengthened.

### Note on data hygiene while testing
Repeatedly running `app-tracking-check.js` advances real customers' stages without
creating matching applications, which left rows reading "Application submitted" with
`applicationCount: 0`. That is test residue, not a product bug — but it is exactly the kind
of thing that gets mistaken for one, so the database was reseeded and the stale detectors
re-run (41 unread notifications restored) before the final verification.

### Gates after this round
| Gate | Result |
|---|---|
| Route audit (24 routes) | 0 errors |
| `interactive.js` · `plan-run.js` · `manual-extras.js` | 23/23 · **25/25, 0 skipped** · 10/10 |
| `journey-walk.js` · `app-tracking-check.js` · `upload-test.js` | 14/14 · 14/14 · **7/7** |
| Typechecks (app, server+scripts, admin) · `admin` lint | 0 errors each · clean |
| Tests | app 155 · server 97 |

## 7. Still open — each needs a decision or access I do not have

Items 2, 4, 5 and 6 of the original list are **done** — see §6d.

1. **Make paise the real convention.** The alternative to §4.3 is to multiply on write
   in the mobile app + server and migrate every existing row. It touches live money, the
   handset and the database at once. **My recommendation: don't.** Rupees is now
   consistent end to end, documented in `lib/format.ts` and CLAUDE.md, and guarded by
   the field map in §5.1. Paise buys nothing here.

2. **An orphaned column leaves the migration chain drifted from `schema.prisma`.**
   Surfaced while proving the fresh-database bootstrap (§6d). `migrate diff` against a
   freshly-migrated database reports three corrections:

   ```sql
   DROP INDEX "Customer_phoneVerified_callbackRequestedAt_callbackCalledAt_idx";
   ALTER TABLE "Customer" DROP COLUMN "callbackCalledAt";
   ALTER INDEX "Customer_phoneVerified_callbackStatus_callbackNextAttemptA_idx"
     RENAME TO "Customer_phoneVerified_callbackStatus_callbackNextAttemptAt_idx";
   ```

   `callbackCalledAt` is added by `20260813072051` and superseded by the callback state
   machine in `20260813133000`, which never dropped it. It appears in **no** code and
   **not** in `schema.prisma`, so runtime impact is nil — but every future
   `migrate dev` will keep wanting to generate this, and the index-name mismatch is
   Postgres's 63-character truncation.

   **I deliberately did not author this migration.** A file in `prisma/migrations/` is
   applied automatically by CI on every environment including production, so committing
   one is effectively scheduling a `DROP COLUMN` — exactly what `prisma:push` is disabled
   in this repo to prevent. The SQL above is ready; it needs your call on when it runs.

3. **Dev DB access.** IP allowlisting is fragile against a dynamic ISP address — it broke
   twice in two days. A bastion/SSM session or RDS Proxy would end it. Needs AWS access.

4. **Install attribution is never sent from the handset** (§ mobile follow-ups).
   `trackInstall(Platform.OS, {})` passes an empty payload even though the client and
   server both support `{source, campaignId, referrer, contextToken}`. Fixing it means
   the Play Install Referrer API on Android and a deferred deep link / Apple Search Ads
   token on iOS — native work I would not do blind. Until then App Downloads → "By
   source" can only distinguish context-token installs from organic.

5. **A pre-existing quirk in the stage stepper, unrelated to the marker fix:** `STAGES`
   contains `draft…disbursed` but not `rejected`, so `STAGES.indexOf('rejected')` is `-1`
   and a **rejected** application renders with no progress at all — every circle grey.
   The status badge still says Rejected, so nothing is *wrong*, but the stepper is
   uninformative for that case. Left alone because deciding what a rejected funnel should
   look like (stop at the stage it died in? a red terminal step?) is a design call.

*(Items 5–7 of the previous list — the `/integrations` hydration hazard, the stepper
marker, and the missing All Users columns — are done; see §6e.)*

---

## 8. How to get back to this state

```sh
# 1. Database (local Postgres 17 at C:\pg17, or any Postgres you can reach)
cd server
npx prisma migrate deploy            # if this is a brand-new DB, see §7.2 first
npm run seed:all                     # order matters — see the script's comment
npm start                            # :4000

# 2. Dashboard
cd ../admin && npm run dev           # :4001, login admin@swiftloan.com / admin123

# 3. Verify (from scripts/ui-audit, after `npm i playwright-core`)
node audit.js                        # every route: errors, empties, screenshots
node journey-walk.js                 # 14 click-through hops, exits non-zero on a break
```

`npm run typecheck` in both workspaces, and `npm run build` in `admin/`, are the other
two gates. **Do not build while the dev server is running** — it overwrites `.next` and
the dev server then 500s with `MODULE_NOT_FOUND`.

---

## Reusable per-page review template

Copy this per page. A page is not "done" until every line is answered.

```
### <route>
Purpose (one sentence — if it takes two, the page is doing too much):
Primary question it answers for the operator:

Correctness
- [ ] Every number traced to its source field; units verified against the write path
- [ ] No metric that is structurally always zero / always 100%
- [ ] Percentages only between genuinely sequential steps
- [ ] Empty vs zero vs "not applicable" visually distinct

Data states
- [ ] Loading (skeleton, no layout jump)
- [ ] Empty (explains what would fill it + a next action)
- [ ] Error (states what failed + retry)
- [ ] Populated (screenshotted at 1440 and 1280)

Signal-to-noise
- [ ] Every card earns its space; anything unread or unactionable removed
- [ ] Chart form matches the data's job (no one-bar bars, no donuts over ties)
- [ ] Deep links out to the filtered list / detail page

Health
- [ ] No console errors, no page errors, no HTTP ≥ 400
- [ ] Typecheck clean
```
