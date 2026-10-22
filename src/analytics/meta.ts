/**
 * Meta (Facebook) SDK wrapper for the mobile app — app-install attribution and two
 * coarse conversion events for Meta ad campaigns.
 *
 * Same contract as the Upshot wrapper: nothing here throws, blocks the UI or changes
 * what a screen renders, and every call no-ops until the native module is present AND
 * a client token is configured. The module is resolved with an optional require so a
 * build without it (Jest, a stale dev client) is a no-op instead of a red-screen.
 *
 * What is deliberately NOT done (a lending app; keep it this way):
 *  - NO advertising ID. Android: the manifest strips AD_ID and sets
 *    `AdvertiserIDCollectionEnabled=false`. iOS: no ATT prompt, advertiser tracking stays
 *    off, so Meta attributes installs through SKAdNetwork / the Play Install Referrer only.
 *  - NO auto-init. Native auto-init is switched off in AndroidManifest / Info.plist; the
 *    SDK starts only from `initMeta()` below, after the app and token are set.
 *  - NO parameters on events: no amount, PAN, income, lender, loan status or user data.
 *    Meta's restricted-data policy forbids financial details; this sends the moment only.
 *    (`LoanDisbursed` is the one event whose very name is financial status — it was added at the
 *    owner's request; remove it from META_APP_EVENT_FOR if compliance objects.)
 *  - NO login / share / graph calls — only `AppEventsLogger.logEvent`.
 */

import { NativeModules } from 'react-native';
import { UPSHOT_DEMO } from '../config/build';

/** Public client identifiers (ship inside the app, like the Upshot ids) — Meta app "Swiftloan". */
export const META_APP_ID = '1669156655221818';
/** App settings -> Advanced -> Client token. Empty = Meta stays off. Override: globalThis.SWIFTLOAN_META_CLIENT_TOKEN. */
const META_CLIENT_TOKEN: string = ((globalThis as any).SWIFTLOAN_META_CLIENT_TOKEN ?? '').trim();

/** Debug/demo builds talk to the dev backend; keep their traffic out of the real ad data unless asked. */
const ALLOW_DEMO: boolean = (globalThis as any).SWIFTLOAN_META_ALLOW_DEMO === true;

/** Our (Upshot-shared) funnel event names -> the Meta events they count as. Nothing else is ever sent. */
export const META_APP_EVENT_FOR: Record<string, string> = {
  otp_verified: 'fb_mobile_complete_registration', // AppEvents.CompletedRegistration
  pan_verified: 'IdentityVerified', // custom: identity step passed (the PAN itself is never sent)
  eligibility_completed: 'EligibilityCompleted', // custom: offers lookup finished
  offers_got: 'OffersReceived', // custom: at least one offer came back
  offer_viewed: 'fb_mobile_content_view', // AppEvents.ViewedContent: the offers page
  offer_selected: 'fb_mobile_initiated_checkout', // AppEvents.InitiatedCheckout: chose an offer to apply
  application_submitted: 'SubmitApplication', // AppEvents.SubmitApplication
  loan_disbursed: 'LoanDisbursed', // custom, app only: NO amount, lender or status detail
};

/** Funnel steps that can fire many times (re-fetches, revisits): reported once per app launch. */
const ONCE_PER_LAUNCH = new Set(['pan_verified', 'eligibility_completed', 'offers_got', 'offer_viewed', 'loan_disbursed']);
const reported = new Set<string>();

type FbNative = {
  Settings: {
    setAppID: (id: string) => void;
    setClientToken: (token: string) => void;
    setAutoLogAppEventsEnabled: (enabled: boolean) => void;
    setAdvertiserIDCollectionEnabled: (enabled: boolean) => void;
    setAdvertiserTrackingEnabled: (enabled: boolean) => Promise<boolean>;
    initializeSDK: () => void;
  };
  AppEventsLogger: {
    logEvent: (name: string, params?: Record<string, string | number>) => void;
  };
};

let native: FbNative | null = null;
let resolved = false;

function sdk(): FbNative | null {
  if (resolved) return native;
  resolved = true;
  // react-native-fbsdk-next reads NativeModules.FBSettings at import time; skip the require
  // entirely when the module isn't linked.
  if (!(NativeModules as { FBSettings?: unknown })?.FBSettings) return null;
  try {
    native = require('react-native-fbsdk-next') as FbNative;
  } catch {
    native = null;
  }
  return native;
}

function devLog(...args: unknown[]): void {
  if (__DEV__) console.log('[meta]', ...args);
}

export const META_CONFIGURED: boolean = !!META_CLIENT_TOKEN && (!UPSHOT_DEMO || ALLOW_DEMO);
let started = false;

/** True once init has completed; useful for dev diagnostics. */
export function isMetaReady(): boolean {
  return started;
}

/** Boot the SDK. Idempotent; returns whether Meta is running. */
export function initMeta(): boolean {
  if (started) return true;
  if (!META_CONFIGURED) {
    devLog('disabled (no client token, or a demo build without SWIFTLOAN_META_ALLOW_DEMO)');
    return false;
  }
  const s = sdk();
  if (!s) {
    devLog('react-native-fbsdk-next is not linked');
    return false;
  }
  try {
    s.Settings.setAppID(META_APP_ID);
    s.Settings.setClientToken(META_CLIENT_TOKEN);
    // Belt and braces with the native config: never the advertising ID, never ATT-gated tracking.
    s.Settings.setAdvertiserIDCollectionEnabled(false);
    s.Settings.setAdvertiserTrackingEnabled(false).catch(() => undefined);
    // Auto events = install / app activation only (what ad attribution needs); no manual param logging.
    s.Settings.setAutoLogAppEventsEnabled(true);
    s.Settings.initializeSDK();
    started = true;
    devLog('initialised', { demo: UPSHOT_DEMO });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[meta] init failed', e);
    return false;
  }
}

/** Report one of our funnel events to Meta if it is one of the few that count. No attributes, ever. */
export function metaTrackFromAppEvent(name: string): void {
  const metaName = META_APP_EVENT_FOR[name];
  if (!metaName || !started) return;
  if (ONCE_PER_LAUNCH.has(name)) {
    if (reported.has(name)) return;
    reported.add(name);
  }
  try {
    devLog('event ->', metaName);
    sdk()?.AppEventsLogger.logEvent(metaName);
  } catch (e) {
    if (__DEV__) console.warn('[meta]', e);
  }
}
