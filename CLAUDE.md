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
