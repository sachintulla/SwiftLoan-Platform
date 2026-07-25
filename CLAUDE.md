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
- [ ] Add trackEvent, trackOnboardingStep, trackLoanStep,
      trackSessionStart, trackSessionEnd to src/api/client.ts
- [ ] Add fire-and-forget tracking calls at screen transitions
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
