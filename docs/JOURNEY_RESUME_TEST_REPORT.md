# Website drop-off recovery and app resume: full test report

**Date:** 19 October 2026 · **Branch:** `feature/pan-photo-upload-voice-fixes` (uncommitted) · **Tester:** Claude
**Scope:** everything built in phases 1 and 2 (website activity ping, reminder job, install link and claim, resume details, app pop-up, pre-filled login, routing to step 2 or Home, agent context) plus the website and the iOS simulator end to end.

---

## 1. Verdict

**Everything that could be run now passes: 0 failing tests anywhere.** Testing found **5 real defects** (2 of them stop the feature working at all). All 5 are fixed and each has a regression test. A further **2 test-harness mistakes** and **1 unexplained one-off slowdown** are recorded in section 4. Section 6 lists what was **not** tested and why. The big ones: Android, and a live call with the voice agent.

| Layer | What ran | Result |
|---|---|---|
| App unit and component tests (Jest) | 30 suites, **383 tests** (was 369 before this work: +14) | ✅ all pass |
| Server unit tests (Vitest) | 24 files, **308 tests** (was 298: +10) | ✅ all pass |
| Website unit and component tests (Vitest) | 14 files, **127 tests** (was 118: +9) | ✅ all pass |
| **Server integration suite** (real HTTP + real DB + fake SMS/WhatsApp providers) | **59 checks** | ✅ **59 / 59**, passes on every repeat run, ~60 s |
| **Website in a real browser** | 9 scenarios against the local API | ✅ all pass |
| **iOS simulator, real app** | 12 scenarios (fresh installs, link clipboard, login, step 2, save) | ✅ all pass (after the fixes below) |
| **Agent tool layer** (the same tools the voice agent calls, driven as text commands) | 10 scenarios | ✅ all pass |
| Type checks (app, server, website) and lint on every changed file | | ✅ 0 errors |

---

## 2. How it was tested, and what was kept safe

- **Throwaway database** (`swiftloan_journey_test`, created and dropped by the runner). Your real `swiftloan_db` was **not** used for any test data (checked afterwards: none of the synthetic phone numbers exist there).
- **No real message was sent.** SMS provider off; the reminder job ran in log-only mode; the "send" tests used **local fake SMS and WhatsApp servers** that record what they receive.
- **No real lender data.** PAN details were inserted as test records, never verified through Aurix.
- **The simulator app was pointed at a local API** (temporary edit of `src/config/build.ts`, **reverted**; Meta ads reporting switched off in `voiceCredentials.local.js` for the run, **restored**).
- **No live voice-agent call was started**, because that is a call to Ello's live API (see section 6).
- Test tools now live in the repo: `server/scripts/journey/` (runner, integration suite, simulator seed, inspector helper).

---

## 3. Results

### 3.1 Server integration suite (59 / 59)

| S01 | arming | website OTP verify arms a reminder (cycle 1, 8-char token, otp_only) | ✅ PASS |
| S02 | arming | logging in twice does not create a second active reminder | ✅ PASS |
| S03 | arming | the app-store reviewer account (fixed OTP) logs in on the website but is never armed | ✅ PASS |
| S04 | arming | a visitor who is already an app user is not armed | ✅ PASS |
| S05 | arming | a finished schedule or an installed visitor is not armed again | ✅ PASS |
| S06 | arming | a returning visitor gets at most 3 cycles | ✅ PASS |
| S07 | ping | POST /api/website/activity with a session updates lastSeenAt | ✅ PASS |
| S08 | ping | the ping needs a valid bearer token (401 without, 401 with garbage) | ✅ PASS |
| S09 | ping | 60 pings in a row are never rate-limited and do not use up the login limit | ✅ PASS |
| S10 | ping | a ping from a user with no reminder is a harmless 200 | ✅ PASS |
| S11 | idle | idle 5+ minutes saves droppedAt; before 5 minutes it does not | ✅ PASS |
| S12 | idle | last step is derived: otp_only → pan_done (PAN on file) → application_started | ✅ PASS |
| S13 | schedule | a full simulated week logs exactly 20 steps in the right order, SMS/WhatsApp alternating | ✅ PASS |
| S14 | schedule | no two logged messages are closer than 30 minutes, and none outside 09:00-21:00 IST | ✅ PASS |
| S15 | schedule | a step due at night waits for 09:00 and then goes out (not skipped) | ✅ PASS |
| S16 | schedule | a step more than 14h late is skipped, not sent | ✅ PASS |
| S17 | schedule | two workers ticking at once handle each step exactly once | ✅ PASS |
| S18 | stop | install matched through the link stops it | ✅ PASS |
| S19 | stop | logging in to the app stops it | ✅ PASS |
| S20 | stop | an application that reached the lender stops it | ✅ PASS |
| S21 | stop | a do-not-contact customer stops it | ✅ PASS |
| S22 | stop | an application that is only a draft does NOT stop it | ✅ PASS |
| S23 | stop | returning after being dropped ends the run and starts cycle 2 five minutes after the return | ✅ PASS |
| S24 | send | send mode: SMS carries the DLT template id and the /dl?ref= link; WhatsApp carries name + link | ✅ PASS |
| S25 | send | a provider failure is recorded as failed and never retried | ✅ PASS |
| S26 | send | a missing template is skipped with a reason, nothing is sent | ✅ PASS |
| S27 | send | send mode with the integration disabled sends nothing and skips cleanly | ✅ PASS |
| S28 | send | the WhatsApp step is skipped (not sent blank) when the first name is unknown only if the template needs it | ✅ PASS |
| S29 | overlap | the stuck-stage SMS stands down while a reminder is active, and resumes after it stops | ✅ PASS |
| S30 | link | /dl?ref=TOKEN logs an AppClick with the ref; iOS gets the clipboard token page, Android a redirect | ✅ PASS |
| S31 | claim | a clipboard-matched install returns the resume block with name, phone and last step | ✅ PASS |
| S32 | claim | the Play-referrer path (Android) also returns the resume block | ✅ PASS |
| S33 | claim | a click can be claimed once; the second claim gets no resume block | ✅ PASS |
| S34 | claim | a same-IP guess is attributed but never carries a phone or a name | ✅ PASS |
| S35 | claim | unknown or malformed tokens and refs are ignored (no resume, no error) | ✅ PASS |
| S36 | claim | a referral-code link (friend referral) still works and carries no resume block | ✅ PASS |
| S37 | resume | GET /api/journey/resume: needs auth, returns only the caller's own visit, and nothing when stale | ✅ PASS |
| S38 | resume | the resume payload never contains a PAN, even with a PAN on file | ✅ PASS |
| S39 | pan | /kyc/pan/on-file: not on file → onFile false; verified → masked PAN + prefill; the PAN is never in the body | ✅ PASS |
| S40 | pan | a stored PAN without a verified record (cache gone) → onFile false, so the app falls back to step 1 | ✅ PASS |
| S41 | pan | user B cannot read user A's PAN details | ✅ PASS |
| S42 | pan | PATCH /applications/:id {usePanOnFile:true} attaches the encrypted PAN and moves it to pan_pending | ✅ PASS |
| S43 | pan | usePanOnFile with no PAN on file attaches nothing (no crash, status unchanged) | ✅ PASS |
| S44 | privacy | deleting the account removes the reminder row (and its phone / name) | ✅ PASS |
| S45 | privacy | reminder history, firstName and logs never hold a PAN | ✅ PASS |
| S46 | privacy | markPanVerified trims and caps the name, and ignores blanks | ✅ PASS |
| S47 | job | the scan survives one bad row (a corrupt history) and still handles the others | ✅ PASS |
| S48 | job | the install-reminder job is registered, and is switched off by NUDGES_DISABLED | ✅ PASS |
| S49 | schema | the migration SQL and the Prisma model agree (no drift for JourneyReminder) | ✅ PASS |
| S50 | send | flipping log-only → send with a backlog: at most one message per reminder per tick, none for stale steps | ✅ PASS |
| S51 | send | send mode: two workers at the same moment produce one provider call per step | ✅ PASS |
| S52 | send | a customer on the schedule gets nothing from a different reminder row (no cross-talk between visitors) | ✅ PASS |
| S53 | contract | both resume responses are accepted by the APP's own parser and agree with each other (wire contract) | ✅ PASS |
| S54 | scale | 450 due reminders are ALL handled in one tick (none starved behind the first 200) | ✅ PASS |
| S55 | scale | rows that are not due are not even read (cost follows the work, not the number of active visitors) | ✅ PASS |
| S56 | scale | after a step, the next check is the earlier of the next step and the idle check; after the drop it is the next step; quiet hours re-check in 15 min | ✅ PASS |
| S57 | scale | a visitor who pings is not re-read every minute: the idle check moves out with their last activity | ✅ PASS |
| S58 | scale | a row that throws is pushed 5 minutes out and the tick still finishes (no repeat within the same tick) | ✅ PASS |
| S59 | arming | a new reminder is due immediately (cycle 1) or at its start time (later cycles) | ✅ PASS |

### 3.2 Website in a real browser (local website + local API)

| ID | Scenario | Result |
|---|---|---|
| W1 | Phone, OTP and verify through the real UI arms a reminder (row in the database, 8-character reference ID, `otp_only`) | ✅ |
| W2 | Activity pings reach the API from the browser (CORS preflight 204, then POST 200, with the bearer token) | ✅ |
| W3 | Before login there are **no** pings (the only call is the expected `refresh` 401) | ✅ |
| W4 | Clicking and scrolling right after a ping sends **no extra ping** (throttled to one a minute) | ✅ |
| W5 | Hiding the tab sends a ping straight away (the "when they left" moment), even inside the throttle window | ✅ |
| W6 | The live job logged step 0 ("start sms", log-only) within about a minute of the OTP verify | ✅ |
| W7 | With the visitor made idle for 10 minutes, the live job saved the drop-off (`droppedAt`, last step `otp_only`) | ✅ |
| W8 | Reloading the website after the drop-off: the old run is stopped (`returned`) and cycle 2 starts 5 minutes later | ✅ |
| W9 | The PAN step page renders as before. The console shows React hydration warnings, but they are **there without my change** (checked by switching the ping component off) | ✅ no regression |

### 3.3 iOS simulator (iPhone 17, real debug build, local API)

| ID | Scenario | Result |
|---|---|---|
| A1 | Fresh install with `swiftloan-ref:<token>` on the clipboard: the claim reaches the server and the link click becomes `matched` | ✅ (after fix F1) |
| A2 | On the privacy screen the pop-up is held back (state `resumePrompt = welcome`), and appears on the language screen | ✅ |
| A3 | Pop-up greets by name: "Hi Priya, shall we continue your loan application where you left off?" with **Okay, continue** and **Take help from agent** | ✅ (name capitalised after fix F5) |
| A4 | **Okay, continue** opens the login with `+91 9400000011` pre-filled, consent box **unticked**, Send OTP disabled until consent | ✅ |
| A5 | Consent, Send OTP, OTP → lands on **Step 2 of 3** with "PAN verified · PRIYA SHARMA · XXXXXX234F", "Aadhaar linked", and name, date of birth, gender, address, pincode already filled | ✅ |
| A6 | On step 2, the agent tools read the screen (7 missing fields listed), fill the email and income, tap 5 chips, and `continue_next` moves to the next step | ✅ |
| A7 | The database then holds application `SL-747282`, status `pan_pending`, with an **encrypted** PAN attached through `usePanOnFile` (the app never sent a PAN) | ✅ |
| A8 | A visitor with no name (only the OTP done): pop-up uses the plain wording, no name | ✅ |
| A9 | That visitor after login: **Home** with "You already have an account on the website … Start application / Not now"; **Start application** opens the PAN step | ✅ |
| A10 | Install **without** the link (paste declined, recorded as organic): no pop-up. Login with the website number: the app finds the visit by phone and lands on step 2 (masked `XXXXXX678G`, name Asha) | ✅ (after fix F2) |
| A11 | Install with one visitor's link, but login with a **different** number: normal first-time flow (permissions), no resume | ✅ |
| A12 | The pre-login agent guard still holds: `navigate_screen` is refused with "finish this step" | ✅ |

### 3.4 Agent tool layer (what the voice agent can do on these screens)

| ID | Scenario | Result |
|---|---|---|
| G1 | `read_screen` on step 2 returns the prefilled values and the list of missing required fields | ✅ |
| G2 | `perform_ui_action` `set_input` (email, income, mobile number) works | ✅ |
| G3 | `perform_ui_action` `tap` on chips (purpose, qualification, residence, employment, salary mode) works | ✅ |
| G4 | `set_checkbox` ticks the consent box, and `controls_now` reports it as checked | ✅ |
| G5 | `continue_next` taps Send OTP, and on step 2 moves to the next step | ✅ |
| G6 | `set_input` on the OTP field fills it and the login verifies | ✅ |
| G7 | `set_language` changes the agent language | ✅ |
| G8 | `navigate_screen` is refused during first-run ("finish this step") | ✅ |
| G9 | `page_context.journey_resume` carries stage, first name and last step for all three stages, and **never the phone number** | ✅ (Jest) |
| G10 | "Take help from agent" opens the pre-filled login with consent unticked, sets the agent stage and calls `agent.start()` with **no phone**; "Okay, continue" never starts the agent; a failed start shows a toast and the login stays usable | ✅ (Jest, agent mocked) |

---

## 4. Failures and defects found: root cause, fix, and the tests they created

### Real defects (all fixed)

| # | What failed | Root cause | Why nothing caught it earlier | Fix | New tests |
|---|---|---|---|---|---|
| **F1** | **High. The pop-up could never appear on a fresh install.** On the simulator the claim never reached the server (the link click stayed `pending`). | In `src/api/client.ts`, `trackPost()` drops every call when nobody is signed in, except the old `/track/install`. The first-launch install claim goes to `/attribution/claim`, so it was silently skipped. This was already broken before my work: install attribution had never worked on a fresh install. | Every Jest test mocked `claimInstall`, so the real request path was never run. | Allow `/attribution/claim` (and `/track/install`) without a session. | `claimInstallAnonymous.test.ts` (3 tests). I also proved the first one **fails without the fix**. |
| **F2** | **High. The "found by phone after login" path never worked.** The app ignored the answer and fell back to the link's hint, so an install **without** the link got no resume. | `GET /journey/resume` returned camelCase (`lastStep`), the app parser expects snake_case (`last_step`) like the claim response. | My unit tests used hand-written payloads in the right shape, and the server tests checked the server's own shape. | One function (`resumeToWire`) now builds the response for **both** endpoints. | **S53**: runs the app's own parser on the real responses of both endpoints and checks they agree. Plus A10 on the simulator. |
| **F3** | **High at scale. Visitors beyond the first 200 would not get reminders.** | The job read only the 200 oldest active reminders every minute, and a reminder stays active for 7 days. With more than 200 active visitors, newer ones would wait. | Found by reading the code while analysing a slow suite run (F8), not by a failing test. **I did not run the new test against the old code**, so this one is "found by review, fixed, and now covered". | New column `nextCheckAt` (migration `20261019130000`). The job picks up **only due rows**, page by page. | S54 (450 due reminders all handled in one tick, 1.3 s), S55 (not-due rows are never read), S56 to S59, plus 7 unit tests for `nextCheckTime`. |
| **F4** | **Low, privacy.** After logging in with a different number than the link's, the other visitor's name and phone stayed in app memory. | The "nothing to resume" branch cleared the stage and pop-up but not the resume object. | Not covered. | Branch now sets `resume: null`. | Jest: "forgets the install link's data…" |
| **F5** | **Cosmetic.** Greeting read "Hi PRIYA". | PAN records hold names in capitals. | Not covered. | `tidyName()` capitalises (Priya, Anna-Maria, O'Neil), trims, caps length. | `tidyName.test.ts` (3 tests); simulator now shows "Hi Priya". |

### Mistakes in my own tests (not product defects)

| # | What happened | Cause | Fix |
|---|---|---|---|
| T1 | 30 of the 49 server checks failed in the first run | The suite logged in so often from one IP that it hit the product's own login rate limit (30 a minute) | Each request now carries its own client IP, as a real proxy would |
| T2 | Smaller ones: S12 (setup finished the schedule), S24/S25 (leftover reminders from earlier tests also sent), S34 (IP header), S36 (fixture not repeatable), S49 (column in the second migration), S56 (mixed real and simulated time), Jest language leaking between tests, an untyped `global` in a test | Test setup | All fixed. The suite now passes on repeat runs. |
| T3 | A manual "idle" check on the live server did not trigger | I set the timestamp with the database's local clock; the app stores UTC | Used UTC. The re-run (W7) passed. |

### Open

| # | What | Status |
|---|---|---|
| **F8** | **Two suite runs stalled** (one over 10 minutes, one killed at ~10 minutes of CPU), while the 8 other runs take ~60 s. Not reproduced. | Open. Cause unknown; one possibility is the job re-reading many rows (F3's fix removes that). Recommend a per-test timeout so a stall fails loudly. |

---

## 5. Observations that are not failures of this feature

1. **iOS shows a "would like to paste" prompt on every fresh install**, because the app reads the clipboard once on first launch. Allow and Don't Allow were both tested; declining simply means no match.
2. **The pop-up appears before a language is chosen**, so Hindi and Telugu users see it in English. The translated text exists and renders (Jest). Showing it after the language step would fix this but the team doc says no language question first. A decision for your manager.
3. **The website hydration warnings** (step 1 page) exist without this feature.
4. **A website login pre-generates a lender token (Aurix UAT).** My ad-hoc runs made real UAT `generate_token` calls (authentication only, no PAN or customer data) a few hundred times before I found that blank URL settings fall back to the real host. The runner now blanks the secret too and makes none.
5. **Test events may have reached Upshot's Demo app** for the synthetic numbers `94000000xx` from the simulator. Meta was switched off for the run.

---

## 6. Not tested, and why

| Not tested | Why | How to cover it |
|---|---|---|
| **Android** (Redmi or emulator) | The Redmi was not connected (`adb devices` was empty) | Connect the phone, run the same A1 to A12; the Play Install Referrer path (S32 covers the server side) |
| **A live voice call** ("Take help from agent" speaking, the agent greeting by name, asking before ticking consent) | It would call Ello's live API, and the new prompt section F is **not pasted into Ello yet**, so the live agent does not know this journey | Paste `prompts/ello-inapp-copilot-prompt.md` into the agent, then do one supervised call per stage |
| **Real SMS and WhatsApp delivery** | The SMS template with a link is not registered; WhatsApp is blocked on the provider side | After both work, send to your own number with `INSTALL_REMINDER_SEND=true` |
| **A real TestFlight or store install** from the link | Placeholder link, no live listing | After the listing exists, tap the link from a real SMS |
| **Real PAN verification** feeding the resume | It is a paid UAT lender call | One supervised run on dev |
| **Hindi and Telugu pop-up on the device** | The language is only chosen after the pop-up | Jest covers the text; check the layout on a device with the language pre-set |
| **"Not now" on the device** | Not driven on the simulator | Jest covers it |
| **Quiet hours on a real clock** | Simulated times only (S14, S15) | Run once after 21:00 IST |
| **Load beyond 450 reminders, and separate server processes ticking together** | Concurrency was tested inside one process | A staging test with two server instances |
| **Applying the migrations to the hosted database** | Needs the hosted `DATABASE_URL` | Run `prisma migrate deploy` and check S49-style column parity |

---

## 7. How to re-run everything

```bash
# Automated suites
npx jest --forceExit                      # app: 383 tests
(cd server && npx vitest run)             # server: 308 tests
(cd website-next && npx vitest run)       # website: 127 tests

# Server integration suite: creates and drops its own throwaway database, sends nothing real
(cd server && bash scripts/journey/run.sh)   # 59 checks, about a minute

# Simulator scenarios: seed the three visitors into a throwaway DB, point the app at it
#   9400000011 PAN done + link (clipboard: swiftloan-ref:TSTSIM00001)
#   9400000012 only OTP done + link (swiftloan-ref:TSTSIM00002)
#   9400000013 PAN done, installs WITHOUT the link
# Temporarily set DEV_API_BASE in src/config/build.ts to http://localhost:4000/api (and revert after).
# Drive the agent tools without a voice call:
node server/scripts/journey/ello-eval.cjs "globalThis.__ello.callTool('read_screen',{})" --promise
```

## 8. Recommended next test cases

1. **Android real device**, A1 to A12, including the Play Referrer and a process kill between install and login.
2. **No network at first launch**: the claim must fail quietly and retry on the next launch (F1's flag logic).
3. **Two visitors on one phone number**, and a visitor who verifies on the website from two devices.
4. **A visitor who finishes on the website** after the app link was sent: reminders must stop (`application_finished`), tested with a real lender hand-off.
5. **Daylight and timezone**: the calling window with a server in another timezone.
6. **Account deletion from the website UI** (S44 covers the server).
7. **A supervised live agent call per stage** once the prompt is pasted.
8. **SMS and WhatsApp send in staging** with real templates, including a provider timeout (it must not be retried).
9. **A per-test timeout in the integration suite** (F8).

## 9. What was changed in your environment, and restored

- Temporary: `src/config/build.ts` (API base) and `voiceCredentials.local.js` (Meta) → **both restored** (`git diff` on `build.ts` is clean).
- Your local dev database: the journey migrations were applied (`20261019120000` and `20261019130000`, plus four earlier committed ones it was missing). A backup dump was taken first (in the session scratch folder).
- The local API server on :4000 is running again with the latest code (started by me; a different process from your old one, which I stopped earlier). The website dev server I started for the browser tests was stopped.
- Simulator: iPhone 17 is still booted with the debug app installed.
