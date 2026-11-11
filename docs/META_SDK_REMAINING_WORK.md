# Meta SDK: what is left so all events are received (2026-11-11)

Checked live in Meta (app `swiftloan` 1669156655221818, dataset `SwiftLoan App` 1488389139851857). No secrets in this file.

## Current state
- Events Manager > Diagnostics: no active errors.
- Events received 16 Oct to about 1 Nov (max 40/day), none since. No shipped build has had a client token.
- Charan's `43267a3` (develop) fixed the import order, so `meta.ts` now sees the token when it exists. Merged into `feat/firebase-app-events`.
- The 8 events sent: `otp_verified`, `pan_verified`, `eligibility_completed`, `offers_got`, `offer_viewed`, `offer_selected`, `application_submitted`, `loan_disbursed`.

## Verified 2026-11-11
- Merged branch (`3aa081f`, develop + Firebase): `npm run typecheck` clean; Jest firebase/meta/upshot-parity 24/24 pass.
- Meta Basic settings: iOS store IDs are EMPTY and no iOS section is shown, so the iOS platform is NOT configured (an earlier read of "ios enabled" was a hidden field).
- Android: package + class set, 2 key hashes; cannot tell from Meta which is the Play signing key.
- NOT verified: per-event counts in the Events Manager table, the Facebook SDK tab (never loaded), any device run, Kotlin/iOS compile, Firebase console, WhatsApp.

## Decision: token fallback in `meta.ts` (done locally, uncommitted)
`META_CLIENT_TOKEN` now falls back to the client token in `src/analytics/meta.ts` when `globalThis.SWIFTLOAN_META_CLIENT_TOKEN` is undefined; setting it to `''` still switches Meta off. Demo/dev-backend builds stay excluded unless `SWIFTLOAN_META_ALLOW_DEMO`. Typecheck clean, Jest 24/24. Item 1 below is therefore handled once this is committed and compliance (item 6) is cleared.

## To add / do (in order)
1. **Client token in release builds** (the blocker). It lives only in gitignored `voiceCredentials.local.js`, so a build from git has an empty token. Pick one:
   - A. Put it as the fallback in `META_CLIENT_TOKEN` in `src/analytics/meta.ts` (public identifier, like the Upshot ids; goes into git history; compliance sign-off pending), or
   - B. Have the release pipeline write `voiceCredentials.local.js` (sets `SWIFTLOAN_META_CLIENT_TOKEN`) before bundling.
   Token: Meta App Dashboard > swiftloan > Settings > Advanced > Client token.
2. **Android key hash:** add the Google Play App Signing SHA-1 (Play Console > Setup > App signing, converted to base64) to Meta > Settings > Basic > Android > Key hashes. Two hashes are there now; confirm one is the Play signing key.
3. **iOS platform:** add it in Meta > Settings > Basic > Add platform > iOS: bundle ID `ai.swiftloan.app`, iPhone store ID `6796624689`. (Meta may refuse until the app has been live on the App Store 24 h+.)
4. **Ship new Android + iOS builds.** Installed apps only report after updating.
5. **Verify on a device:** Events Manager > Test events, then the Overview chart.
6. **Compliance:** privacy policy, Play Data Safety and App Store labels naming Meta (and Firebase). A dedicated data-deletion page for Meta (it points at the privacy page now). `LoanDisbursed` is the sensitive event name; drop it from `META_APP_EVENT_FOR` if compliance objects.

## Not covered here
- WhatsApp (Vox messages stuck at `SUBMITTED`): separate, to be looked at later.
- Firebase events: branch `feat/firebase-app-events`, PR not opened yet.
