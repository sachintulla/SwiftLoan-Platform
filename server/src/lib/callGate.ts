/**
 * Shared gate for automatic outbound calls (drop-off / stuck-stage nudges and
 * the daily status call). Two controls, both live in Admin → Timings:
 *
 *   calls.nudgeEnabled    — master switch. Off (default) = nothing is dialled.
 *   calls.allowedNumbers  — test allowlist. When non-empty, ONLY these numbers
 *                           are called; everyone else is skipped. Empty = all
 *                           eligible customers.
 *   calls.statusDailyEnabled — the daily status call (also gated by the two above).
 *
 * This is deliberately separate from a rule being `enabled`: a rule can be on
 * while the master switch is off, so enabling voice rules never dials anyone
 * until someone explicitly flips the switch (and, while testing, only the
 * allow-listed numbers ring).
 */
import { timing } from './timings.js';

export const callNudgesEnabled = (): boolean => timing.bool('calls.nudgeEnabled');
export const statusCallsEnabled = (): boolean => timing.bool('calls.statusDailyEnabled');

/** Bare 10-digit form of an Indian number, for allowlist comparison. */
function bare(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

/**
 * Test-number allowlist, applied to EVERY outbound call path (including the
 * existing website lead-callback and immediate-callback diallers).
 *
 * Empty list → returns true for everyone, so this is a no-op in production and
 * changes none of the existing behaviour. Non-empty → ONLY those numbers may be
 * called, which is how a dev/staging box is pinned to a couple of test phones
 * without touching any other logic.
 */
export function withinTestAllowlist(phone: string | null | undefined): boolean {
  const allow = timing.phones('calls.allowedNumbers');
  if (!allow.length) return true;
  if (!phone) return false;
  const b = bare(phone);
  return allow.some((a) => bare(a) === b);
}

/**
 * Is this number allowed for a NEW automatic nudge/status call?
 * - master switch (calls.nudgeEnabled) must be on — off by default; and
 * - it must pass the test-number allowlist.
 */
export function isCallAllowed(phone: string | null | undefined): boolean {
  if (!phone) return false;
  if (!callNudgesEnabled()) return false;
  return withinTestAllowlist(phone);
}
