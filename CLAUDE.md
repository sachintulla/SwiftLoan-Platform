# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SwiftLoan is a **React Native CLI** app (RN 0.86, React 19, TypeScript) that is a
**faithful, screen-for-screen mirror of a design bundle** (a loan-marketplace
prototype). Fidelity to the original design is the point — do not "improve",
restyle, or restructure screens unless asked. All 25 screen files / 26 routes are
already built. A separate scalable backend lives in `server/`.

> Note: the actual stack differs from common RN defaults. There is **no Expo, no
> React Navigation, no Zustand/Redux, no NativeWind**. See below.

## Commands

App (run from repo root):
```sh
npm start                         # Metro bundler
npm run ios                       # build + run iOS  (see CocoaPods gotcha below)
npm run android                   # build + run Android
npm test                          # Jest — 110 tests
npx jest __tests__/logic.test.ts  # run a single test file
npx jest -t "UC-N3"               # run tests matching a name
npm run typecheck                 # tsc --noEmit
npm run lint                      # eslint
```

Backend (run from `server/`, needs local Postgres on :5432):
```sh
cd server
npm start            # tsx src/index.ts  → http://localhost:4000
npm run seed         # seed lender-partner catalog
npm run smoke        # 21-check end-to-end API test (server must be running)
npm run prisma:push  # apply prisma/schema.prisma to the DB + regenerate client
npm run typecheck
```
DB `swiftloan_db` on the local Postgres (see `server/.env`). Prisma is pinned to
**v6** on purpose — v7 dropped `url` from the datasource block and requires driver
adapters.

## Architecture (the parts that need multiple files to understand)

### Navigation is a hand-rolled state machine — not a router library
- `src/state/store.ts` — a React Context + `useReducer` holding **all app state**
  (current `screen`, form fields, auth/OTP, profile, etc.). Exposes
  `go(screen)`, `back()`, `set(patch)`, `showToast()`, `reset()`.
- Navigation graph lives in the `PREV` map (back-stack parents, ported from the
  design's `prevMap`) plus timed auto-transitions in an effect (`splash→language`,
  `finding→offers`, both 2.6s).
- `src/Router.tsx` renders `SCREENS[state.screen]`; unknown routes fall back to a
  placeholder.
- **To add/replace a screen:** build the component in `src/screens/`, register it
  in `src/screens/index.ts` (`SCREENS` map), and add a `PREV` entry in
  `store.ts` for its back-arrow target. That's the whole wiring.
- Quirks that are intentional: `otp` is the `otpSent` state of the `mobile`
  screen (aliased to the same component); `apply/income/residence/consent/
  prequalify` are logic-only dead routes with no design markup and are deliberately
  unbuilt.

### Screens compose a small primitive layer
- `src/components/Frame.tsx` — `Screen` (the wrapper: background variant
  `app|hero|plain`, safe-area, scroll, optional `bottomNav`), `AppHeader`,
  `BottomNav` (Home/Loans/Profile), `AppBackground`/`HeroBackground`, `Toast`.
  Almost every screen starts with `<Screen>`.
- `src/components/Controls.tsx` — `PrimaryButton`, `Field`, `Chips`, `Toggle`,
  `Slider` (PanResponder), `ConsentRow`, `Card`, `StepBadge`, etc.
- Other shared pieces: `Icon`, `Logo`, `Calendar`, `EmiCalculator`, `Kyc`,
  `StepDots`. Animated count-ups use the `useDrive(ms)` hook (`src/utils`).
- `src/components/common/` — `Loading`/`Skeleton`, `ErrorState` (with retry),
  `Empty`. Data screens (offers, loans, repay, profile) render one of these
  around fetched data.

### Design tokens, fonts, icons — use these, never raw values
- `src/theme/tokens.ts` — colors (primary `#079FA0`, mint `#2FB183`, ink
  `#0A3F41`), gradients, `radius`, and the `inr()`/`rupee()` Indian currency
  formatters. Screens must pull colors from here.
- Typography: call `font(weight)` (→ the correct bundled Inter family). Weights are
  separate font files, not a numeric `fontWeight`. Fonts (Inter + Material Symbols
  Outlined) were extracted from the design bundle into `assets/fonts/` and linked
  via `react-native.config.js`.
- Icons: `<Icon name="chevron_right" />` renders a **Material Symbols ligature** —
  names are snake_case glyph names, exactly as in the source design.

### i18n
- `src/i18n/strings.ts` holds the full `en`/`hi` table (te/hinglish/tenglish fall
  back to `en`). Screens read copy via the `useT()` hook; user-facing strings come
  from here, not string literals. `strings.ts` is `@ts-nocheck` because the source
  table has an intentional duplicate key.

### Backend (`server/`) is a separate workspace
- Node + Express + TypeScript + Prisma + PostgreSQL. Layered:
  `modules/*.routes.ts` (auth, users, applications, kyc, loans, catalog, tools,
  support) → `lib/prisma.ts`. Auth = JWT access + rotating refresh tokens.
- Data model (`server/prisma/schema.prisma`) is derived from the app flow:
  application funnel → `LoanApplication` → `Offer` → `Loan` + `Repayment[]`.
- The app calls it through `src/api/client.ts` (base URL auto-selects
  `localhost` on iOS, `10.0.2.2` on Android). **Wired flows:** auth (mobile/OTP →
  `verifyOtp`, "Skip" → `ensureSession` anonymous login), profile (load/save/
  language/notifications), and the loan funnel (basic → createApplication →
  basicpan → finding/prequalify → offers → handoff → loan; loans/repay/creditscore
  read live). Screens hold a session token in the api-client module + mirror
  `authUser`/`applicationId`/`loanId` in the store. Endpoints that need auth
  degrade gracefully to the design's demo data when offline/guest.
- `server/` is **excluded** from the app's `tsconfig.json`, `jest.config.js`, and
  `metro.config.js` (blockList) — keep it that way to avoid haste/type collisions.

## Testing
- Jest + React Native Testing Library. Preset is `@react-native/jest-preset`
  (a separate package in RN 0.86). Native modules are mocked in `jest.setup.js`
  (linear-gradient, svg, safe-area-context).
- Test IDs map to the use-case matrix in `docs/USE_CASES.md`. Render tests query
  by human-readable text — prefer unique strings (some titles appear twice).

## Environment gotchas
- **iOS pods:** `pod install` fails with an ASCII-8BIT/Unicode error unless run
  with a UTF-8 locale: `cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`.
- **Stale Metro:** if screens render wrong/stale on launch, another project's Metro
  is on :8081 — kill it and `npx react-native start --reset-cache` from this repo.
- New Architecture (bridgeless) is on; `console.log` does not stream to the Metro
  terminal by default.

---

## New work: Admin Dashboard + Tracking layer

> Everything below this line is additive. The mobile app and existing server/
> are NOT to be modified — only extended where explicitly stated.

### If resuming after interruption
1. Read this entire file first
2. Check "Build progress" below to see what is done
3. Read already-created files to understand current state
4. Continue from the first unchecked item
5. Do not restart or rebuild anything already marked complete

### Ports
- Mobile app backend (existing):  http://localhost:4000  (server/)
- Admin dashboard:                http://localhost:4001  (admin/)

### Tracking extension — where to add it in the existing app
The existing `src/api/client.ts` already handles all API calls.
Tracking calls must be added here as new functions — do NOT create a
separate tracking service file or modify any screen files.

New functions to add to `src/api/client.ts`:
  trackEvent(event_type, event_name, screen, metadata?)
    → POST server/  /api/track/event
  trackOnboardingStep(step_number, step_name, status, time_spent_seconds)
    → POST server/  /api/track/onboarding/step
  trackLoanStep(loan_id, step_name, status, time_spent_seconds, hold_reason?)
    → POST server/  /api/track/loan/step
  trackSessionStart(device_info)
    → POST server/  /api/track/session/start
  trackSessionEnd(session_id, pages_visited)
    → POST server/  /api/track/session/end

Tracking calls are fire-and-forget (do not await, do not block UI).
Add them as side-effects only — never change any screen's rendering logic.

### New server modules to add inside server/
Add these route modules to the existing Express server in server/src/modules/:
  tracking.routes.ts   — /api/track/* endpoints
  admin.routes.ts      — /api/admin/* endpoints (users, onboarding, loans,
                         leads, downloads, dashboard, notifications)
  adminAuth.routes.ts  — /api/admin/auth/* endpoints

Add new Prisma models to server/prisma/schema.prisma (additive only):
  Session, ActivityEvent, OnboardingFunnel, AnonymousLead, AppDownload,
  AdminUser, Notification

Run `npm run prisma:push` after schema changes. Do NOT modify existing models:
  User, LoanApplication, Offer, Loan, Repayment

### Admin dashboard is a separate Next.js app in admin/
It is completely separate from the RN app and server/.
It runs on port 4001 and talks to server/ at http://localhost:4000.

### Global decisions for new work
- All new API responses: { success, data, message, pagination?, error? }
- Status colours (consistent across admin dashboard):
    completed/approved/disbursed = green
    in_progress/submitted/active = blue
    paused/on_hold/pending       = amber
    abandoned/rejected/failed    = red
    anonymous/not_started        = grey
    converted                    = teal
- All amounts in paise (existing server convention)
- Tracking calls are fire-and-forget — never block UI

### Build progress

#### Server — tracking + admin extension
- [x] Add new Prisma models (Session, ActivityEvent, OnboardingFunnel,
      AnonymousLead, AppDownload, AdminUser, Notification)  + AdminRefreshToken
- [ ] Run prisma:push   (BLOCKED: needs DATABASE_URL for hosted Postgres)
- [x] tracking.routes.ts — /api/track/* endpoints
- [x] admin.routes.ts — users, onboarding, loans, leads, downloads,
      dashboard overview, dashboard realtime, dashboard charts, live feed
- [x] adminAuth.routes.ts — admin login/logout/me (+ refresh)
- [x] BullMQ jobs: idle-detector, loan-stale, onboarding-stale,
      notification-sender  (Redis-optional; in-process fallback)
- [x] Seed: 50 users, 200 events, 20 onboarding records, 15 loans,
      30 leads, 20 downloads, 5 admin users  (npm run seed:ws4)

#### Mobile app — tracking side-effects only
- [x] Add trackEvent, trackOnboardingStep, trackLoanStep,
      trackSessionStart, trackSessionEnd to src/api/client.ts
- [x] Add fire-and-forget tracking calls at screen transitions
      (store.ts dispatch points — no screen file changes)

#### Admin Dashboard (admin/ — Next.js 14)   [builds clean, port 4001]
- [x] Project setup + dependencies (Next 14, SWR, Recharts)
- [x] Auth (login page + token-guarded Shell)
- [x] Layout (sidebar with live badge counts + topbar)
- [x] Shared components (StatCard, StatusBadge, FunnelChart, PipelineBar,
      LiveFeed, StepTracker, charts, DataTable-style tables, etc.)
- [x] Page: Master Overview
- [x] Page: Onboarding List
- [x] Page: Single Onboarding Journey
- [x] Page: Loan Pipeline
- [x] Page: Single Loan Journey
- [x] Page: Leads & Contact Us  (inline status edit)
- [x] Page: Single Lead Journey (/leads/[id]: stage tracker, attribution,
      status+note editor, converted-user link)
- [x] Page: App Downloads
- [x] Page: All Users
- [x] Page: User Profile
- [x] Page: Analytics
- [x] Page: Notifications

#### Ello voice-navigation widget (admin/)
- [x] Ported self-contained Getello client (admin/src/lib/ello-agent.ts)
- [x] Dashboard navigation tools (ello-tools-admin.ts): go_to_page, open_loan,
      open_lead, open_user, go_back — Next router + admin API search
- [x] Floating mic VoiceWidget mounted in Shell (env-gated)
- [x] Env wired (admin/.env.local + render.yaml NEXT_PUBLIC_ELLO_*)
- [x] Assistant system prompt: prompts/ello-admin-navigator-prompt.md
      (needs a Native Mode / Gemini Live assistant on the ello dashboard)

GO-LIVE (remaining): set server/.env DATABASE_URL (hosted Postgres) →
`cd server && npm run prisma:push && npm run seed:ws4 && npm start` →
`cd admin && npm run dev` (http://localhost:4001, login admin@swiftloan.com / admin123).

#### Support tickets (website Support page → admin dashboard → email)
- Customer raises a ticket on the website's `/account/support` (or the app's `createTicket`) →
  `POST /api/support/tickets` (`server/src/modules/support.routes.ts`): category + subject + message,
  optional linked application, rate-limited (3 / 10 min, 10 / day). Public reference = `SL-T-00042`.
- Notification email goes to `SUPPORT_NOTIFY_TO` via SMTP (`server/src/lib/mail.ts`, template in
  `lib/supportTickets.ts`, unit-tested). Env: `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM`,
  `SUPPORT_NOTIFY_TO`, `ADMIN_DASHBOARD_URL`. Unset SMTP = ticket still saved, email skipped
  (`emailError` recorded, shown in admin with a Resend button). Email is fire-and-forget.
- Admin: `/support` page (`admin/src/app/(dash)/support`) backed by `/api/admin/support` —
  filter, status, reply to customer (`adminNote`, shown on the customer's ticket), resend email.
  Sidebar badge = open + in-progress count.
- Schema change shipped as `prisma/migrations/20261006120000_support_ticket_workflow` (additive).
  Note: `prisma migrate dev` can't build its shadow DB here (old `PreApprovedPlan` baseline
  migration) — write the SQL by hand and apply with `prisma migrate deploy`.

---

## UI sound effects + agent action choreography (`src/feedback/`)

**Sound policy (global keys in `src/config/sounds.ts`):**
- `UI_SOUNDS_ENABLED` (master): `false` = no sound anywhere (the agent's visual effects still run).
- `UI_SOUNDS_MANUAL_TEST_MODE`: shipped as `false` — the USER'S own taps, typing, sliders, scrolling
  and menu-bar taps are ALL silent; sound plays only while the voice agent works the screen (scroll
  roll, key ticks, soft-pop taps/select/toggle, slider detents, the error cue, nav). The agent's
  focus ring and successful fills are deliberately SILENT — the click that follows is the only sound.
  `true` = test mode: manual interaction also plays the full set so it can be tried by hand. Don't
  add `playSound` calls to user-driven handlers — use `playManualSound` (silent unless test mode).
  `setSoundsEnabled()` / `setManualSoundsEnabled()` override at runtime (tests).

- `sounds.ts` — `playSound(name)` / `playTypingTick()`; clips are synthesised by
  `scripts/gen-sounds.js` into `soundData.ts` (base64 WAV; re-run the script to retune) and loaded
  once into the native **`UiSound`** module (`android/.../uisound/UiSoundModule.kt` SoundPool;
  `ios/SwiftLoan/UiSound/UiSoundModule.swift` System Sounds, exposed to JS as `UiSound` via
  `RCT_EXTERN_REMAP_MODULE`). Nothing to link; no-op if the module is missing (Jest / stale build).
- `boot.ts` (first import in `index.js`) swaps react-native's `Pressable` for one that registers
  each labelled button with the agent (`installPressableFx.ts`) — covers the 116+ raw Pressables with
  no screen edits. It is silent; it only enables scroll-into-view and the agent's ring/ripple.
- `agentFx.ts` — what `perform_ui_action` / `navigate` (tools.ts) do around every agent action:
  `revealTarget` scrolls the control into view (via the scroller `<Screen>` registers and the
  per-control refs from `useAgentFx`; controls flagged `fixed`, i.e. the tab bar, are never scrolled
  to), `agentApproach` lights it (ring, no sound), `typeText` types character-by-character with
  key ticks (always writes through a FRESH target — the registered handler goes stale per render),
  `slideTo` walks sliders, `agentPress` dips + clicks, `agentSettle` ends silently (only a refused entry plays the error cue). Typing has a
  ~1.5 s budget and batches characters when a step is slow (each keystroke re-renders the whole
  screen: 26 chars took 8.7 s on the Redmi dev build before, 1.9 s after). `perform_ui_action`
  calls run one at a time (queued) so they can't interleave. All pacing is skipped under Jest
  (`configureFx({instant})`); visual animations are also off under Jest (`animate`) because
  Animated's 0 ms rAF shim spins on a faked clock.
- Controls (`Controls.tsx`) each call `useAgentFx(label, group)` and render `<AgentRing/>`.
- Mic caveat: UI sounds play on the sonification stream at low volume; the agent's mic is open
  during a call, so keep new sounds short/quiet or they can be transcribed as stray user turns.
- **Website parity (`website-next/src/feedback/`):** the website has the same system — `config/sounds.ts` (same two
  switches), `sounds.ts` (WebAudio, lazy-loaded at call start), `agentFx.ts` (DOM: reveal, ring + ripple overlays, typing
  ticks, slider detents, press dip), `manual.ts` (visitor cues, test mode only), wired into the tools in
  `VoiceWidget.tsx`. `scripts/gen-sounds.js` writes both copies of `soundData.ts`. Keep the two policies identical.

## Website language (`website-next/`)

- Exactly three languages — English, Hindi, Telugu — in `src/lib/i18n.tsx` (`LANGS`, `defineCopy`, `useCopy`). The choice is
  stored in `localStorage` (`sl_lang`) and restored after hydration. The switch is the header menu on marketing pages and
  `components/site/LanguageSwitcher.tsx` inside the `/apply/*` and `/account/*` shells (the header is hidden there); the
  voice assistant's `set_language` drives the same context.
- Copy lives in `src/i18n/*.ts` (one module per area: `apply-shell`, `apply-flow`, `apply-details`, `apply-offers`,
  `apply-compare`, `account`, `account-support`, `status`). The `en` entry is the source and must match the page
  character-for-character. Option pills keep the English string as the VALUE (`ChipGroup renderLabel` translates only the
  display). Brand/technical terms stay in Latin script (SwiftLoan, PAN, OTP, EMI, KFS, Aadhaar, APR, GST, UPI, eKYC, RBI, NBFC).
  Status labels come from `useStatusMeta()`. Not translated (legal text, English on purpose): the privacy-policy body
  (`src/content/privacyBody.ts`) and the compliance page.
- **Voice must not depend on page wording.** Controls are found by their on-screen text, so in Hindi/Telugu the assistant
  passes back the translated label it read. The things that must hold in every language are marked, not matched:
  `data-voice-gate` (logout, apply-offer, confirm-loan, verify-pan, submit-ticket, skip-step), `data-voice-otp`,
  `data-voice-sensitive`, and `aria-busy="true"` on loading placeholders. New gated buttons need the attribute.
- A word the owner has asked not to use: Telugu "మొదలుపెడదాం" — keep it out of all copy.


---

## Install attribution + friend referrals

Shareable link `GET /dl?ref=<referral code>` (`server/src/modules/referral.routes.ts`, pure logic in
`lib/attribution.ts`, DB logic in `lib/referral.ts`). It logs an `AppClick` (IP/UA stored as keyed HMAC hashes only,
purged after 48 h by the `click-purge` job) then redirects: Android → `ANDROID_STORE_URL` (a `play.google.com` URL gets
the Play `referrer=click_id…` param), iOS → an interstitial that copies `swiftloan-ref:<token>` to the clipboard, then
`IOS_STORE_URL` (TestFlight/App Store). **Both store URLs are DUMMY defaults until the real listings exist.**
- First launch (`store.ts` boot effect, once per install via AsyncStorage `swiftloan.install.claimed`; already-signed-in
  devices are skipped) reads the OS signal (`utils/installSignals.ts` → native `InstallReferrer` (Android, Play Install
  Referrer API) / `Attribution` (iOS clipboard)) and calls `POST /api/attribution/claim`. Match order: Play referrer →
  clipboard token → same-IP click inside `ATTRIBUTION_WINDOW_MIN` (only if exactly ONE candidate, OS version breaks ties).
  Sideloaded APKs have no Play referrer, so they use the IP window. Replaces the old per-process `trackInstall`.
- Friend referral: after OTP login the app redeems the stored code (`POST /api/referrals/redeem`). Rules: new account
  (< `REFERRAL_ELIGIBLE_DAYS`), no self/mutual referral, one referrer per referee. `FriendReferral.status` advances
  signed_up → applied (offer selected/applied) → disbursed via `advanceReferral()`. **Tracking only — `rewardStatus` stays
  `none`; no reward policy is approved (needs compliance review before any money/rate benefit).**
- App: `referral` screen (Profile → "Refer a friend", `GET /api/referrals/me`, native Share sheet). Admin: `/referrals`
  page + Matched-by/Ref columns on App Downloads. Migration `20261009000000_install_attribution_referrals` (additive).
- Privacy to declare in store forms: IP address + device identifiers for app functionality/analytics; no ATT prompt
  (nothing is shared with ad networks).

---

## Partner lenders on the website (Yubi alt-offers + Revasure)

Same server endpoints as the app — nothing lender-specific is client-only.
- **Revasure** needs no client code: the server fires its Create-Lead inside `POST /applications/:id/prequalify`, which the
  website's `/apply/finding` already calls. `REVASURE_TOKEN` is env-only (no fallback in source; unset = disabled), and a
  remote `http://` base needs `REVASURE_ALLOW_INSECURE=true`.
- **Yubi / YMPL** on the website: a **Get more offers** button (`components/apply/GetMoreOffers.tsx`, `hooks/useAltOffer.ts`,
  `lib/altOffers.ts`, pure rules in `lib/altOfferLogic.ts`) on `/apply/offers` — below the offers, and as the "nothing matched"
  variant in the empty states. Shown when `GET /config/features` → `altOffers` and an application exists. Click → `POST /alt-offer`
  → the SAME tab navigates to the partner journey (a top-level navigation). **It cannot be shown in an iframe**: YMPL sends
  `X-Frame-Options: DENY` + `frame-ancestors none` (the app's WebView isn't a frame, so it ignores that). Don't re-add an iframe/
  proxy without Yubi allow-listing our origins. The website can't see the partner's "Proceed" tap, so it asks "Did you proceed?"
  when the visitor is back (`sl_alt_pending` in sessionStorage; asked on arrival / Back / focus) → `POST /alt-offer/applied`;
  applied referrals appear in My Applications (`partnerReferrals`). `/partner/return` is where YMPL sends the user back
  (`YUBI_RETURN_URL=https://swiftloan.ai/partner/return`). Voice: `data-voice-gate="explore-lenders"`.
- **Local dev behind a TLS-inspecting proxy:** `server/src/lib/devCa.ts` makes outbound `fetch` trust `NODE_EXTRA_CA_CERTS` from `.env`
  (Node only reads that variable at process start, so dotenv alone silently failed → Aurix/Yubi `SELF_SIGNED_CERT_IN_CHAIN`). No-op in production.
- Website tests: `cd website-next && npm test` (vitest + jsdom); run in CI.

## Partner-call limits (prequalify)

- **Revasure — one lead per phone number, ever.** `createRevasureLead` checks-and-claims under a per-number advisory lock
  (`server/src/lib/revasureLead.ts`): if a lead Revasure decided on (`success` / `duplicate` / `ineligible`) already exists for the
  user or that number (matched on the stored request's `mobile_number`), or one is in flight, it returns `status: 'skipped'` and sends
  nothing. A *failed* attempt (bad token, outage) does not block, so it can be retried once fixed. If it cannot check/record, it
  does not send (fails closed).
- **Aurix — only re-fetch offers when the applicant's details changed.** `lib/offersReuse.ts` fingerprints exactly the
  profile + application fields the eligible_offers request is built from and stores it on `LoanApplication.offersSignature`
  with `offersFetchedAt`. Prequalify reuses stored offers (this application's own, or copies from the user's recent application
  with the same fingerprint — `lib/offersReuseDb.ts`) and skips the lender call; any change to those details (income, PAN,
  address, amount, tenure, …) triggers a fresh call. Technical failures are never remembered, so they stay retryable. Reuse
  window `OFFERS_REUSE_HOURS` (default 24, matching the "valid for 24 hours" promise; `0` = never expires). A cached Aurix
  token that is rejected (401) is replaced and retried once.
- **Yubi is deliberately untouched** (its pre-warm still runs on every prequalify; the partner handles its own limits).
- Terminology: a `LoanApplication` is created when the applicant submits their details (before offers); fetching offers
  (prequalify) fills it with `Offer` rows; a `LenderApplication` is created only when they apply to a specific lender's offer.

---

## PAN handling (never stored in the clear)

- A PAN is **never** stored, returned or logged in plaintext. Where it is genuinely needed (the lender eligibility call and
  the Revasure lead are made server-side, after the user typed it) it lives in `User.panEnc` / `LoanApplication.panEnc`,
  AES-256-GCM encrypted with the env-only `PII_ENCRYPTION_KEY` (`server/src/lib/pii.ts`; production refuses to boot without
  it; never rotate by just changing the value).
- `server/src/lib/storedPan.ts` is the **only** reader/writer. `lib/prisma.ts` omits `panNumber`/`panEnc` from every query by
  default, so a plain `findUnique`/`include`/`res.json(row)` cannot leak one; use `loadPan(userId, applicationId?)` and decrypt
  in memory for that one call. APIs expose only `User.panOnFile` (boolean). The offers fingerprint uses a keyed hash, not the PAN.
- The legacy plaintext `panNumber` columns are deprecated and never written. Run `cd server && npm run pan:encrypt` (after the
  `20261015120000_encrypted_pan` migration, same `PII_ENCRYPTION_KEY` as the API) to encrypt existing values and null the
  plaintext; once `SELECT count(*) … WHERE "panNumber" IS NOT NULL` is 0 in User and LoanApplication, drop the columns.
- Clients never pre-fill the PAN field and never keep the PAN: the website's Step-1→2 hand-off holds only a masked form
  (`XXXXXX234A`), and Step 2 asks the server to attach the user's own PAN (`PATCH /applications/:id {usePanOnFile:true}`).
- `PanRecord.dataEnc` (encrypted PAN-verification cache: PAN, prefill, raw response) uses the same key.

---

## Meta (Facebook) ads measurement — app SDK + website Pixel + Conversions API

Full detail in `docs/META_SDK_INTEGRATION.md`. Everything is **off until credentials exist**.
- Reports ONLY a few coarse funnel moments, no parameters: `Lead` (website lead form), `CompleteRegistration` (`otp_verified`),
  `IdentityVerified` (PAN step, no PAN), `EligibilityCompleted`, `OffersReceived`, `ViewContent` (offers page),
  `InitiateCheckout` (`offer_selected`), `SubmitApplication`, and app-only `LoanDisbursed`. Never amounts/APR/lender/the PAN.
  `LoanDisbursed` is policy-sensitive (financial status) — one line in `META_APP_EVENT_FOR` to drop. Repeatable steps fire once per session.
  Hooked as one line inside each Upshot `upshotEvent` (`metaTrackFromAppEvent` / `metaTrackFromWebEvent`) — no screen edits.
- App (`src/analytics/meta.ts`, `react-native-fbsdk-next`): no advertising ID (AD_ID stays stripped), no ATT prompt, no
  native auto-init; needs `META_CLIENT_TOKEN`; demo builds excluded unless `SWIFTLOAN_META_ALLOW_DEMO`.
- Website: Pixel loads only after the visitor accepts the consent banner (`MetaPixel.tsx`); `NEXT_PUBLIC_META_PIXEL_ID`.
- Server: `POST /api/meta/event` relays to the Conversions API (`lib/metaCapi.ts`), hashes ids, dedups via shared `eventID`;
  needs `META_PIXEL_ID` + `META_CAPI_TOKEN`.
- Don't ship in a store build until the privacy policy / Data Safety / App Store labels are updated (see §6 of the doc).

---

## WhatsApp via Voxvalley (replaced Infobip)

- Provider key `voxvalley` (Admin → Configs → WhatsApp). `server/src/lib/whatsapp.ts` posts to
  `{baseUrl}/api/v1/whatsapp/send` with `Authorization: Bearer <project authToken>` + `projectid` in the body. A 200 only
  means **queued**; failures are HTTP 400 or `status: "FAILED"`. Secret is `authToken`; settings: `projectId`, `sender`
  (active WABA number), `defaultTemplate`, `messageCategory`, `callbackUrl`, `siteUrl`, `stallTemplates`.
- **Stuck-stage nudges** (`lib/stallWhatsapp.ts`, called from `evaluateRule`): a `whatsapp`-channel stall rule sends the
  approved template mapped to its trigger stage in `settings.stallTemplates` (`{name}/{ref}/{offerCount}/{siteUrl}` tokens;
  a customer missing a value is skipped, never sent a blank). Stage with no mapping, or integration off → falls back to the
  Upshot event as before. Guards: calling hours, 1 per customer per `STALL_WA_COOLDOWN_HOURS` (24), `STALL_WA_MAX_PER_CUSTOMER`
  (3) lifetime, only stalls newer than `STALL_WA_MAX_AGE_HOURS` (24) so enabling a rule never messages the backlog, do-not-contact
  skipped, `OutboundRequest` row claimed before sending, failures not retried. New seeded `WHATSAPP — …` rules start **disabled**
  and all use a **30-minute** stall delay. Shipped `stallTemplates` defaults are merged UNDER what the dashboard saved (saved
  entry wins; blank `template` = back to Upshot), so new stages reach environments that already saved the form.
  Seeding only inserts missing rules — an existing rule's delay is edited on the Notifications rules page, not by the seed.
- **WhatsApp send is blocked on Vox's side (as of 2026-10-16):** `POST https://cpaas.voxdigitals.com/api/v1/whatsapp/send` (and `/api/v2/…`)
  return nginx `405` even from Vox's own docs "Test API" tab — the real host/path must come from Vox support. Set it via the card's
  Advanced `baseUrl`/`sendPath`. A direct **Meta Cloud API** backend also exists (`meta_whatsapp` integration: `phoneNumberId` +
  `accessToken`); when it is enabled it is used instead of Voxvalley. No live WhatsApp send has been verified yet.
- **SMS works and is the live stuck-stage channel:** `lib/voxSms.ts` posts to `settings.smsUrl`
  (`https://cpaas.voxdigitals.com/sms-customer-apis/sms/v2/send`) with the project token IN THE BODY as `authtoken`, plus
  `projectid`, `from` (`smsSender`, DLT sender ID), `to` (`+91…`), `template_id` and `body`. India SMS is DLT-regulated: the body
  must match the registered template (`smsTemplateId`/`smsBody`) exactly — the admin form uses a textarea so its line break
  survives. `lib/stallSms.ts` is called from `evaluateRule` for `sms`-channel rules (8 seeded `SMS — …` rules, one per funnel
  step, **30-minute** delay, enabled; per-stage text via `settings.smsTemplates[triggerEvent]`). Same guards as WhatsApp
  (calling hours, 1 per `STALL_SMS_COOLDOWN_HOURS`=24, `STALL_SMS_MAX_PER_CUSTOMER`=3, only stalls < `STALL_SMS_MAX_AGE_HOURS`=24,
  DNC skipped, key claimed before sending, failures not retried). Nothing sends until the Voxvalley integration is enabled with a
  token. Verified: a real SMS to the owner's number, and a full fake-stall → rule → SMS run locally.
- Templates live in the Voxvalley portal (WhatsApp → My Templates): application_received, document_request, emi_reminder,
  kyc_completed, loan_disbursed, marketing_check_rate, offers_ready, otp_verification. Placeholder counts must match exactly.
- Not built yet: delivery-status webhook (`callbackUrl`) and inbound "STOP" opt-out handling.

---

## Website drop-off recovery: install-link reminders (phases 1-2 built; sending is log-only)

Plan + sign-off: `docs/JOURNEY_RESUME_PLAN.md` / `.docx` / `JOURNEY_RESUME_ONE_PAGE.docx`. Built: phase 1 (server + website) and phase 2 (app
resume). NOT yet: real sending (needs the SMS/WhatsApp templates) and the admin view.
- `JourneyReminder` (migration `20261019120000_journey_reminders`, additive; **not applied to the hosted DB yet**) is armed when a visitor
  verifies their OTP on the website (`websiteAuth.routes.ts` → `armInstallReminder`). It holds the last step (`otp_only | pan_done |
  application_started`), first name from the PAN check (`kyc.routes.ts` → `markPanVerified`), and a reference token used as `/dl?ref=<token>`.
- Website tab pings `POST /api/website/activity` (`website-next/src/lib/activityPing.ts`, mounted by `ActivityPing` in the apply/account layouts).
  5 minutes without a ping = "dropped off at <lastStep>". **The schedule starts at that moment** (`startAt` is reset to the drop time; nothing is sent while the visitor is still active — the first version sent the first message at login, caught on a real run).
- Rules are pure and tested in `server/src/lib/reminderSchedule.ts`: SMS then WhatsApp +30 min at start, +4 h, +8 h, then days 1-7 (20 messages),
  calling hours only, a step far too late is skipped, never two messages < 30 min apart. Stops on install (matched `AppClick` with this ref), app
  login, application at the lender or beyond, do-not-contact (`Customer.currentStage = 'lost'`), or a return to the website (next cycle, max 3).
- Job `install-reminder` (every minute, in `NUDGE_JOBS`) in `lib/installReminder.ts`. **Log-only unless `INSTALL_REMINDER_SEND=true`**: it records
  what it would send in `JourneyReminder.history`. Real sends need Voxvalley settings `installSmsTemplateId` + `installSmsBody` (must contain `{link}`; may also use `{name}` and `{step}`, with `installStepLabels` renaming the steps)
  and `installWhatsapp` `{template, language, placeholders: ['{name}','{link}']}` (`{step}` is also available; `install_app_resume_step` takes name, step, link) (a registered DLT template / approved WhatsApp template).
- `stallSms` / `stallWhatsapp` stand down for anyone with an active reminder (`lib/installReminderGuard.ts`), so no two sequences overlap.
- **App resume (phase 2).** `POST /attribution/claim` returns a `resume` block ONLY for a deterministic match (Play referrer / clipboard token; never
  a same-IP guess): reference token, first name, phone, last step (`lib/journeyResume.ts`). `src/components/ResumePrompt.tsx` (mounted in `App.tsx`)
  shows "Okay, continue" / "Take help from agent"; both open `mobile` with the number pre-filled and the consent box UNTICKED (the agent asks before
  ticking it). After OTP, `screens/mobile.tsx` asks `GET /journey/resume` (the authority; the link's hint is used only for the same number) and routes by
  `utils/resume.ts`: `pan_done` → `basic` (step 2) using `GET /kyc/pan/on-file` (masked PAN + prefill, never the PAN; `basic.tsx` then saves with
  `usePanOnFile`); `otp_only` → Home + "Start application?" pop-up; anything else → the normal flow. permissions/About You are skipped for a resumed visitor.
  **Already-installed app, opened from the visitor's link** (`swiftloan://onboard?token=<link reference ID>`): `store.ts` first tries the old lead/agent
  context for that token; if there is none it asks `POST /api/attribution/resume` (public, throttled to 20/min per IP because it returns a phone number +
  first name; same payload as the claim/login) and, if a fresh journey exists and nobody is signed in, shows the same pre-login pop-up ("Okay, continue"
  opens the login with the number filled in, consent unticked). Nothing generates such a link yet: SMS/WhatsApp carry the https `/dl` link.
  The voice agent gets `page_context.journey_resume` (`stage`, `first_name`, `last_step`; no phone). Prompt: section F + a Name Rule exception in
  `prompts/ello-inapp-copilot-prompt.md` (edited locally; paste into Ello by hand).
- **Job scheduling (`nextCheckAt`).** Each `JourneyReminder` row says when it next needs attention (next step due, or the 5-minute idle check);
  `installReminderTick` reads only rows that are due, page by page (migration `20261019130000_journey_reminder_next_check`). The first version read
  the 200 oldest active rows, so newer visitors starved once more than 200 were active.
- **One active run per visitor.** Two concurrent website pings after a drop-off each created their own next-cycle row, so prod sent the same WhatsApp twice. Migration `20261026120000_journey_reminder_one_active` stops existing duplicates (keeps the oldest) and adds the partial unique index `JourneyReminder_one_active_per_user` (`userId` WHERE `status='active'`; migration-only, Prisma cannot express it, so `db push` will not create it — `run.sh` applies the SQL itself). `createReminder` catches the conflict and returns the run that won (promoting an `unverified` one to a normal run). Apply with `prisma migrate deploy`.
- **Tests.** Server integration suite: `cd server && bash scripts/journey/run.sh` (89 checks against a throwaway DB and fake providers, nothing real is sent;
  it blanks the Aurix secret because a website login otherwise calls the lender UAT). Simulator seeds + inspector helper: `server/scripts/journey/`.
  Full report: `docs/JOURNEY_RESUME_TEST_REPORT.md`. Two lessons from it: `trackPost()` used to drop the anonymous `/attribution/claim` (install attribution
  never worked on a fresh install), and both resume endpoints must go through `resumeToWire()` (the app parses snake_case).

---

## Message delivery tracking (WhatsApp / SMS status → admin "Messages")

A gateway 200 only means "queued", so every send is recorded and the provider's later reports are matched to it.
- `MessageDelivery` (migration `20261019140000_message_delivery`, additive; **apply with `prisma migrate deploy` on the hosted DB**). One row per
  provider message id: channel, status (`queued < sent < delivered < read`, or `failed`), phone key, kind (`install_reminder | stall | test | admin`),
  error code/text, and the raw reports received. Pure rules in `lib/messageStatus.ts` (tested): failure words win over success words, `failed` beats
  queued/sent but never delivered/read, a late delivery supersedes an early failure, queued/sent for > 15 min = "stuck". DB side: `lib/messageDelivery.ts`
  (`recordSend`, `applyStatusEvents`, `recordUnparsed`). `whatsapp.ts` / `voxSms.ts` record every send (SMS has no reports: stays `sent`).
- Public webhook `GET/POST /api/webhooks/whatsapp` (`modules/whatsappStatus.routes.ts`): Meta-style `entry[].changes[].value.statuses[]` and flat shapes.
  Auth is the dedicated `WHATSAPP_WEBHOOK_KEY` (query `?key=` or header `x-webhook-secret`; 503 if unset, 401 if wrong). Unreadable or unmatched bodies
  are stored raw and still answered 200, so the first real callback shows what shape the gateway really sends and the parser can be adjusted.
- Callback URL given to the gateway per send: `<PUBLIC_BASE_URL>/api/webhooks/whatsapp?key=<WHATSAPP_WEBHOOK_KEY>` (https only; the Voxvalley
  `callbackUrl` setting overrides it). Without a public https URL no reports can arrive; the admin page says so.
- Admin: `/messages` (`admin/src/app/(dash)/messages`, API `modules/adminMessages.routes.ts`): tiles, filters, stuck/missing-callback callouts, detail panel.
  Account deletion also removes the person's `MessageDelivery` rows. Demo data for screenshots: `server/scripts/journey/messages-demo-seed.mts` (throwaway DB only).

### Local phone test (iPhone on the same Wi-Fi as the Mac; nothing committed, nothing deployed)
- `src/config/build.ts` `DEV_API_BASE = 'http://<Mac LAN IP>:4000/api'` (covers API + tracking; iOS allows it via `NSAllowsLocalNetworking`).
  **Set back to `''` and never commit it.** `server/.env` `PUBLIC_BASE_URL=http://<same IP>:4000` makes the reminder link (`/dl?ref=`) reachable from
  the phone; remove it after (an https value is needed for the WhatsApp delivery callback). The Mac's IP: `ipconfig getifaddr en0`; it changes with the network.
- Journey: verify the number + PAN on the local website (`website-next`, :4002, talks to :4000), stop for 5 minutes, then open
  `http://<IP>:4000/dl?ref=<token from JourneyReminder>` in Safari on the phone (copies the clipboard token, goes to TestFlight), delete any installed copy
  first (the install claim runs once per install), then launch the dev build from Xcode: pop-up → OTP → step 2. Templates to register for real sends:
  `docs/JOURNEY_RESUME_TEMPLATES.md`.


---

## Admin Timings (timings and limits changed without a deploy)

Super admins change waits, windows, lifetimes and limits in **Admin → Timings** (`admin/src/app/(dash)/timings`; the in-app help bubble
timings stay on **App Config**). Plain admins can look, not save. Every save/reset goes through `auditAdmin`.
- **Precedence: admin override (`PlatformSetting` row) > env variable > built-in default.** The registry is `server/src/lib/timings.ts`
  (pure: key, section, kind, min/max, default, env fallback, validation); `timingsStore.ts` is the DB side (cache refreshed every 30 s and on save,
  started in `index.ts` before the jobs). Code reads synchronously: `timing.num('install.idleMinutes')`, `timing.bool(…)`, `timing.minutesMs(…)`.
  **Add a setting = one entry in `TIMINGS` and replace the constant at its use site**; the admin page renders from `GET /api/admin/timings`.
  A stored value that breaks its own rules is ignored (falls back), so a bad row can never take a flow down.
- API: `GET/PUT /api/admin/timings`, `DELETE /api/admin/timings/:key` (`modules/adminTimings.routes.ts`). A save is all-or-nothing and returns
  per-field `errors`. Migration `20261022120000_admin_timings` (additive: `PlatformSetting` + three `AppConfig` columns).
- Install reminders: the message schedule is an editable list of `{channel, afterMinutes}` rows counted **from the drop-off** (never at login).
  `install.sendEnabled` (admin switch; env `INSTALL_REMINDER_SEND` only sets the starting value) + `install.allowedNumbers` (test list: when set, only
  those numbers are messaged; the rest are recorded as `skipped: not on the test-number list`). The job is throttled by `install.jobEveryMinutes`.
  Steps skipped for being too late are consumed, never replayed later. Rules take a `ScheduleConfig` (`reminderSchedule.ts`).
- Others: calling hours (`calling.windowStart/End`, minutes after midnight IST, overnight allowed), lead-call delays/retries, OTP validity/resend
  window, website session / access-token / admin-idle lifetimes, install-link click life + IP window, offers reuse window, referral eligibility,
  PAN daily limit, website ping interval (returned to the page by `POST /website/activity` as `pingEverySeconds`), app bubble start/rotate/snooze.
- Tests: `server/src/lib/timings.test.ts` (registry), `reminderSchedule.test.ts` (custom schedules), `__tests__/nudgeTimings.test.ts` (app),
  `website-next/src/lib/activityPing.test.ts`, and integration S90–S114 in `server/scripts/journey/integration-suite.mts` (admin API auth/validation/
  save/reset/audit, and each setting changing real behaviour). Suite is now 114 checks.
- Known, pre-existing: `admin/src/components/Shell.tsx` reads the role from localStorage while rendering, so the super-admin-only nav items cause a
  dev-mode hydration warning (also on App Config / Audit Log). Harmless; fix by deferring `getAdmin()` to an effect.

---

## "You applied with <lender>" messages (`server/src/lib/lenderNudge.ts`)

Lenders do not report status back (the `handoff` status only ever comes from their webhook), so after someone taps Apply we say only what is true and point to
the app: "you applied with <lender>, install the SwiftLoan app to track it". Never claim under review / approved.
- **One sequence per `LenderApplication`** (`LenderNudge` table, migration `20261023120000_lender_nudges`). The job (`lender-nudge`, every minute, throttled
  by `install.jobEveryMinutes`) ARMS them itself from recent lender applications (no edit to the apply route; website and app both covered). Not armed for
  someone already in the app (`in_app`), a review phone, a person with no website link to carry (`no_link`), or an application older than `applied.maxAgeHours`.
  The link is the visitor's own `JourneyReminder.token` (`/dl?ref=`), so install attribution and app resume work as before.
- **Several lenders:** each lender gets its own sequence naming that lender. A message that would follow ANOTHER lender's message to the same person by less
  than `applied.minGapMinutes` (60) waits (`crossLenderWait`); one lender's own steps keep exactly the schedule's spacing (an earlier version applied the
  gap to a lender's own steps too and delayed its SMS; the integration suite caught it).
- **Stops** on install (matched `AppClick`), app login, do-not-contact, or that lender application becoming `rejected`/`disbursed`/`closed` (or deleted).
  `under_review`/`approved`/`handoff` keep going. Stuck-stage nudges stand down while one is active (`hasActiveInstallReminder`).
- **Install reminders now stop at Apply.** `JourneyReminder` used to stop only when the application reached `handoff` (lender webhook), so someone who had
  applied still got "your application is incomplete". `stopReasonFor` now also stops on ANY `LenderApplication` for the user (`application_finished`).
- Own send switch `applied.sendEnabled` (Admin → Timings, **off by default**: log-only, same guard rails as the install reminders, shares the
  `install.allowedNumbers` test list). Templates: `appliedWhatsapp` (default `loan_applied_install_app`, **awaiting Meta approval**), `appliedSmsTemplateId` +
  `appliedSmsBody` (blank until the DLT template exists); texts in `docs/JOURNEY_RESUME_TEMPLATES.md` §5. Sends are recorded as kind `applied_nudge` (Admin → Messages).
- Tests: `lenderNudgeRules.test.ts` (pure) and integration S115–S141 (arming, sending against fake providers, multi-lender gap, stops, safety, handover).
- **Step names in the install messages** (`DEFAULT_STEP_LABELS`) name the step they are STUCK ON, since the sentence reads "incomplete at <step>": mobile verified → "PAN verification" (website step 1), PAN done → "Basic details" (step 2), application row exists → "Finding offers" (step 3). They used to name the last step FINISHED ("Mobile verification" / "Pan verification" / "Application"), which read one step behind. Prod can override with `installStepLabels` in Configs → Voxvalley without a deploy.
- **Lean default schedules (DPDP / TRAI-DLT: contact proportionate to the purpose).** The install reminder is now 5 messages over a week (WhatsApp 10 min,
  SMS 4 h, WhatsApp 1 day, SMS 3 days, WhatsApp 7 days; never more than 2 on the first day), 2 runs per visitor (was 20 messages, 3 runs). "You applied with
  <lender>" is 2 WhatsApp messages (10 min, next day) per lender. All editable in Admin → Timings; a value already saved in `PlatformSetting` (e.g. prod's old
  20-message schedule) overrides the new default until reset. `reminderSchedule.test.ts` and integration S01-S89 pin the ORIGINAL 20-message pattern on purpose
  (it exercises every rule branch); S90+ run on the real defaults.
- **Asked for an OTP but never entered it** (`armUnverifiedReminder`, called from the website `/otp/request` only; the app's own OTP never arms it).
  `JourneyReminder.unverified` (migration `20261023130000_journey_reminder_unverified`), step `otp_requested` → label "OTP verification", name "there". Its own
  short schedule (`install.unverifiedSchedule`: WhatsApp 10 min, SMS 1 day), switch `install.unverifiedEnabled`, ONCE per number ever (a number that already has any
  reminder is skipped) because the number is unproven: anyone can type any number. Entering the code later stops it (`verified`) and starts the normal run with the
  SAME cycle number. Still gated by `install.sendEnabled` and the test-number list. **Not built yet (needed before a wide rollout): STOP/opt-out handling for
  WhatsApp and SMS replies, and an NCPR/DND scrub for SMS.**

