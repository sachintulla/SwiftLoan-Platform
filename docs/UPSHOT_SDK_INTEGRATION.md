# Upshot integration — mobile + web

**Status: integrated and building. Waiting only on credentials.**

Verified 2026-08-01 against `react-native-upshotsdk@0.4.9` and Web SDK v1.4.

---

## 1. The `jcenter()` problem, and the fix

Installing the RN package fails a normal Android build outright:

```
FAILURE: Build failed with an exception.
> Could not find method jcenter() for arguments []
```

`node_modules/react-native-upshotsdk/android/build.gradle` calls `jcenter()` on
lines 33 and 71. JCenter was sunset in **February 2022** and the method removed
in Gradle 7+; this project is on **Gradle 9.3.1**.

Fixed with **patch-package**, not a workaround in our code:

- `patches/react-native-upshotsdk+0.4.9.patch` rewrites both to `mavenCentral()`
- `"postinstall": "patch-package"` in `package.json` re-applies it on every
  `npm install`, so a fresh clone or CI checkout works with no manual step

Result: **`BUILD SUCCESSFUL in 14m 54s`** with the SDK compiled in.

> Still worth asking Upshot to publish a fixed build — a patch is a local
> mitigation, and anyone installing the package without our `patches/` directory
> hits the same wall.

> If `patch-package` itself errors with `Filename too long`, delete
> `node_modules/react-native-upshotsdk/android/build` first. Those are build
> artifacts with very deep paths and Windows MAX_PATH rejects them.

## 2. Two concerns that turned out to be non-issues

Recorded because both looked like blockers from the documentation alone:

- **Base-class conflict — none.** The docs say to extend `UpshotApplication` /
  `UpshotActivity`, and our classes already extend `Application` /
  `ReactActivity`. Reading the SDK source: `UpshotActivity extends
  ReactActivity` and `UpshotApplication extends Application`. They are built for
  React Native, so extending them is fine.
- **New Architecture.** The package ships no `codegenConfig` (legacy bridge) and
  this app runs `newArchEnabled=true`. It compiles via the interop layer;
  runtime behaviour still needs a device pass once credentials exist.

## 3. Method names came from the package, not the docs

The published docs are incomplete and in one case wrong. The real export list
was read from `node_modules/react-native-upshotsdk/index.js`:

> `initializeUpshotUsingOptions, terminate, setDispatchInterval,
> createPageViewEvent, createCustomEvent, setValueAndClose, closeEventForId,
> dispatchEventsWithTimedEvents, createLocationEvent, createAttributionEvent,
> setUserProfile, getUserDetails, showInteractiveTutorial, showActivityWithType,
> showActivityWithId, removeTutorials, fetchInboxInfo, getUserBadges,
> registerForPush, sendDeviceToken, sendPushDataToUpshot, displayNotification,
> disableUser, getUserId, getSDKVersion, getRewardsList,
> getRewardHistoryForProgram, getRewardRulesforProgram, redeemRewardsForProgram,
> getPushClickPayload, getNotificationList, getUnreadNotificationsCount,
> updateNotificationReadStatus, showInboxNotificationScreen, getStreaksData,
> setFontStyles, addListener, removeEventListener`

**There is no `userLogout`** — logout is `disableUser(true)`.

## 4. Mobile — `src/analytics/upshot.ts`

Optional `require()` (a missing package is a no-op, never a red-screen at boot),
credential-gated, and every call swallowed so analytics can never break a screen.

| Ours | SDK |
|---|---|
| `initUpshot()` | `initializeUpshotUsingOptions` + `addListener('UpshotAuthStatus')` + `setDispatchInterval(60)` |
| `upshotScreen(screen)` | `createPageViewEvent` |
| `upshotEvent(name, attrs)` | `createCustomEvent` |
| `upshotIdentify(user)` | `setUserProfile` |
| `upshotLogout()` | `disableUser(true)` |
| `showUpshotActivity(type)` / `ById(id)` | `showActivityWithType` / `showActivityWithId` |
| `showUpshotTutorial(tag)` | `showInteractiveTutorial` |
| `getUpshotBadges/Rewards/Streaks()` | `getUserBadges` / `getRewardsList` / `getStreaksData` |
| `registerUpshotPush()` / `sendUpshotDeviceToken(t)` | `registerForPush` / `sendDeviceToken` |
| `forwardPushToUpshot(payload)` | `sendPushDataToUpshot` |
| `getUpshotUnreadCount()` / `showUpshotInbox()` | `getUnreadNotificationsCount` / `showInboxNotificationScreen` |

Wired in:
- `src/state/store.ts` — `initUpshot()` once at boot; `upshotScreen()` on every
  screen transition, using the same screen names as our own analytics so an IAM
  campaign can target e.g. `offers`.
- `src/screens/mobile.tsx` — `upshotIdentify()` + `otp_verified` event right
  after OTP verification.

Left off deliberately: `EnableLocation` and `ExternalStorage`. Both trigger extra
permission prompts a lending app has no reason to ask for.

## 5. Web — `website-next/src/lib/upshot.ts` + `components/UpshotWeb.tsx`

The website is **its own Upshot app** (separate from the mobile Swiftloan / Swiftloan_prod apps),
in the same account. Identifiers live in `website-next/src/config/upshot.ts` (public client IDs,
overridable with `NEXT_PUBLIC_UPSHOT_*`):

| Upshot console | Used as |
|---|---|
| App SDK ID `18a089e8-0a20-4510-bb98-2fdb49b7e271` | `UpshotApplicationID` |
| Account ID `6cfe2c70-4130-46d5-9202-54252d38e57f` | `UpshotApplicationOwnerID` (same account as mobile) |
| Enterprise ID `029baddc-eed8-4099-9d51-b4e243fed4d1` | **not an SDK value** — Enterprise Access (server-side REST) only |

**The real Web SDK API** (checked against the official docs, https://www.upshot.ai/documentation/sdk/web/,
and the v1.4 bundle's `window.upshot`; the older code was wrong):
`createEvent('UpshotEventPageView', pageName)`, `createEventByName(name, payload, timed)`,
`updateUserProfile(profile, cb)`, `createAttributionEvent({...})`, `disableUser()`. There is **no**
`createCustomEvent` / `createPageViewEvent` / `setUserProfile` / `userLogout`; the previous web code
called those through `?.` and silently sent nothing. Profile keys are matched exactly and
case-sensitively: `appuid`, `firstName`, `lastName`, `userName`, `email`, `phone` (`+digits`), `city`,
`location: { city, country }`; anything else (e.g. `Platform`) is a custom attribute.

**Logout** is `updateUserProfile({ appuid: '' })` (documented; verified: Upshot clears the user's external id).
`disableUser()` is a permanent privacy opt-out (deletes the user's data and disables Upshot for them) and is
never called on sign-out.

**Event names / attribute keys:** the SDK keeps letters, digits and `_` and silently strips the rest, so
`PAN Verified` would be stored as `PANVerified`. The website therefore sends `PAN_Verified` and `Offers_Got`
(the app still sends the spaced forms). Keys must start with a letter; payload max 2048 bytes.

**Parity with the mobile app** (same event names, attribute names/types, and screen labels; hooked in
the API layer like mobile's `client.ts`, so no page markup changed):

| Moment | Where | Event |
|---|---|---|
| Landing | `UpshotWeb` | `website_visit` (+ UTM, `createAttributionEvent`) — once per session |
| Every route | `UpshotWeb` | page view (documented `createEvent`), named like mobile (`PAN Verification Step 1`, `My Offers`, `My Loans`…) |
| Lead form | `useLeadCapture`, `SiteScripts` | `website_form_started`, `website_lead_submitted` (+identify) |
| EMI calculator | `SiteScripts` | `emi_calculated` (debounced) |
| Language | `i18n.tsx` | `language_selected` |
| OTP | `session.ts` | `otp_requested`; `otp_verified` + identify (appuid = server user id, same as mobile) |
| Returning visitor | `applyApi.fetchMe` | identify (deduped) |
| Sign-out | `session.logout` | `appuid: ''` |
| About You | `applyApi.patchProfile` | identify (name/email) |
| PAN | `applyApi.verifyPan` | `PAN_Verified` (never the PAN) |
| Offers | `applyApi.prequalify` | `eligibility_completed`, `Offers_Got` |
| Offers page | route | `offer_viewed` |
| Apply to an offer | `applyApi.applyOffer` | `offer_selected` |
| Success page | route | `application_submitted` (once per application) |

Not sent from the website: `loan_approved` / `loan_rejected` / `loan_disbursed` / KYC events (lender-side,
not observable in the browser; the server's stall rules cover them), and PAN / DOB / address / city / credit
data (the privacy policy does not cover those going to Upshot).

Calls made before the SDK finishes loading are queued (max 50) and flushed on ready. Everything is
fire-and-forget. Unit tests: `website-next/src/lib/upshot.test.ts`.

**Verified 2026-10-14 against the live SDK** with the IDs above: `init.json` → 200 `appStatus:true`
(`api.in.goupshot.com`), profile `updateInfo.json` → 200 with `appuid`/`firstName`/`lastName`/`name` mapped
as fields and `Platform` custom, events → `events.in.goupshot.com` `success`, page views carry the page name.

## 6. One thing to keep consistent: the identity key

Phone is normalised to **E.164** (`+91…`) in all three places — server
(`/userprofile/add`), web, and mobile. If they disagree, Upshot creates several
profiles for the same person and campaign targeting silently misses.

## 7. Outstanding

1. **`AppId` / `OwnerId`** from the Upshot dashboard:
   - mobile → `voiceCredentials.local.js`: `global.SWIFTLOAN_UPSHOT_APP_ID`,
     `global.SWIFTLOAN_UPSHOT_OWNER_ID`
   - web → built-in defaults in `website-next/src/config/upshot.ts` (nothing to set); override with
     `NEXT_PUBLIC_UPSHOT_APP_ID` / `_OWNER_ID` only for a different app
   - server → `server/.env`: `UPSHOT_APP_ID`, `UPSHOT_ACCOUNT_ID`,
     `UPSHOT_API_KEY`, and the **India region host** `UPSHOT_BASE_URL`
2. **Push**: `google-services.json` into `android/app/`, plus the Firebase
   Messaging dependency and `POST_NOTIFICATIONS` permission from the install
   guide. Then call `registerUpshotPush()` after the notification permission is
   granted and forward FCM payloads via `forwardPushToUpshot()`.
3. **Device pass** once credentials exist: confirm auth fires, an IAM/activity
   renders, and legacy-bridge interop behaves under the New Architecture.
