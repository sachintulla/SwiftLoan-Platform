/**
 * Pure rules for the "stuck on a step" CALL (stallRules.ts placeStallCall): how long someone must have been stuck, how old a
 * drop-off may be, and the daily cap. Admin → Timings (`calls.stallMinStuckMinutes`, `calls.stallMaxStuckHours`, `calls.stallDailyLimit`).
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Midnight (India time) that starts the day `now` falls in, as a real instant. The daily cap counts from here. */
export function istDayStart(now: Date): Date {
  const local = now.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

/** `YYYY-MM-DD` of the India day `now` falls in (idempotency keys for once-a-day actions). */
export function istDateKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The wait before a call: the rule's own delay, but never less than the global minimum (a longer rule delay still wins). */
export function effectiveCallDelayMinutes(ruleDelayMinutes: number, minStuckMinutes: number): number {
  return Math.max(ruleDelayMinutes, minStuckMinutes);
}

/** True when today's cap is used up. A limit of 0 (or less) means no limit. */
export function dailyLimitReached(callsToday: number, limit: number): boolean {
  return limit > 0 && callsToday >= limit;
}
