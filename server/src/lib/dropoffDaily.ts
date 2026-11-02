/**
 * Pure rules for the one WhatsApp journey (lib/appDropoff.ts): the daily-reminder rows that follow the first message, and what a
 * person coming back does to a run. Tested in dropoffDaily.test.ts.
 */
import type { ScheduleRow } from './timings.js';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/** The first `sendAtMinute` (India time) strictly after `after`. */
export function nextIstTime(after: Date, sendAtMinute: number): Date {
  const local = after.getTime() + IST_OFFSET_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  let t = dayStart + sendAtMinute * MIN_MS;
  if (t <= local) t += DAY_MS;
  return new Date(t - IST_OFFSET_MS);
}

/**
 * One WhatsApp row per day at `sendAtMinute` for `days` days, starting after the last of the first rows, all expressed as
 * minutes after `startAt` (the person's last action) so the ordinary schedule engine can run them unchanged.
 */
export function dailyRows(startAt: Date, firstRows: readonly ScheduleRow[], sendAtMinute: number, days: number): ScheduleRow[] {
  const lastFirst = firstRows.reduce((m, r) => Math.max(m, r.afterMinutes), 0);
  let at = new Date(startAt.getTime() + lastFirst * MIN_MS);
  const rows: ScheduleRow[] = [];
  for (let d = 0; d < Math.max(0, days); d++) {
    at = nextIstTime(at, sendAtMinute);
    rows.push({ channel: 'whatsapp', afterMinutes: Math.round((at.getTime() - startAt.getTime()) / MIN_MS) });
  }
  return rows;
}

export type ReturnVerdict = 'none' | 'not_idle' | 'reanchor' | 'returned';

/**
 * What a newer last action means for a run anchored at `startAt`:
 *   none      – no newer action, carry on
 *   not_idle  – they acted again and are still active (< idle): hold, do not message
 *   reanchor  – they acted again, nothing was sent yet, and they are idle again: the clock restarts from the new last action
 *   returned  – they acted after a message went out: the run ends (a new one starts if they stop again)
 */
export function returnVerdict(i: { startAt: Date; stepsSent: number; lastActivityAt: Date; now: Date; idleMs: number }): ReturnVerdict {
  if (i.lastActivityAt.getTime() <= i.startAt.getTime() + MIN_MS) return 'none'; // same action (allow a minute of clock skew)
  if (i.stepsSent > 0) return 'returned';
  return i.now.getTime() - i.lastActivityAt.getTime() >= i.idleMs ? 'reanchor' : 'not_idle';
}
