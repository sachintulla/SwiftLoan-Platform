/**
 * Upshot SDK wrapper for the mobile app.
 *
 * Every method name below was verified against the installed package's
 * `index.js` rather than the docs — the docs omit several and the logout call
 * is `disableUser`, not `userLogout`.
 *
 * Mirrors the fire-and-forget contract of the tracking in `src/api/client.ts`:
 * nothing here throws, blocks the UI, or changes what a screen renders. Every
 * call no-ops until the SDK is present AND credentials are set, so the app
 * behaves identically with or without it.
 *
 * The native module is resolved with an optional require rather than a static
 * import, so a missing package is a no-op instead of a red-screen at boot.
 */

import { NativeModules, Platform } from 'react-native';
import { UPSHOT_DEMO } from '../config/build';

/** Upshot's platform label for this build — never hard-code it: iPhones were being
 *  profiled as Android. */
export const PLATFORM: 'iOS' | 'Android' = Platform.OS === 'ios' ? 'iOS' : 'Android';

// Two Upshot apps exist in the console (Account settings -> App Management). The
// SDK's "Owner ID" is the console's "Account ID"; "App SDK ID" is the App ID.
//   - Builds pointed at a dev/local backend  -> the Demo app "Swiftloan", so test
//     traffic never lands in production data (see UPSHOT_DEMO in config/build.ts).
//   - Builds pointed at the production API   -> the Production app "Swiftloan_prod".
// Either can still be overridden with globalThis.SWIFTLOAN_UPSHOT_APP_ID / _OWNER_ID.
const UPSHOT_IDS = UPSHOT_DEMO
  ? { appId: 'ce84173a-1e4b-4dcf-b1d3-8d9504cd0c50', ownerId: '6cfe2c70-4130-46d5-9202-54252d38e57f' } // Demo
  : { appId: 'f8ac8f46-ba91-4d54-a8de-da4546e85fdb', ownerId: '6cfe2c70-4130-46d5-9202-54252d38e57f' }; // Production
const APP_ID: string | null = (globalThis as any).SWIFTLOAN_UPSHOT_APP_ID ?? UPSHOT_IDS.appId;
const OWNER_ID: string | null = (globalThis as any).SWIFTLOAN_UPSHOT_OWNER_ID ?? UPSHOT_IDS.ownerId;

/** Activity types Upshot can render (surveys, polls, trivia/mini-games…). */
export type UpshotActivityType =
  | 'survey'
  | 'poll'
  | 'trivia'
  | 'quiz'
  | 'rating'
  | 'tutorial'
  | 'inapp';

type UpshotNative = {
  initializeUpshotUsingOptions: (optionsJson: string) => void;
  terminate?: () => void;
  setDispatchInterval?: (seconds: number) => void;
  createPageViewEvent?: (screen: string, callback: () => void) => void;
  createCustomEvent?: (name: string, payload: string, isTimed: boolean, callback: () => void) => void;
  setUserProfile?: (profileJson: string) => void;
  getUserId?: () => Promise<string>;
  getUserDetails?: () => Promise<unknown>;
  disableUser?: (disable: boolean) => void;
  // activities / IAM / gamification
  showActivityWithType?: (type: string) => void;
  showActivityWithId?: (id: string) => void;
  showInteractiveTutorial?: (tag: string) => void;
  getUserBadges?: () => Promise<unknown>;
  getRewardsList?: () => Promise<unknown>;
  getStreaksData?: () => Promise<unknown>;
  // push + inbox
  registerForPush?: () => void;
  sendDeviceToken?: (token: string) => void;
  sendPushDataToUpshot?: (payload: string) => void;
  getNotificationList?: () => Promise<unknown>;
  getUnreadNotificationsCount?: () => Promise<number>;
  showInboxNotificationScreen?: () => void;
  addListener?: (event: string, cb: (payload: unknown) => void) => void;
};

let native: UpshotNative | null = null;
let resolved = false;

function sdk(): UpshotNative | null {
  if (resolved) return native;
  resolved = true;
  // The wrapper builds `new NativeEventEmitter(NativeModules.UpshotReact)` at
  // import time. In any build where the native module isn't linked (e.g. a
  // simulator build with Upshot excluded), UpshotReact is undefined and that
  // constructor throws an *uncaught* invariant red-screen at boot. Guard by
  // confirming the native module is present before we require the JS wrapper.
  if (!(NativeModules as { UpshotReact?: unknown })?.UpshotReact) {
    native = null;
    return native;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-upshotsdk');
    native = (mod?.default ?? mod) as UpshotNative;
  } catch {
    native = null;
  }
  return native;
}

/** Debug builds only: one greppable line per call handed to the SDK
 *  (`adb logcat | grep "\[upshot\]"`, or the Metro terminal). Release builds log nothing. */
function devLog(...args: unknown[]): void {
  if (__DEV__) console.log('[upshot]', ...args);
}

/** Swallow everything — analytics must never break a screen. */
function safe(fn: () => void): void {
  if (!started) return;
  try {
    fn();
  } catch (e) {
    if (__DEV__) console.warn('[upshot]', e);
  }
}

export const UPSHOT_CONFIGURED: boolean = !!(APP_ID && OWNER_ID);
let started = false;

/** True once init has completed; useful for dev diagnostics. */
export function isUpshotReady(): boolean {
  return started;
}

/** Boot the SDK. Idempotent. */
export function initUpshot(): boolean {
  if (started) return true;
  if (!UPSHOT_CONFIGURED) {
    if (__DEV__) {
      console.warn(
        '[upshot] SWIFTLOAN_UPSHOT_APP_ID / _OWNER_ID not set — Upshot disabled. ' +
          'Add them to voiceCredentials.local.js.',
      );
    }
    return false;
  }
  const s = sdk();
  if (!s?.initializeUpshotUsingOptions) {
    if (__DEV__) console.warn('[upshot] react-native-upshotsdk is not installed');
    return false;
  }

  try {
    // The init option keys must be the SDK's `bk*` names. The native bridge
    // copies this JSON into the options Bundle VERBATIM (jsonToBundle) — unlike
    // setUserProfile, it does not translate friendly names. Sending `AppId` /
    // `OwnerId` therefore reaches BrandKinesis with no application id at all and
    // auth fails with "Invalid parameters" — which is exactly what the device
    // reported before this was fixed.
    s.initializeUpshotUsingOptions(
      JSON.stringify({
        bkApplicationID: APP_ID,
        bkApplicationOwnerID: OWNER_ID,
        // Both left off deliberately: each triggers an extra permission prompt
        // that a lending app has no reason to ask for.
        bkFetchLocation: false,
        bkStorageAppMemory: false,
        bkExceptionHandler: true,
      }),
    );
    // Auth is reported through a listener, not a callback — nothing else works
    // until this fires, so surface it in dev.
    s.addListener?.('UpshotAuthStatus', (status) => {
      if (__DEV__) console.log('[upshot] auth', status);
    });
    // Push lifecycle (iOS emits these from the native module; Android handles push in
    // SwiftLoanMessagingService). Debug-only visibility: the token itself is never logged.
    s.addListener?.('UpshotPushToken', () => devLog('push token registered with Upshot'));
    s.addListener?.('UpshotOnPushClickInfo', () => devLog('push notification tapped'));
    s.addListener?.('UpshotPushPayload', () => devLog('push payload received'));
    // Documented range 10–120s. Short in debug builds so events reach the dashboard
    // quickly while testing; 60s in release to batch for battery.
    s.setDispatchInterval?.(UPSHOT_DEMO ? 10 : 60);
    devLog('initialised', { platform: PLATFORM, demo: UPSHOT_DEMO, dispatchSeconds: UPSHOT_DEMO ? 10 : 60 });
    started = true;
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[upshot] init failed', e);
    return false;
  }
}

/* ─────────────────────────── events ─────────────────────────── */

// The native iOS bridge declares these methods with a required
// RCTResponseSenderBlock callback (react-native-upshotsdk's JS wrapper is
// `createPageViewEvent(screenName, callback)` / `createCustomEvent(name,
// payload, isTimed, callback)`). Omitting it makes the bridge throw "argument
// must be a function. Got undefined" — so pass a no-op callback.
const noop = (): void => {};
/** SDK callback for events: in debug builds it confirms the SDK accepted the call. */
const accepted = (what: string) => (): void => devLog('sdk accepted', what);

/**
 * Readable names for the screens whose internal ids are not self-explanatory.
 * Upshot (Live Events, screen-targeted campaigns) sees these labels; every screen
 * not listed here is sent under its internal id (home, profile, offers, ...).
 * The application funnel steps are numbered in the order the user does them.
 */
export const UPSHOT_SCREEN_LABELS: Record<string, string> = {
  intro: 'Get Started',
  fare: 'My Offers',
  loans: 'My Loans',
  basicpan: 'PAN Verification Step 1',
  basic: 'Basic Details Step 2',
  moredetails: 'More Details Step 3',
  finding: 'Finding Loader',
  compare: 'Compare Offers',
};

/** Screens that are never reported: the animated logo at launch carries no information. */
const UPSHOT_SKIPPED_SCREENS = new Set(['splash']);

export function upshotScreen(screen: string): void {
  if (!started || UPSHOT_SKIPPED_SCREENS.has(screen)) return;
  const name = UPSHOT_SCREEN_LABELS[screen] ?? screen;
  devLog('screen ->', name);
  safe(() => sdk()?.createPageViewEvent?.(name, __DEV__ ? accepted(`screen:${name}`) : noop));
}

export function upshotEvent(name: string, attrs: Record<string, unknown> = {}): void {
  if (!started) return;
  devLog('event ->', name, attrs);
  safe(() => sdk()?.createCustomEvent?.(name, JSON.stringify(attrs), false, __DEV__ ? accepted(`event:${name}`) : noop));
}

/* ───────────────────────── identity ───────────────────────── */

/**
 * Identify after OTP verification.
 *
 * Phone is normalised to E.164 to match the server's `/userprofile/add` and the
 * website SDK. If the three disagree, Upshot creates several profiles for one
 * person and campaign targeting silently misses.
 */
export function upshotIdentify(user: {
  userId: string;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  city?: string | null;
}): void {
  const digits = (user.phone || '').replace(/\D/g, '');
  const phone = digits
    ? user.phone!.startsWith('+')
      ? user.phone!
      : `+91${digits.slice(-10)}`
    : undefined;
  const fullName = (user.name || '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (started) {
    devLog('identify ->', {
      appuID: user.userId,
      phone: phone ? `${phone.slice(0, 3)}******${phone.slice(-2)}` : null,
      name: fullName || null,
      platform: PLATFORM,
    });
  }
  // The SDK maps profile fields by EXACT key: `appuID`, `firstName`, `lastName`,
  // `userName`, `email`, `phone` (see UpshotModule.java predefinedKeys / the iOS
  // wrapper). Any other key is stored as a custom attribute, so the old
  // `appuid` / `Name` / `Email` / `Phone` left App UID and Name blank on the
  // dashboard. Platform / City / Country stay custom attributes.
  safe(() =>
    sdk()?.setUserProfile?.(
      JSON.stringify({
        appuID: user.userId,
        firstName: parts[0],
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
        userName: fullName || undefined,
        email: user.email ?? undefined,
        phone,
        City: user.city ?? undefined,
        Country: 'India',
        Platform: PLATFORM,
      }),
    ),
  );
}

/** Upshot's logout is `disableUser(true)` — there is no `userLogout`. */
export function upshotLogout(): void {
  safe(() => sdk()?.disableUser?.(true));
}

/* ─────────── activities: IAM, surveys, mini-games, tutorials ─────────── */

/** Show whatever activity of this type Upshot has queued for the user. */
export function showUpshotActivity(type: UpshotActivityType): void {
  safe(() => sdk()?.showActivityWithType?.(type));
}

/** Show one specific activity authored on the Upshot dashboard. */
export function showUpshotActivityById(id: string): void {
  safe(() => sdk()?.showActivityWithId?.(id));
}

export function showUpshotTutorial(tag: string): void {
  safe(() => sdk()?.showInteractiveTutorial?.(tag));
}

/* ─────────────── gamification: badges, rewards, streaks ─────────────── */

async function query<T>(fn: (() => Promise<T>) | undefined): Promise<T | null> {
  if (!started || !fn) return null;
  try {
    return await fn();
  } catch {
    return null;
  }
}

export const getUpshotBadges = () => query(sdk()?.getUserBadges?.bind(sdk()));
export const getUpshotRewards = () => query(sdk()?.getRewardsList?.bind(sdk()));
export const getUpshotStreaks = () => query(sdk()?.getStreaksData?.bind(sdk()));

/* ─────────────────────── push + inbox ─────────────────────── */

export function registerUpshotPush(): void {
  safe(() => sdk()?.registerForPush?.());
}

export function sendUpshotDeviceToken(token: string): void {
  safe(() => sdk()?.sendDeviceToken?.(token));
}

/** Hand a received FCM payload to Upshot so it can render/attribute it. */
export function forwardPushToUpshot(payload: Record<string, unknown>): void {
  safe(() => sdk()?.sendPushDataToUpshot?.(JSON.stringify(payload)));
}

export const getUpshotUnreadCount = () => query(sdk()?.getUnreadNotificationsCount?.bind(sdk()));
export const getUpshotNotifications = () => query(sdk()?.getNotificationList?.bind(sdk()));

export function showUpshotInbox(): void {
  safe(() => sdk()?.showInboxNotificationScreen?.());
}

/* ─────────────────── event catalogue (dev seeding) ─────────────────── */

/**
 * Every event the mobile app sends to Upshot, with representative attributes.
 *
 * Upshot can only build a campaign against an event it has already received,
 * so each has to be fired once before the messaging can be authored. Attribute
 * TYPES matter more than the values: Upshot infers a type from the first event
 * it sees, so sending `amount` as a string once makes it a string forever.
 *
 * Mirrors website-next/src/lib/upshotEvents.ts — keep the two in step.
 */
export const MOBILE_UPSHOT_EVENTS: Array<{ name: string; attributes: Record<string, unknown> }> = [
  { name: 'app_installed', attributes: { platform: PLATFORM, source: 'organic' } },
  { name: 'app_opened', attributes: { platform: PLATFORM } },
  { name: 'language_selected', attributes: { language: 'en', label: 'English' } },
  { name: 'otp_requested', attributes: { screen: 'mobile' } },
  { name: 'otp_verified', attributes: { priorInquiryCount: 1 } },
  { name: 'PAN Verified', attributes: { source: 'aurix', aadhaarLinked: true } },
  { name: 'eligibility_completed', attributes: { offerCount: 4 } },
  { name: 'Offers Got', attributes: { offerCount: 4, bestApr: 10.49 } },
  { name: 'offer_viewed', attributes: { offerCount: 4, bestApr: 10.49 } },
  { name: 'offer_selected', attributes: { apr: 10.49, amount: 500000, tenureMonths: 36, partner: 'Aditya Finance' } },
  { name: 'kyc_started', attributes: { method: 'aadhaar' } },
  { name: 'kyc_completed', attributes: { methods: 'aadhaar,pan,bank,selfie' } },
  { name: 'application_submitted', attributes: { amount: 500000, product: 'Personal Loan' } },
  { name: 'loan_approved', attributes: { amount: 500000, apr: 10.49 } },
  { name: 'loan_rejected', attributes: { reason: 'credit_policy' } },
  { name: 'loan_disbursed', attributes: { amount: 500000, partner: 'Aditya Finance' } },
  { name: 'call_completed', attributes: { answered: true, durationSec: 95, outcome: 'interested' } },
  // Drop-off nudges — the events campaigns are actually built against.
  { name: 'swiftloan_otp_not_verified', attributes: { stuckAt: 'otp_requested', expected: 'otp_verified', delayMinutes: 15, minutesStuck: 20 } },
  { name: 'swiftloan_install_not_registered', attributes: { stuckAt: 'app_installed', expected: 'otp_verified', delayMinutes: 30, minutesStuck: 45 } },
  { name: 'swiftloan_eligibility_incomplete', attributes: { stuckAt: 'otp_verified', expected: 'eligibility_completed', delayMinutes: 15, minutesStuck: 22 } },
  { name: 'swiftloan_offer_not_selected', attributes: { stuckAt: 'offer_viewed', expected: 'offer_selected', delayMinutes: 20, minutesStuck: 30 } },
  { name: 'swiftloan_kyc_incomplete', attributes: { stuckAt: 'kyc_started', expected: 'kyc_completed', delayMinutes: 15, minutesStuck: 25 } },
];

/**
 * Fire the whole catalogue so every event appears on the Upshot dashboard.
 *
 * Dev use only — call it once from a debug build, e.g. from the React Native
 * console: `require('./src/analytics/upshot').seedUpshotCatalogue()`.
 * Returns how many were queued (0 if the SDK is not running).
 */
export function seedUpshotCatalogue(): number {
  if (!started) {
    if (__DEV__) console.warn('[upshot] not initialised — nothing seeded');
    return 0;
  }
  MOBILE_UPSHOT_EVENTS.forEach((e, i) => {
    // Spread over time so the SDK batches rather than dropping.
    setTimeout(() => upshotEvent(e.name, { ...e.attributes, platform: PLATFORM, seeded: true }), i * 150);
  });
  if (__DEV__) console.log(`[upshot] seeding ${MOBILE_UPSHOT_EVENTS.length} events`);
  return MOBILE_UPSHOT_EVENTS.length;
}
