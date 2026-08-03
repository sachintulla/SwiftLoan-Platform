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

## 5. Web — `website-next/src/components/UpshotWeb.tsx`

CDN script (`https://cdn.goupshot.com/UpshotWebSDK/v1.4/upshot.min.js`) loaded
and initialised via `upshot.init(params, callback)`, mounted in `layout.tsx`.

- Page views on every client-side route change
- `upshotIdentify()` + `website_lead_submitted` (with UTM attribution) on lead
  form submit
- Guards against double-injection under React strict mode
- Dev-only on-page notice when the env vars are missing — a silent no-op is
  exactly how the Ello voice widget went unnoticed for a whole session

`subscribePush: false` and `UpshotFetchLocation: false` on purpose: both fire a
browser permission prompt on first page load otherwise.

## 6. One thing to keep consistent: the identity key

Phone is normalised to **E.164** (`+91…`) in all three places — server
(`/userprofile/add`), web, and mobile. If they disagree, Upshot creates several
profiles for the same person and campaign targeting silently misses.

## 7. Outstanding

1. **`AppId` / `OwnerId`** from the Upshot dashboard:
   - mobile → `voiceCredentials.local.js`: `global.SWIFTLOAN_UPSHOT_APP_ID`,
     `global.SWIFTLOAN_UPSHOT_OWNER_ID`
   - web → `website-next/.env.local`: `NEXT_PUBLIC_UPSHOT_APP_ID`,
     `NEXT_PUBLIC_UPSHOT_OWNER_ID`
   - server → `server/.env`: `UPSHOT_APP_ID`, `UPSHOT_ACCOUNT_ID`,
     `UPSHOT_API_KEY`, and the **India region host** `UPSHOT_BASE_URL`
2. **Push**: `google-services.json` into `android/app/`, plus the Firebase
   Messaging dependency and `POST_NOTIFICATIONS` permission from the install
   guide. Then call `registerUpshotPush()` after the notification permission is
   granted and forward FCM payloads via `forwardPushToUpshot()`.
3. **Device pass** once credentials exist: confirm auth fires, an IAM/activity
   renders, and legacy-bridge interop behaves under the New Architecture.
