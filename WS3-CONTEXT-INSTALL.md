# WS3 — Context-aware install (done overnight)

Two Android apps + the "download the app and continue your journey" handoff.
Everything below is **live and verified end-to-end** (except a physical on-phone
install test, which needs your device — see caveats).

## The two apps (public download links)

| Build | Package | Label | Download |
|---|---|---|---|
| **Context** | `com.swiftloan.ctx` | SwiftLoan Continue | https://github.com/veerendrabhimireddy/swiftloan-apks/releases/download/v1/swiftloan-context.apk |
| **Generic** | `com.swiftloan` | SwiftLoan | https://github.com/veerendrabhimireddy/swiftloan-apks/releases/download/v1/swiftloan-generic.apk |

They have different package ids, so **both can be installed side by side**. Both
are self-contained (JS bundle packaged — no Metro needed).

## Where to see it

- **Admin → App Downloads** (https://swiftloan-admin.onrender.com/downloads):
  two build cards with **Download APK** + **Copy link**, plus a **Generate a
  context link** tool (enter a name/product/amount → get a shareable link).
- **Website** (https://swiftloan-website.onrender.com): after a visitor submits
  the "Check your rate" form, a **"Continue on the SwiftLoan app"** card appears
  with a download link that carries their context.

## How the context flows (the requirement)

1. Visitor fills the website form (or the voice agent submits it) → the site
   POSTs their details to `POST /api/context/create`.
2. Backend stores it under a short **opaque token** (no PII in the link — RBI/DPDP
   safe) and returns a **landing link** `…/d/<token>`.
3. Visitor opens the landing page → **Download the app** (context APK) →
   **Open with my details** fires `swiftloan://onboard?token=<token>`.
4. The **context app** reads the token on launch, calls `GET /api/context/<token>`,
   pre-fills the journey, shows a **"Continuing your journey"** banner with the
   greeting, and jumps into the loan application.

Example greeting the app shows:
> "Hi Priya! As we discussed, you're interested in a ₹5,00,000 personal loan.
>  Let's continue your application from here."

The **generic** app ignores any context — neutral onboarding from scratch.

## Verified

- ✅ Both APKs build, are standalone, correct package/label, publicly downloadable (HTTP 200/206).
- ✅ `POST /api/context/create` → token + links; `GET /api/context/:token` → greeting.
- ✅ Landing page renders "Welcome back, <name>" + download + deep link.
- ✅ Admin App Downloads page shows both cards + generator (checked in browser).
- ✅ Website submit shows the continue-in-app CTA (deployed main.js v4).
- ✅ 110 mobile tests pass, all typechecks clean, everything committed & auto-deployed.

## Caveats / follow-ups

- **On-device test pending**: I couldn't install on a physical phone overnight
  (none connected). The context code path (deep link → fetch → prefill → banner)
  is coded, typechecked, and the JS is bundled into the APK, but the real
  install→open→continue UX should be tried on your phone once. To test:
  1. Install `swiftloan-context.apk`.
  2. Generate a link in Admin → App Downloads (or submit the website form).
  3. Open the landing link on the phone → Download (skip, already installed) →
     **Open with my details** → the app should greet you and continue.
- **Debug-signed builds**: these are debug APKs (functional, installable). A
  Play-ready *release* build is a follow-up — the Windows `subst`+Metro combo
  can't produce a release bundle here; do it on CI/Linux/macOS (see
  `scripts/build-apks.md`).
- Both apps register the `swiftloan://` scheme, so with both installed, tapping a
  context link shows an app chooser — pick "SwiftLoan Continue". (Can be limited
  to the context build later via a manifest flavor.)

## Key files

- Backend: `server/src/modules/context.routes.ts`, `downloads.routes.ts`, `config/downloads.ts`, `ContextSession` model.
- Mobile: `src/config/build.ts` (CONTEXT_ENABLED flag), `src/state/store.ts` (deep-link effect), `src/components/ContextBanner.tsx`, `AndroidManifest.xml` (scheme).
- Admin: `admin/src/components/AppBuilds.tsx`.
- Website: `js/main.js` (`createContextLink`).
- Build/upload: `scripts/build-apks.md`; APKs hosted at `github.com/veerendrabhimireddy/swiftloan-apks`.
