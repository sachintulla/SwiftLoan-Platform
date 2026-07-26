# SwiftLoan — Project Status

> **Single source of truth.** This file is kept current on every task completion.
> Whoever picks up the work: read this first. Update the **Update log** at the
> bottom whenever you finish something, and adjust **Next steps**.
>
> **Last updated:** 2026-07-26 — WS3 context install verified on a physical device.

---

## 1. What this program is

Rebuild the SwiftLoan loan platform around one idea: guide the customer, capture
the right info at the right moment, and measure where people drop off. Four
workstreams (from `Loan_Platform_Program_Plan`):

- **WS1** — Marketing website + guidance/lead-capture widget
- **WS2** — Mobile app (onboarding → application → status)
- **WS3** — Context-aware in-app agent (attribution-driven install)
- **WS4** — Application-tracking dashboard (funnel, drop-off, attribution)

---

## 2. Live URLs & access

| Thing | URL | Notes |
|---|---|---|
| Admin dashboard | https://swiftloan-admin.onrender.com | login `admin@swiftloan.com` / `admin123` |
| API | https://swiftloan-api.onrender.com | health: `/api/health` |
| Website (swiftloan.ai) | https://swiftloan-website.onrender.com | static site + voice guide |
| Context APK | …/swiftloan-apks/releases/download/v1/swiftloan-context.apk | `com.swiftloan.ctx` |
| Generic APK | …/swiftloan-apks/releases/download/v1/swiftloan-generic.apk | `com.swiftloan` |
| Code repo (private) | https://github.com/veerendrabhimireddy/SwiftLoan-Platform | branch `main` |
| APK host (public) | https://github.com/veerendrabhimireddy/swiftloan-apks | release `v1` |
| Database | Neon Postgres (cloud, free) | URL in `server/.env` (gitignored) + Render env |

Hosting: **Render** blueprint `render.yaml` (auto-deploys on push to `main`);
free tier sleeps after ~15 min idle (~50s cold start). Local dev: `server` on
:4000, `admin` on :4001, website served statically, mobile via Metro :8081.

---

## 3. Status by workstream

### WS4 — Admin dashboard ✅ DONE & LIVE
- Backend tracking + admin APIs (`server/src/modules/tracking|admin|adminAuth.routes.ts`), 8 new Prisma models, Redis-optional jobs, `seed:ws4` demo data.
- Next.js 14 admin, 13 pages: Overview, Loan Pipeline (+journey), Onboarding (+journey), Leads (+journey), Downloads, Users (+profile), Analytics, Notifications.
- Deployed; funnel/analytics fed by seed data **and** live mobile events.

### WS2 — Mobile app ✅ built, emitting events
- Existing RN app (com.swiftloan) builds & installs. Fire-and-forget tracking wired into `src/api/client.ts` + `src/state/store.ts` (session, screen_view, funnel, onboarding). Verified events flow to the dashboard.

### WS3 — Context-aware install ✅ DONE & LIVE (device-verified)
- Two APKs (context `com.swiftloan.ctx` / generic `com.swiftloan`), both public.
- Backend: `ContextSession` model, `POST /api/context/create`, `GET /api/context/:token`, `/api/downloads/manifest`, `/d/:token` landing page.
- Context passed via opaque token in a `swiftloan://onboard?token=…` deep link (no PII). App resolves it, greets, prefills, continues the journey.
- Admin **App Downloads** shows both builds + a context-link generator; website shows a "continue in the app" CTA after submit.
- Full detail: `WS3-CONTEXT-INSTALL.md`.

### WS3 — In-app / web voice agents (Ello) ✅ working
- **Admin dashboard voice nav** + **website voice guide** (navigate + fill forms by voice). Ello wire-protocol client `admin/src/lib/ello-agent.ts` (+ website `js/ello-agent.js`). Assistant `6a64d273a4fc43f6203cd3cc` (Native Mode, `native_mode:true`). Mic quiet-watchdog fix applied.

### WS1 — Website ✅ live (rebuild TBD)
- Current swiftloan.ai site deployed (static) with the voice guide + lead-capture form that now creates context links. A full Next.js rebuild per WS1 is not yet started (current site is the retained one).

---

## 4. Next steps (prioritized)

1. **[WS3] Production release APKs.** Current APKs are debug-signed. Produce
   Play-ready signed release builds on CI/Linux/macOS (Windows can't bundle a
   release through the `subst` drive). See `scripts/build-apks.md`.
3. **[WS2] Wire real app events into the funnel** beyond the current screen
   transitions (KYC/compliance step timings, abandonment reasons).
4. **[WS4] Real auth/roles** for admin (currently seeded demo admins) + lock down
   before sharing externally.
5. **[Infra] Always-on hosting / custom domain** if demoing externally (Render
   free tier cold-starts; consider paid or a domain).
6. **[WS1] Decide website rebuild** — keep the static site or rebuild in Next.js
   with the widget as originally scoped.
7. **[Ello] Dedicated website assistant** — the site currently reuses the admin
   navigator assistant; a website-tuned Native Mode assistant would read better.

---

## 5. Known caveats

- Free Render tier sleeps → first request after idle is slow (~50s).
- APKs are debug-signed (functional, not Play-store).
- Both apps register `swiftloan://`; with both installed a context link shows an
  app chooser (pick "SwiftLoan Continue").
- Windows build needs the `subst X:` short-path + pre-bundle trick (see
  `scripts/build-apks.md`, `CLAUDE.md`).

---

## 6. Update log

Add a dated line every time you complete something.

- **2026-07-26** — WS3 context install **verified on a physical device** (OnePlus
  Nord): installed `swiftloan-context.apk`, fired `swiftloan://onboard?token=…`,
  app opened standalone and showed the "Continuing your journey" banner + greeting
  ("Hi Veerendra! …₹5,00,000 personal loan…") with amount + name prefilled on the
  loan-application screen. On-device test item closed.
- **2026-07-26** — WS3 context-aware install shipped: two coexisting APKs
  (context/generic) on public release, backend context handoff + landing pages,
  admin App Downloads section + context-link generator, website continue-in-app
  CTA. End-to-end verified live. On-device install test still pending.
- **2026-07-26** — Ello voice agents fixed & live (assistant set to Native Mode,
  app-agnostic prompt, mic un-mute watchdog). Website voice guide added.
- **2026-07-25** — WS4 admin dashboard + backend deployed to Render + Neon;
  mobile app wired to emit tracking events; single lead-journey page added.
- **2026-07-24/25** — Mobile app built & installed; WS4 backend + admin dashboard
  built (Next.js), Ello companion prompt written.
