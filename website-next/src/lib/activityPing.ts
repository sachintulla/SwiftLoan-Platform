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

/** Interaction pings are throttled to this until the server says otherwise (Admin → Timings, "still here" signal). */
export const MIN_PING_GAP_MS = 60_000;
const FLOOR_MS = 15_000;
const CEILING_MS = 900_000;
let gapMs: number = MIN_PING_GAP_MS;

/** Adopt the interval the server asked for. Anything that is not a sensible number is ignored. */
export function setPingGapFromServer(seconds: unknown): void {
  const n = typeof seconds === 'number' ? seconds * 1000 : NaN;
  if (Number.isFinite(n) && n >= FLOOR_MS && n <= CEILING_MS) gapMs = Math.round(n);
}
export const currentPingGapMs = (): number => gapMs;
/** Test hook. */
export function resetPingGap(): void { gapMs = MIN_PING_GAP_MS; }

/** Pure throttle: ping if we never have, or the gap has passed. `force` is for route changes and leaving. */
export function shouldPing(lastPingAt: number | null, now: number, force = false, gap: number = gapMs): boolean {
  if (force || lastPingAt === null) return true;
  return now - lastPingAt >= gap;
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
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setPingGapFromServer(body?.data?.pingEverySeconds))
      .catch(() => {});
  } catch {
    /* a ping must never break the page */
  }
}
