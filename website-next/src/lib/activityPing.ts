/**
 * The website tab tells the server "this visitor is here right now", so a visitor who verified their
 * phone and then walked away can be recognised after 5 quiet minutes and sent the app link
 * (server: lib/installReminder.ts). Fire-and-forget: it never blocks the page and never throws.
 *
 * Pings are sent: when the page loads or the route changes, on interaction (at most once a minute),
 * and when the tab is hidden or closed (the last ping is "when they left").
 */
import { apiBase } from './leads';
import { getAccessToken } from './session';

/** Interaction pings are throttled to this. */
export const MIN_PING_GAP_MS = 60_000;

/** Pure throttle: ping if we never have, or the gap has passed. `force` is for route changes and leaving. */
export function shouldPing(lastPingAt: number | null, now: number, force = false, gapMs: number = MIN_PING_GAP_MS): boolean {
  if (force || lastPingAt === null) return true;
  return now - lastPingAt >= gapMs;
}

let lastPingAt: number | null = null;

/** Send one ping if there is a signed-in visitor and the throttle allows. */
export function pingActivity(force = false): void {
  if (typeof window === 'undefined') return;
  const token = getAccessToken();
  if (!token) return;
  const now = Date.now();
  if (!shouldPing(lastPingAt, now, force)) return;
  lastPingAt = now;
  try {
    // keepalive lets the request finish while the tab is closing (sendBeacon cannot carry the auth header).
    fetch(`${apiBase()}/api/website/activity`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* a ping must never break the page */
  }
}
