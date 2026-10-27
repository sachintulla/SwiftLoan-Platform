/**
 * Pure helpers for the all-channels event editor (components/StageOutreach.tsx): converting
 * a delay between minutes and a friendly unit, and deciding whether one channel's settings
 * are safe to save. Kept apart from the component so they can be tested.
 */
export type Unit = 'min' | 'hr' | 'day';
export type DraftChannel = 'whatsapp' | 'sms' | 'email' | 'voice' | 'push';

export const UNIT_MIN: Record<Unit, number> = { min: 1, hr: 60, day: 1440 };
/** The longest wait or repeat window the server accepts (14 days). */
export const MAX_MINUTES = 20160;

/** 90 becomes 90 minutes, 120 becomes 2 hours, 2880 becomes 2 days: the largest unit that divides evenly. */
export function splitMinutes(m: number): { val: string; unit: Unit } {
  if (m > 0 && m % 1440 === 0) return { val: String(m / 1440), unit: 'day' };
  if (m > 0 && m % 60 === 0) return { val: String(m / 60), unit: 'hr' };
  return { val: String(m), unit: 'min' };
}

export const toMinutes = (val: string, unit: Unit) => Number(val) * UNIT_MIN[unit];

export interface ChDraft {
  enabled: boolean;
  /** The step the customer has not yet done; the notification is skipped once they do it. */
  expectedEvent: string;
  delayVal: string; delayUnit: Unit;
  coolVal: string; coolUnit: Unit;
  upshotEvent: string;
  waTemplate: string; waLanguage: string; waVars: string[];
  smsId: string; smsBody: string;
  role: string; assistantId: string; brief: string;
}

const validWindow = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_MINUTES;

/** What would be wrong if this channel were saved as it stands, in plain words. Null when fine. */
export function draftProblem(ch: DraftChannel, d: ChDraft, touched: boolean): string | null {
  if (!touched && !d.enabled) return null;
  if (!validWindow(toMinutes(d.delayVal, d.delayUnit))) return 'Set when it goes out, between 1 minute and 14 days.';
  if (!validWindow(toMinutes(d.coolVal, d.coolUnit))) return 'Set how long to wait before repeating, between 1 minute and 14 days.';
  if (d.enabled && ch === 'whatsapp' && !d.waTemplate.trim()) return 'Enter the approved WhatsApp template name before switching this on.';
  if (ch === 'sms' && (d.smsId.trim() === '') !== (d.smsBody.trim() === '')) return 'Enter both the DLT template ID and the exact registered text, or leave both empty to use the default.';
  if (d.enabled && (ch === 'email' || ch === 'push') && !d.upshotEvent.trim()) return 'Enter the Upshot event to fire before switching this on.';
  return null;
}
