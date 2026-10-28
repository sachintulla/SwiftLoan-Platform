/**
 * When the website asks a visitor for notification permission (web push).
 *
 * Two moments, both at the phone-number / OTP gate: `before_otp` (the "Send OTP" tap) and `after_otp` (the code
 * was accepted). The browser shows its prompt only while the permission is still "default", so the second ask
 * matters only to a visitor who dismissed the first one without choosing; Allow / Block are never asked twice.
 * Off unless `NEXT_PUBLIC_UPSHOT_WEB_PUSH=true`. Fire-and-forget: nothing here throws or blocks the page.
 */

import { UPSHOT_WEB_PUSH_ENABLED } from '@/config/upshot';
import { upshotSubscribePush } from '@/lib/upshot';

export type WebPushMoment = 'before_otp' | 'after_otp';

export interface WebPushEnv {
  enabled: boolean;
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
}

/** Pure decision, so it can be tested without a browser. `askedThisMoment` = this moment already ran on this page load. */
export function shouldSubscribe(env: WebPushEnv, askedThisMoment: boolean, subscribedThisPage: boolean): boolean {
  if (!env.enabled || !env.supported || askedThisMoment) return false;
  if (env.permission === 'denied' || env.permission === 'unsupported') return false;
  // Already allowed: one call per page load keeps the token fresh; more would only repeat it.
  if (env.permission === 'granted') return !subscribedThisPage;
  return true;
}

const asked = new Set<WebPushMoment>();
let subscribedThisPage = false;

export function readWebPushEnv(): WebPushEnv {
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
  return {
    enabled: UPSHOT_WEB_PUSH_ENABLED,
    supported,
    permission: supported ? Notification.permission : 'unsupported',
  };
}

export function askForWebPush(moment: WebPushMoment): void {
  try {
    const ok = shouldSubscribe(readWebPushEnv(), asked.has(moment), subscribedThisPage);
    asked.add(moment);
    if (!ok) return;
    subscribedThisPage = true;
    upshotSubscribePush();
  } catch {
    /* never let a push prompt break the OTP flow */
  }
}

/** Test seam. */
export function __resetWebPushForTests(): void {
  asked.clear();
  subscribedThisPage = false;
}
