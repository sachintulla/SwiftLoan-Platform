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

import { NativeModules } from 'react-native';

const APP_ID: string | null = (globalThis as any).SWIFTLOAN_UPSHOT_APP_ID ?? "aa5b7c7f-0ec1-4888-9bd8-35c210f0e5fb";
const OWNER_ID: string | null = (globalThis as any).SWIFTLOAN_UPSHOT_OWNER_ID ?? "f3bf1d6f-5771-41f7-a6ff-640d3af4805e";

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
  createPageViewEvent?: (screen: string) => void;
  createCustomEvent?: (name: string, payload: string, isTimed: boolean) => void;
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
    s.setDispatchInterval?.(60); // documented range 10–120s
    started = true;
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[upshot] init failed', e);
    return false;
  }
}

/* ─────────────────────────── events ─────────────────────────── */

export function upshotScreen(screen: string): void {
  safe(() => sdk()?.createPageViewEvent?.(screen));
}

export function upshotEvent(name: string, attrs: Record<string, unknown> = {}): void {
  safe(() => sdk()?.createCustomEvent?.(name, JSON.stringify(attrs), false));
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
  safe(() =>
    sdk()?.setUserProfile?.(
      JSON.stringify({
        appuid: user.userId,
        Name: user.name ?? undefined,
        Email: user.email ?? undefined,
        Phone: phone,
        City: user.city ?? undefined,
        Country: 'India',
        Platform: 'Android',
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
  { name: 'app_installed', attributes: { platform: 'Android', source: 'organic' } },
  { name: 'app_opened', attributes: { platform: 'Android' } },
  { name: 'language_selected', attributes: { language: 'en', label: 'English' } },
  { name: 'otp_requested', attributes: { screen: 'mobile' } },
  { name: 'otp_verified', attributes: { priorInquiryCount: 1 } },
  { name: 'eligibility_completed', attributes: { offerCount: 4 } },
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
    setTimeout(() => upshotEvent(e.name, { ...e.attributes, platform: 'Android', seeded: true }), i * 150);
  });
  if (__DEV__) console.log(`[upshot] seeding ${MOBILE_UPSHOT_EVENTS.length} events`);
  return MOBILE_UPSHOT_EVENTS.length;
}
