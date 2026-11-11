/**
 * Firebase Analytics wrapper: mirrors the app's funnel events (the ones `upshotEvent` sends)
 * to Firebase by NAME ONLY. No parameters, ever: no amount, APR, lender, PAN, income or user data.
 *
 * Same contract as meta.ts: never throws, never blocks the UI, and no-ops when the native module
 * is missing (Jest, a stale build, iOS before Firebase is added). Hooked as one line inside
 * `upshotEvent`, so no screen is touched.
 *
 * Event names are the canonical lowercase snake_case ones (docs/UPSHOT_EVENTS.md); all are valid
 * Firebase names (<= 40 chars, none reserved). Firebase's own automatic events (first_open,
 * session_start, screen_view ...) are separate and come from the SDK itself.
 */

import { NativeModules } from 'react-native';

/** The only events ever sent: the app's client events. Anything else is ignored. */
export const FIREBASE_APP_EVENTS: ReadonlySet<string> = new Set([
  'app_opened',
  'language_selected',
  'otp_requested',
  'otp_verified',
  'pan_verified',
  'eligibility_completed',
  'offers_got',
  'offer_viewed',
  'offer_selected',
  'application_submitted',
  'loan_disbursed',
]);

type FirebaseNative = { logEvent: (name: string) => void };

/** Report one of our funnel events to Firebase Analytics. Name only. */
export function firebaseTrackFromAppEvent(name: string): void {
  if (!FIREBASE_APP_EVENTS.has(name)) return;
  try {
    const native = (NativeModules as { SwiftLoanFirebase?: FirebaseNative }).SwiftLoanFirebase;
    if (!native) return;
    if (__DEV__) console.log('[firebase] event ->', name);
    native.logEvent(name);
  } catch (e) {
    if (__DEV__) console.warn('[firebase]', e);
  }
}
