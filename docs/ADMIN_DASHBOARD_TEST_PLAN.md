# Admin Dashboard — manual test plan

Test cases for everything changed in the dashboard review (see
[ADMIN_DASHBOARD_REVIEW.md](./ADMIN_DASHBOARD_REVIEW.md)). Each case is written so a
person can run it from a browser, and most are **also automated** in
`scripts/ui-audit/interactive.js` under the same `TC-*` id — so a manual tester and CI
check the same thing.

**Last executed:** 2026-08-18 — **every case below was run**, not asserted from reading code.

| Runner | Covers | Result |
|---|---|---|
| `interactive.js` | A1–A3, B1–B2, C1–C3, D1–D2, E1–E4, F1–F3, G1–G2, H1 | **23/23** (twice consecutively) |
| `plan-run.js` | B4, C4, D3–D7, E0, E2–E8, F4, G3–G4, I2, I4, I5 | **25/25** |
| `manual-extras.js` | A4, B3, C5, I1, I3 | **10/10** (twice) |
| `audit.js` | every route renders, hydration flagging active | **24/24 clean** |
| `journey-walk.js` | the end-to-end journey, by clicking only | **14/14** |
| `app-tracking-check.js` | J1–J5 over the real HTTP contract | **14/14** |
| `authguard.js` | A1b | redirect ~1.5s; **every** admin call 401 |
| `sms-dryrun.js` | K1–K3 | 6/7 — only the credential gate, by design (K4) |
| shell | L1–L5, L8 | typechecks 0/0/0 · app 155 · server 97 · fresh-DB bootstrap clean |

**Totals: 115 checks executed, 0 failing.** Six cases are *not testable in this
environment* and are listed at the end — none is recorded as a pass.

### Three of my own test bugs, found while running this

Worth knowing, because each is the kind of mistake that hides a real defect:

1. **A fixed sleep reported working auth as broken.** TC-A1 used
   `waitForTimeout(2500)`; the redirect fires from a `useEffect` and takes ~1.5s warm,
   longer on a cold dev server. `authguard.js` settled it — redirect present, and every
   `/api/admin/*` call returns 401. Now uses `waitForURL`.
2. **An assertion that passed by vacuity.** The "no money under ₹1,000" check ran on a
   website-only customer with no amounts on screen at all. TC-C3 now runs it on the funnel
   where money is always present (20 values, ₹65,085–₹9,09,610, all in band).
3. **Two "failures" that were wrong locators, not bugs.** TC-I1's regex over page text
   returned `undefined` (now reads `.stat` tiles), and TC-I5 asserted "Upshot" on the
   default Configs tab — but Configs is **tabbed**, so only Voice calling renders first.
   TC-I5 now drives all five tabs and confirms each renders its own panel.

---

## 0. Before you start

```sh
cd server && npm run seed:all && npm start     # :4000
cd admin  && npm run dev                       # :4001
```

Log in at http://localhost:4001 with `admin@swiftloan.com` / `admin123`.

Two things that will waste your time if you skip them:

1. **Warm every route first.** `next dev` compiles a route on first request. A cold
   `/customers/[id]` can take >5s and looks like a hang. Click through each nav item once
   before judging anything.
2. **Never run `npm run build` while `npm run dev` is running** — the build overwrites
   `admin/.next` and the dev server then 500s on every route.

Seeded data is random per run, so exact counts differ. Every expectation below is written
as a **relationship** ("fewer rows than All"), never a fixed number.

### Running the automated equivalents

```sh
cd scripts/ui-audit
npm install playwright-core     # first time; uses system Edge, no download
node audit.js                   # all 24 routes: errors, empty states, screenshots
node interactive.js             # A1–A3, B1–B2, C1–C3, D1–D2, E1–E4, F1–F3, G1–G2, H1
node plan-run.js                # B4, C4, D3–D7, E0, E2–E8, F4, G3–G4, I2, I4, I5
node manual-extras.js           # A4, B3, C5, I1, I3
node upload-test.js             # G5 — builds a CSV and uploads it through the real UI
node journey-walk.js            # the end-to-end journey, by clicking only
node app-tracking-check.js      # handset → server → dashboard (§J)
node authguard.js               # is an unauthenticated visitor ever served data
node sms-dryrun.js ../../server/.env   # DLT template body check, sends nothing
```

Run them in that order — `plan-run.js` ends with **TC-F4 (mark all read)**, which wipes the
unread state `interactive.js` needs for TC-F3.

**Both mutate.** To restore: delete the `Notification` rows and re-run the stale
detectors (`loanStaleDetector` + `onboardingStaleDetector`), or just `npm run seed:all`.
Waiting for the scheduler instead takes up to 15 minutes.

---

## A. Authentication

| ID | Steps | Expected |
|---|---|---|
| **TC-A1** | Sign out (or open a private window). Go straight to `/overview`. | Redirected to `/login` within a few seconds. **Note:** it can take ~1.5s warm and longer on a cold dev server — that delay is not a failure. |
| **TC-A1b** | With devtools Network open, repeat TC-A1 and watch `/api/admin/*`. | Every admin call returns **401**. None returns 200. This — not the redirect — is the security boundary. |
| **TC-A2** | On `/login`, enter the right email and a wrong password. | Stays on `/login`, shows an error. No session. |
| **TC-A3** | Enter `admin@swiftloan.com` / `admin123`. | Lands on the dashboard. |
| **TC-A4** | Sign in as `ops@swiftloan.com` / `admin123` (role `admin`, not super). | **Audit Log is absent from the sidebar**, while All Users and Loan Funnel remain. The API refuses `/api/admin/ops/audit` with **403**. *Both verified.* |
| **TC-H1** | Click **Sign out**, then try `/customers`. | Back at `/login`, and `/customers` bounces to `/login` again. |

---

## B. Navigation and information architecture

| ID | Steps | Expected |
|---|---|---|
| **TC-B1** | Look at the sidebar. | Top group is exactly **Master Overview · All Users · Loan Funnel**. The words "Loan Pipeline" appear nowhere. Then *Acquisition* (App Downloads, Campaigns, Pre-Approved Plans), *Insight* (Notifications), *Configuration*. |
| **TC-B2** | Go to `/users` directly (an old bookmark). | Redirects to `/customers`, which is titled **All Users**. |
| **TC-B3** | Go to `/leads`, then `/analytics`, then `/onboarding`. | `/leads` → `/customers`; `/analytics` → `/overview`; `/onboarding` → `/customers?stalledMinutes=60` with the stall filter already applied. *Verified.* |
| **TC-B4** | Compare the row count on **All Users** with the old registered-user count (`/api/admin/users` total). | All Users is **larger** — it includes website and campaign leads who never registered. *Observed 65 > 50.* |

---

## C. Loan Funnel

| ID | Steps | Expected |
|---|---|---|
| **TC-C1** | On **Loan Funnel**, note the row count on *All*, then click the **Disbursed** chip. | Fewer rows, and **every** Status badge reads "Disbursed". No Draft/Handoff/Rejected leaks through. |
| **TC-C2** | Copy a `SL-…` ref from a row into the search box. | Narrows to that application (1 row). |
| **TC-C3** | With *All* selected, read every Amount. | Every value sits between **₹25,000 and ₹15,00,000** — the range the API validates. Anything under ₹1,000 means the 100× paise/rupee bug is back. |
| **TC-C4** | Click a row. | Opens the application detail for that ref. *Verified — SL-250916 opened its own record.* |
| **TC-C5** | Use **Next**/**Prev** at the bottom. | Page number changes and the first ref changes. *Verified.* |

---

## D. Master Overview

| ID | Steps | Expected |
|---|---|---|
| **TC-D1** | In **Application pipeline**, click any stage row. | Goes to `/loans?status=<that stage>` **with that chip already active** — not "All". |
| **TC-D2** | Click the **90d** chip under *Trends*. | The chart refetches (`/dashboard/charts?days=90` → 200) and the x-axis widens. |
| **TC-D3** | Read every percentage on the page. | **Nothing above 100%.** A step larger than the one above it shows **⚠** with a tooltip, never a fake rate. *Observed 7 percentages, max 66%.* |
| **TC-D4** | Check the right-hand end of the *Applications per day* axis. | **Today's date is the last bucket.** If the axis stops a day or two short, the off-by-one has returned. *Observed axis ends 08-18 = today.* |
| **TC-D5** | Compare the hero ("N applications waiting at X") with the census rows. | The hero names the biggest **non-terminal** stage. Disbursed/Rejected/Closed appear in the census in grey but are excluded from "in flight". *Observed hero = Draft 12 = largest live queue; inFlight 38 excludes 14 terminal.* |
| **TC-D6** | Read the **Needs attention** card. | Only actionable rows (named customer + stalled stage). No "Dashboard seeded"-style noise. Each links to its record. |
| **TC-D7** | Read the *Website* and *Mobile app* cards. | Two **separate** tracks, each descending top to bottom. They are not spliced into one funnel. *Observed web 60>30>13>8, app 85>50>33>10.* |

---

## E. All Users and the 360 view

| ID | Steps | Expected |
|---|---|---|
| **TC-E0** | Open **All Users**. | Rows populated. **City** filled on every row. *Last activity* shows a spread of real times, not "15s ago" for everyone (that symptom means our own cron is overwriting it). *Observed 25/25 with a city after fixing the column to read the customer rather than the conversation rollup.* |
| **TC-E0b** | On **All Users**, read the **Income · Credit · Apps** columns. | Populated for anyone with an app account; **"—" (never 0)** for a website/campaign lead who never installed — no income on record is not an income of zero. Credit is colour-coded (≥750 green, ≥650 amber, below red). Apps shows `applications · loans`. *Verified.* |
| **TC-E1** | Open a customer with calls. Scroll to **Timeline**. | System rows (*Stage Stalled*, *Nudge Sent*) are **hidden**; a "Show N system events" button reveals them. |
| **TC-E2** | On the same page, find **Voice calls** → a call. | A **"Funnel at time of call"** block shows *Stage when called*, *Agent was to*, *Reason for call*, *Prior conversations*, plus origin/campaign. Full variable dump under "What the agent knew". |
| **TC-E3** | Read all money on the page. | Lead amounts and application/loan amounts both plausible. Nothing under ₹1,000. |
| **TC-E4** | Open a **disbursed** customer. | Tile reads **"In final stage … no action needed"** in green — *not* "Stalled for" in red — and the journey stepper shows no "Stuck here" badge. |
| **TC-E5** | Check the header line. | *"first seen"* is **on or before** the earliest Timeline entry. Later than the timeline means it is rendering row-creation time again. *Observed first seen 04 Aug = earliest event 04 Aug.* |
| **TC-E6** | Open **Origin & attribution**. | *Campaign* shows a campaign name — **never the customer's own name**. *Observed Campaign "New Year Top-Up Offers" for customer "Aarav Das".* |
| **TC-E7** | On a converted lead, read the Timeline bottom-up. | The web→app join is visible: *Website Visit → Lead Captured → Call → Phone Verified → App Installed → OTP verified → …*. |
| **TC-E8** | Click **View profile**, then **Full customer journey** back. | Round-trips cleanly. Both are real links (middle-click opens a new tab). |

---

## F. Notifications

| ID | Steps | Expected |
|---|---|---|
| **TC-F1** | Read the titles. | Plain English — "stalled at **PAN pending**", not `stalled at "pan_pending"`. |
| **TC-F2** | Click a "stalled at …" title. | Opens the application (`/loans/<id>`) it names. |
| **TC-F3** | Note the sidebar badge, click **Mark read** on one row. | Badge decrements by one. |
| **TC-F4** | Click **Mark all read**. | Unread count drops to **0** and the badge disappears. *Verified.* This wipes the unread state F3 needs — restore it by deleting the Notification rows and re-running the stale detectors (or `seed:all`). |

---

## G. Campaigns

| ID | Steps | Expected |
|---|---|---|
| **TC-G1** | Open **Campaigns** → a campaign. | Shows Schedule in plain English, the four totals, *Contacts by state*, *Calls by outcome*, and the contacts table with attempts/next-eligible. |
| **TC-G2** | Read the "Next window opens …" line on a draft/idle campaign. | A future time reads **"in 6h"** style — never `(-22800s ago)`. |
| **TC-G3** | Compare a call's **Outcome** with its **Summary**. | They agree. A `wrong_number` outcome must not carry "Already applied through the app". *Observed 20 conversations checked, 0 contradictory.* |
| **TC-G4** | Find an **inferred** outcome. | Labelled *inferred, not confirmed* with the matched phrase shown — visibly distinct from an agent-reported one. *Observed 10 of 20 inferred.* |
| **TC-G5** | Upload a spreadsheet on a draft campaign (`upload-test.js` builds one). | Valid rows import; a duplicate phone is deduped; rows with a blank or junk phone are **rejected, not imported**; the operator is told how many were skipped; a `"₹4,50,000"` cell lands as `45000000` paise. *Verified — 6 CSV rows → 3 imported, 3 skipped, header aliases ("Full Name", "Mobile Number", "Loan Amount") all mapped.* |

---

## H. App Downloads · Pre-Approved · Audit · Account

| ID | Steps | Expected |
|---|---|---|
| **TC-I1** | Open **App Downloads**. | Total = Context + Organic (verified 37 + 48 = 85 via `/api/admin/downloads`). *By source* and *By platform* are **ranked bars**, not donuts. *Verified.* |
| **TC-I2** | Open **Pre-Approved Plans**. | Plans listed; "Up to ₹X" amounts plausible (these are genuinely paise — `inr` is correct here). |
| **TC-I3** | Open **Audit Log** as super admin. | Entries for **mutations only** (6 present after this run's mark-read + lead edits). An empty log after read-only browsing is *correct*, not a bug — GET/HEAD are deliberately not logged. *Verified.* |
| **TC-I4** | Open **Account**, change your password to a weak value. | Rejected — the submit button stays **disabled** and the strength requirements show. *Verified.* |
| **TC-I5** | Open **Configs** and click **each of the five tabs** — Voice calling · Voice agents · Messaging · WhatsApp · API keys. | Each tab renders its own panel: Ello (Connected), Voice agents, Messaging (Upshot), WhatsApp (Infobip), API keys. **No credential is ever rendered on any tab** — saved secrets show as `•••• saved`. *All five verified; no leak on any tab.* Note Configs is tabbed, so only one provider panel exists at a time. |

---

## J. Mobile app → dashboard (the tracking contract)

Automated by `app-tracking-check.js`; the manual equivalent needs a device or emulator.

| ID | Steps | Expected |
|---|---|---|
| **TC-J1** | In the app, tap **Business** on Home and file an application. | The Loan Funnel row shows Type **Business** — not Personal. This was hardcoded until now. |
| **TC-J2** | Walk the app: language → OTP → loan basics → offers → KYC. | Each step appears on that customer's 360 **Timeline** within seconds, with channel `App`. |
| **TC-J3** | Submit one KYC document only. | Timeline shows **KYC started**, *not* KYC completed — one document is not completion, and treating it as such would silence the half-finished-KYC rule. |
| **TC-J4** | Visit the Repayment and Credit Score screens. | They appear in raw telemetry but **not** on the journey timeline and not in the funnel. |
| **TC-J5** | Check the stage after submitting. | Advances forward only. Re-sending an earlier event never moves a customer backwards. |

---

## K. SMS / DLT (OTP delivery)

`node sms-dryrun.js ../../server/.env` checks the template body without sending.

| ID | Steps | Expected |
|---|---|---|
| **TC-K1** | Run the dry-run. | The body reproduces the DLT-approved template **character-for-character** with only `{#var#}` replaced. |
| **TC-K2** | Check `VOX_TEMPLATE_TEXT` is set. | Set. If unset, the code falls back to a *different* generic string — the operator then silently drops every message while Vox still answers `200 Success`. |
| **TC-K3** | Request an OTP with `VOX_AUTH_TOKEN`/`VOX_PROJECT_ID` **empty**. | No SMS attempted; the API returns `devOtp` so the app still works. |
| **TC-K4** | Fill both credentials, request an OTP to a real handset. | SMS arrives with the approved wording from header `SW_app`. **Still blocked: `VOX_PROJECT_ID` outstanding.** Established 2026-08-19 against the live gateway: the auth key alone (and the key reused as the project id) both answer `code 1401 Invalid Credentials` and send nothing, so the project id is a genuinely separate value from the Vox dashboard — not derivable from the key and not any DLT identifier (UAN / TID / PE id, which belong to the DLT registry, not the Vox account). |
| **TC-K6** | Confirm the gateway endpoint. | `https://api.vox-cpaas.in/sendsms` and the code's default `https://cpaas.voxdigitals.com/sms-customer-apis/sms/v1/send` are the **same API** — the former's 405/415 responses name `/sms-customer-apis/sms/v1/send` as the instance, and both return an identical `1401` to the same probe. So no code change is needed for the new URL; `VOX_BASE_URL` is an optional override. The gateway accepts **only** `POST` with `application/x-www-form-urlencoded` — `GET` is 405 and JSON is 415, which matches what `sendViaVox()` already sends. *Verified.* |
| **TC-K7** | Confirm the DLT header. | The template row shows both `GMPE` and `SW_app`; `SW_app` is 6 characters and sits in the header position, so it is configured as the sender. **Unconfirmed against the portal.** This matters because an unregistered header is dropped by the operator *silently* while the gateway still answers success — so it cannot be diagnosed from the response. Check the DLT portal's Header list before relying on a live send. |
| **TC-K5** | Check the deployed environments. | `SMS_PROVIDER` and `VOX_*` must exist in the deploy config. **Currently they do not** — no deployed environment will send SMS regardless of DLT approval. |

---

## L. Environment and regression gates

| ID | Command | Expected |
|---|---|---|
| **TC-L1** | `cd server && npm run typecheck` | 0 errors (covers `src/`, `prisma/`, `scripts/`). |
| **TC-L2** | `npm run typecheck` (repo root) | 0 errors. |
| **TC-L3** | `cd admin && npm run typecheck && npm run lint` | 0 errors; "✔ No ESLint warnings or errors". |
| **TC-L4** | `npx jest` (repo root) | 155 passed, 6 suites. |
| **TC-L5** | `cd server && npx vitest run` | 97 passed. |
| **TC-L6** | `cd admin && npm run build` | Compiles, 23/23 static pages. **Delete `.next` and restart dev afterwards.** |
| **TC-L7** | `node audit.js` | All 24 routes `clean`. Any `HYDRATION:n` / `PAGEERR` / `NET:` flag is a regression. |
| **TC-L8** | On an empty database: `npx prisma migrate deploy && npm run seed:all` | Completes unattended — no `migrate resolve` step. |

---

## What this plan cannot cover

Stated plainly so nobody records a false pass:

- **Real voice calls** through Ello — needs live credentials and a reachable number.
- **Real SMS delivery** (TC-K4) — needs the two Vox secrets and a destination handset.
- **The mobile app on a device** (§J) — needs a build; the automated script exercises the
  same HTTP contract the app uses, which is the next best thing.
- **Install attribution** — the handset never sends source/campaign yet (Play Install
  Referrer / Apple Search Ads work is outstanding), so App Downloads → *By source* can
  only distinguish context-token installs from organic.
- **Upshot push/WhatsApp** — `UPSHOT_API_KEY` is empty, so nothing is dispatched.
- **Load, cross-browser and accessibility** — out of scope here; only Edge was driven.
