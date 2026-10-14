// Hides the outbound-nudge surfaces (Notification Rules, "Send nudge", nudge
// stats). Mirrors the server's NUDGES_DISABLED switch; off unless set.
export const NUDGES_DISABLED = /^(1|true|yes)$/i.test(process.env.NEXT_PUBLIC_NUDGES_DISABLED ?? '');

const NUDGE_EVENTS = new Set(['nudge_sent', 'stage_stalled']);
/** Drops nudge-system events from a timeline when nudges are disabled. */
export function withoutNudgeEvents<T>(events: T[], name: (e: T) => string | undefined): T[] {
  return NUDGES_DISABLED ? events.filter((e) => !NUDGE_EVENTS.has(name(e) ?? '')) : events;
}
