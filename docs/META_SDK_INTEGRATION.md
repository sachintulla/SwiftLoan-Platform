# Meta (Facebook) integration — mobile SDK + website Pixel + Conversions API

**Status: built on branch `meta-integration`, uncommitted, NOT yet tested on a device.
Everything is OFF until credentials are set** (see §5), so nothing changes in any build until then.

Purpose: let Meta ad campaigns (a) count app installs and sign-ups from ad clicks and (b) count
website leads / sign-ups / applications, so campaigns can optimise on them. This is acquisition
measurement only — it is not Facebook Login, sharing, or ad serving.

Meta app: **Swiftloan**, App ID `1669156655221818` (Live, under the Swiftloan business portfolio).

## 1. What is reported (and what never is)

Only these funnel moments, each with **no parameters at all** — no amount, APR, lender, PAN, income, loan status or
user data (Meta's restricted-data policy forbids financial details):

| Our event (shared with Upshot) | Meta event | App | Website |
|---|---|---|---|
| `website_lead_submitted` | `Lead` | – | Pixel + CAPI |
| `otp_verified` | `CompleteRegistration` | `fb_mobile_complete_registration` | Pixel + CAPI |
| `PAN_Verified` / `PAN Verified` | `IdentityVerified` (custom) | `IdentityVerified` | Pixel + CAPI |
| `eligibility_completed` | `EligibilityCompleted` (custom) | `EligibilityCompleted` | Pixel + CAPI |
| `Offers_Got` / `Offers Got` | `OffersReceived` (custom) | `OffersReceived` | Pixel + CAPI |
| `offer_viewed` (offers page) | `ViewContent` | `fb_mobile_content_view` | Pixel + CAPI |
| `offer_selected` | `InitiateCheckout` | `fb_mobile_initiated_checkout` | Pixel + CAPI |
| `application_submitted` | `SubmitApplication` | `SubmitApplication` | Pixel + CAPI |
| `loan_disbursed` | `LoanDisbursed` (custom) | `LoanDisbursed` | – (not observable in a browser) |

`PAN_Verified`, `eligibility_completed`, `Offers_Got`, `offer_viewed` (and, in the app, `loan_disbursed`) can repeat on
re-fetches and revisits, so each is reported **once per app launch / page session**; the others every time. A disbursal
is therefore counted once per launch of the app that sees it, not once per loan — a server-side event from the lender
status webhook would be exact if Ads Manager needs precise disbursal counts. `InitiateCheckout` is Meta's closest standard event for "chose an
offer to apply" — there is no payment; it just gives Ads Manager a mid-funnel event with real volume to optimise on.

Plus, in the app only, Meta's automatic install / app-activation event (what ad attribution needs).
Still **not** sent: approval / rejection, amounts, APRs, lender names, the PAN itself. Added at the owner's request after
an earlier "leave out" call: `PAN_Verified` (sent as `IdentityVerified`, no PAN), `Offers_Got`, and `loan_disbursed`.
**Compliance note:** `LoanDisbursed` is the one event whose name itself reveals financial status, which Meta's
restricted-data policy is strictest about for lending advertisers. It is a single line in `META_APP_EVENT_FOR`
(`src/analytics/meta.ts`) to remove if review objects. Eight events now reach the website relay's allow-list. The fan-out is one line in each Upshot wrapper (`upshotEvent` → `metaTrackFromAppEvent` /
`metaTrackFromWebEvent`), so no screen or page file changed.

## 2. Mobile app

- Package `react-native-fbsdk-next@13.4.3` (pins Facebook iOS SDK 18.x). Wrapper:
  `src/analytics/meta.ts` — optional `require`, never throws, no-op until a client token is set.
  Started from the `store.ts` boot effect next to `initUpshot()`.
- **No advertising ID, no ATT prompt.** Android: `AD_ID` stays stripped in `AndroidManifest.xml`
  (unchanged from 1.1.9) and `AdvertiserIDCollectionEnabled=false`. iOS: `FacebookAdvertiserIDCollectionEnabled`
  false, advertiser tracking stays off. Attribution therefore comes from the Play Install Referrer
  (Android) and SKAdNetwork (iOS), not the IDFA/GAID — expect coarser iOS numbers than an ATT-opt-in app.
- **No auto-init.** `AutoInitEnabled` / `AutoLogAppEventsEnabled` are false in the manifest / Info.plist;
  `initMeta()` sets app id + client token, forces ad-id collection and ATT tracking off, enables only the
  automatic install/activation event, then starts the SDK.
- Demo/dev-backend builds (`UPSHOT_DEMO`) are kept out of Meta unless
  `globalThis.SWIFTLOAN_META_ALLOW_DEMO = true` (set it in `voiceCredentials.local.js` to test).
- Native config: `android/app/src/main/AndroidManifest.xml` + `res/values/strings.xml`
  (`facebook_app_id`); `ios/SwiftLoan/Info.plist` (`FacebookAppID`, `FacebookDisplayName`, the three
  switches). The client token is **not** in native files — it is set from JS (§5).
- The package also links Meta's Login/Share kits (autolinked). Unused; they add binary size only.
- iOS pods: Meta's frameworks download from GitHub releases. On a network that resets requests carrying
  the CocoaPods User-Agent, `pod install` fails with `Recv failure: Connection reset by peer`; each retry
  caches one more pod, so re-running eventually completes (used a scratch `curl` shim that drops `-A`).
- Tests: `__tests__/metaAnalytics.test.ts`.

## 2b. Meta datasets (Events Manager, ad account "swift loan (INR)")

| Dataset | ID | Purpose |
|---|---|---|
| SwiftLoan Website | `1488689576433881` | Pixel + Conversions API for swiftloan.ai |
| SwiftLoan App | `1488389139851857` | Linked to Meta app `1669156655221818` (the Facebook SDK in the mobile app) |

Both: category *Financial service*; not connected portfolio-wide to Conversions API. The CAPI token was
generated with Meta's Dataset Quality API option (the other path errored; Meta notes it can't be opted out of later).
An app-install campaign exists as a draft in Ads Manager ("New App Installs Campaign").

## 3. Website (`website-next/`)

- `src/config/meta.ts` (Pixel ID from `NEXT_PUBLIC_META_PIXEL_ID`; unset = completely off),
  `src/lib/meta.ts` (consent, Pixel loader, event relay), `src/components/MetaPixel.tsx`
  (loader + consent banner, mounted in `app/layout.tsx`), copy in `src/i18n/meta-consent.ts`
  (English / Hindi / Telugu).
- **Consent-gated:** the Pixel script is not even downloaded until the visitor taps **Allow** on the
  banner (`localStorage sl_meta_consent`). Decline or no answer = no Meta code runs and nothing is sent.
- Each event goes twice — browser Pixel and our relay — under one `eventID`, so Meta de-duplicates.
- Tests: `src/lib/meta.test.ts` (consent gate, one-id dedup, nothing personal in the relay body).
- Build/deploy: Dockerfile arg + `--build-arg` in `deploy.yml` / `deploy-prod.yml`; set repo variable
  `WEBSITE_NEXT_PUBLIC_META_PIXEL_ID`.

## 4. Server — Conversions API relay

- `POST /api/meta/event` (`server/src/modules/meta.routes.ts`, logic + tests in `lib/metaCapi.ts`):
  public, 60/min/IP, requires `consent: true`, eight-event allow-list, strict `eventId`/cookie shape checks,
  answers immediately and sends to Meta afterwards.
- Signed-in callers: phone / email / user id come from **our** record and are SHA-256 hashed in memory per
  Meta's spec (lower-case email; digits-only phone with `91`). Anonymous visitors are matched on `_fbp` /
  `_fbc`, IP and user agent only. Nothing personal is stored or logged.
- Graph API version defaults to `v23.0` (`META_GRAPH_VERSION`); the access token goes in the request body,
  never the URL. Unset `META_PIXEL_ID` / `META_CAPI_TOKEN` = disabled.
- **Verified 2026-10-16:** the token and Pixel ID were checked against Meta with a test event (HTTP 200,
  `events_received: 1`, no warnings). Not yet seen in Events Manager's UI; Overview can lag up to 30 minutes.

## 5. To go live

1. **Client token** (App settings → Advanced → Client token). Currently set ONLY in the gitignored
   `voiceCredentials.local.js` (`SWIFTLOAN_META_CLIENT_TOKEN` + `SWIFTLOAN_META_ALLOW_DEMO`), so local/dev
   builds report to Meta and no shipped build does. To turn it on for store builds, once §6 is cleared, put the
   token in `META_CLIENT_TOKEN` in `src/analytics/meta.ts` (public identifier, like the Upshot ids).
2. **Pixel / dataset ID** — created 2026-10-16: dataset "SwiftLoan Website", ID `1488689576433881` (category
   Financial service, not connected portfolio-wide to Conversions API, linked to ad account "swift loan (INR)").
   Set locally in `website-next/.env.local` (`NEXT_PUBLIC_META_PIXEL_ID`) and `server/.env` (`META_PIXEL_ID`);
   for deployed builds set repo variable `WEBSITE_NEXT_PUBLIC_META_PIXEL_ID` and the server env.
3. **Conversions API access token** — generated 2026-10-16 for dataset "SwiftLoan Website" and saved in the
   gitignored `server/.env` as `META_CAPI_TOKEN` (secret; Meta shows it only once — if lost, regenerate under
   dataset Settings → Conversions API → Set up direct integration, and the old one keeps working until revoked).
   Restart the API to pick it up. Use **Test events** → `META_TEST_EVENT_CODE` while verifying; remove for production.
   Production needs the same two values (`META_PIXEL_ID`, `META_CAPI_TOKEN`) in the deployed server env.
4. Meta app dashboard: Android platform registered 2026-10-16 with package `ai.swiftloan.app`, class
   `com.swiftloan.MainActivity` and key hashes for the Play **upload** key (`2mw0mBuMJu7QQXr+5KKqAapA5nw=`) and the
   debug key (`Xo8WBi6jzSxKDVR4drqm84yr9iU=`). STILL TO ADD: the Play **App Signing** key hash (Play Console →
   Setup → App signing → SHA-1 → base64) for builds installed from Play.
   **Website platform:** registered 2026-10-16 (Site URL `https://swiftloan.ai/`), saved in the same pass as Android.
   **iOS platform NOT saved — cause confirmed from Meta's save response** (`POST …/settings/basic/save/` →
   `success:false`): *"Something went wrong with retrieving your iPhone Store ID. Please make sure the app has been
   publicly available in the App Store for at least 24 hours…"* (same for iPad). Meta validates the Apple ID against the
   PUBLIC App Store, so it cannot save while the app is TestFlight-only. Apple ID `6796624689` (from the archive's
   distribution record, `~/SwiftLoan-builds/SwiftLoan-1.1.9-59.xcarchive/Info.plist` → `adamId`), bundle
   `ai.swiftloan.app`, iPhone + iPad Store ID both `6796624689`. The form saves as ONE request, so one bad platform
   rejects the whole form — an earlier Website+iOS attempt saved neither; save them separately. Retry iOS ≥ 24 h after
   the App Store release. The SDK does not need this (it runs on app ID + client token; verified in the iOS simulator),
   but iOS ad attribution does.
5. Rebuild both apps (native changes): `pod install`, then a normal run.

## 6. Compliance — needs review BEFORE a store build ships this

The 1.1.9 resubmission told Google "no advertising ID" and told Apple the app does no tracking. The
integration is built to keep that true for the ID, but sharing events with Meta is still a disclosure change:

- **Privacy policy** (app + website, `privacyBody.ts`) must name Meta as a recipient of coarse
  install/sign-up/application signals for ad measurement, and the website banner links to it.
  Draft wording, in the style of `docs/UPSHOT_PRIVACY_DISCLOSURE_DRAFT.md`, still to be written and reviewed.
- **Google Play Data Safety:** declare data shared with a third party for advertising/marketing
  (app interactions; device or other IDs if the install referrer counts). Advertising ID answer stays **No**.
- **App Store privacy labels / ATT:** Meta SDK collecting product-interaction data for advertising must be
  declared; because no IDFA is read and nothing is linked with other companies' data, no ATT prompt is planned —
  confirm with whoever owns the App Store submission.
- **Android:** `AD_ID` and `ACCESS_ADSERVICES_*` remain removed via `tools:node="remove"`; verify on the
  merged manifest after a release build.
- **App consent:** the app has no ad-measurement consent UI (the website does). If compliance wants an opt-in
  in the app, gate `initMeta()` behind it — it is a single call site in `store.ts`.
- Meta's policy on financial products and restricted data applies to the campaigns themselves.

## 7. Testing

- Website: set `NEXT_PUBLIC_META_PIXEL_ID`, `npm run dev`, accept the banner, use Meta's Pixel Helper;
  with `META_PIXEL_ID` + `META_CAPI_TOKEN` + `META_TEST_EVENT_CODE` on the server, events appear under
  Events Manager → Test events with matching `event_id` (Pixel + server = "Deduplicated").
- App: with a token set and `SWIFTLOAN_META_ALLOW_DEMO = true`, complete OTP login / submit an application and
  check Meta App Dashboard → Events (can lag minutes). There is no advertising ID, so Events Manager "Test
  events" for app events is not usable; use the dashboard's activity view.

## 8. iOS build note (pod install gotcha)

A fresh `pod install` leaves the **Release** React prebuilt in `ios/Pods`; a **Debug** build then fails to link with
`Undefined symbols … facebook::react::Sealable` (from `libRNSVG`/safe-area) because React's build script assumes the
folder already holds the Debug flavour ("No previous build detected, but Debug Configuration. No need to replace").
Not Meta-related (identical without the Meta pods). Fix: write the marker the script reads, then build:

```sh
printf Release > ios/Pods/React-Core-prebuilt/.last_build_configuration   # same for ReactNativeDependencies and hermes-engine
```

The next Debug build swaps in the debug tarballs from `~/Library/Caches/ReactNative`. On a network that resets
CocoaPods' user agent, `pod install` itself needs retrying (see §2). Verified 2026-10-16: `xcodebuild … -destination
'platform=iOS Simulator,…'` → BUILD SUCCEEDED; the app launches and the Facebook SDK contacts Meta for app 1669156655221818.
