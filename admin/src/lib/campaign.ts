'use client';

// Shared campaign helpers: timezone-aware datetime conversion, minute-of-day
// <-> "HH:mm" conversion for the daily calling window, and the plain-English
// summary sentence rendered by the builder and the detail page.

/**
 * Campaigns run on IST only — every operator and every customer is in India, so
 * a timezone picker was a way to get it wrong rather than a useful choice. The
 * server still stores `timezone` per campaign (and the scheduler honours it), so
 * this is a one-line change if that ever stops being true.
 */
export const CAMPAIGN_TIMEZONE = 'Asia/Kolkata';

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type RetryStrategy = 'once' | 'n_per_day' | 'every_n_days' | 'until_answered';
export type ScheduleType = 'one_time' | 'recurring';

export const RETRY_OPTIONS: { key: RetryStrategy; label: string; hint: string }[] = [
  { key: 'once', label: 'Once', hint: 'One attempt per customer.' },
  { key: 'n_per_day', label: 'N times per day', hint: 'Retry a fixed number of times each day.' },
  { key: 'every_n_days', label: 'Every N days', hint: 'Retry once every few days.' },
  { key: 'until_answered', label: 'Until answered', hint: 'Keep trying until they pick up or the attempt cap is hit.' },
];

export interface CampaignForm {
  name: string;
  code: string;
  note: string;
  startAt: string;   // "YYYY-MM-DDTHH:mm" wall-clock in `timezone`
  endAt: string;
  timezone: string;
  scheduleType: ScheduleType;
  dailyStart: string; // "HH:mm"
  dailyEnd: string;
  daysOfWeek: number[];
  retryStrategy: RetryStrategy;
  maxAttemptsPerContact: string;
  attemptsPerDay: string;
  retryIntervalDays: string;
  retryIntervalMinutes: string;
  stopOnAnswer: boolean;
  assistantId: string;
  assistantName: string;
  concurrency: string;
}

export const EMPTY_FORM: CampaignForm = {
  name: '', code: '', note: '',
  startAt: '', endAt: '', timezone: CAMPAIGN_TIMEZONE,
  scheduleType: 'one_time',
  dailyStart: '09:00', dailyEnd: '19:00',
  daysOfWeek: [],
  retryStrategy: 'once',
  maxAttemptsPerContact: '3', attemptsPerDay: '1',
  retryIntervalDays: '1', retryIntervalMinutes: '60',
  stopOnAnswer: true,
  assistantId: '', assistantName: '',
  concurrency: '1',
};

/* ---------- minute-of-day <-> HH:mm ---------- */

export function minutesToTime(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '';
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

export function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/* ---------- timezone-aware datetime ---------- */

// Offset (ms) of `tz` from UTC at the given instant.
function tzOffsetMs(utcMs: number, tz: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts: Record<string, number> = {};
    for (const p of dtf.formatToParts(new Date(utcMs))) {
      if (p.type !== 'literal') parts[p.type] = Number(p.value);
    }
    const asUtc = Date.UTC(parts.year, (parts.month || 1) - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    return asUtc - utcMs;
  } catch {
    return 0;
  }
}

// "YYYY-MM-DDTHH:mm" understood as wall-clock in `tz` -> ISO instant.
export function zonedToIso(local: string, tz: string): string | null {
  if (!local) return null;
  const ms = Date.parse(`${local.length === 16 ? local : local.slice(0, 16)}:00Z`);
  if (!Number.isFinite(ms)) return null;
  let utc = ms - tzOffsetMs(ms, tz);
  utc = ms - tzOffsetMs(utc, tz); // one refinement pass handles DST edges
  return new Date(utc).toISOString();
}

// ISO instant -> "YYYY-MM-DDTHH:mm" wall-clock in `tz` (for datetime-local inputs).
export function isoToZoned(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const shifted = new Date(ms + tzOffsetMs(ms, tz));
  return shifted.toISOString().slice(0, 16);
}

export function tzAbbrev(tz: string): string {
  // Intl renders Asia/Kolkata as "GMT+5:30", which nobody here calls it.
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'IST';
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date()).find((x) => x.type === 'timeZoneName');
    return p?.value || tz;
  } catch { return tz; }
}

export function zonedDateLabel(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(ms));
  } catch { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
}

function shortDate(iso: string, tz: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(ms));
  } catch { return iso.slice(0, 10); }
}

export function daysLabel(days: number[] | null | undefined): string {
  const d = (days ?? []).filter((n) => n >= 0 && n <= 6).sort((a, b) => a - b);
  if (d.length === 0 || d.length === 7) return 'every day';
  if (d.length === 5 && d.join() === '1,2,3,4,5') return 'Mon–Fri';
  if (d.length === 2 && d.join() === '0,6') return 'weekends';
  return d.map((n) => DAY_LABELS[n]).join(', ');
}

/* ---------- the live plain-English summary ---------- */

export interface SummaryInput {
  scheduleType: ScheduleType;
  dailyStartMinute?: number | null;
  dailyEndMinute?: number | null;
  daysOfWeek?: number[] | null;
  timezone: string;
  retryStrategy: RetryStrategy | string;
  maxAttemptsPerContact?: number | null;
  attemptsPerDay?: number | null;
  retryIntervalDays?: number | null;
  retryIntervalMinutes?: number | null;
  stopOnAnswer?: boolean;
  startAtIso?: string | null;
  endAtIso?: string | null;
}

export function summarise(s: SummaryInput): string {
  const tz = tzAbbrev(s.timezone);
  const cadence = (() => {
    switch (s.retryStrategy) {
      case 'n_per_day': return `up to ${s.attemptsPerDay || 1} time${Number(s.attemptsPerDay) === 1 ? '' : 's'} a day`;
      case 'every_n_days': return `once every ${s.retryIntervalDays || 1} day${Number(s.retryIntervalDays) === 1 ? '' : 's'}`;
      case 'until_answered': return `up to ${s.attemptsPerDay || 1} time${Number(s.attemptsPerDay) === 1 ? '' : 's'} a day`;
      default: return 'once';
    }
  })();

  const parts: string[] = [`Call each customer ${cadence}`];

  const gap = Number(s.retryIntervalMinutes);
  if (s.retryStrategy !== 'once' && gap > 0) parts.push(`at least ${gap} minutes apart`);

  const from = minutesToTime(s.dailyStartMinute ?? null);
  const to = minutesToTime(s.dailyEndMinute ?? null);
  if (from && to) {
    const wraps = (s.dailyEndMinute ?? 0) < (s.dailyStartMinute ?? 0);
    parts.push(`between ${from}–${to} ${tz}${wraps ? ' (overnight)' : ''}`);
  }
  parts.push(daysLabel(s.daysOfWeek));

  const cap = Number(s.maxAttemptsPerContact);
  const stop = s.stopOnAnswer !== false;
  if (stop && cap > 0) parts.push(`until they answer or ${cap} attempt${cap === 1 ? '' : 's'} are made`);
  else if (stop) parts.push('until they answer');
  else if (cap > 0) parts.push(`for up to ${cap} attempt${cap === 1 ? '' : 's'}`);

  let sentence = parts.join(', ');
  if (s.startAtIso && s.endAtIso) sentence += ` — from ${shortDate(s.startAtIso, s.timezone)} to ${shortDate(s.endAtIso, s.timezone)}`;
  else if (s.startAtIso) sentence += ` — from ${shortDate(s.startAtIso, s.timezone)}`;
  if (s.scheduleType === 'one_time') sentence += '. One-time campaign — contacts drop off after the window closes.';
  else sentence += '. Recurring campaign.';
  return sentence;
}

/* ---------- API shape ---------- */

export interface Campaign {
  id: string; name: string; code: string; status: string; note?: string | null;
  concurrency?: number | null;
  assistantId?: string | null; assistantName?: string | null;
  startAt?: string | null; endAt?: string | null;
  scheduleType?: string | null; timezone?: string | null;
  dailyStartMinute?: number | null; dailyEndMinute?: number | null;
  daysOfWeek?: number[] | null;
  retryStrategy?: string | null;
  maxAttemptsPerContact?: number | null;
  attemptsPerDay?: number | null;
  retryIntervalDays?: number | null;
  retryIntervalMinutes?: number | null;
  stopOnAnswer?: boolean | null;
  createdAt?: string;
  totalContacts?: number; calledContacts?: number; failedContacts?: number;
  nextRunAt?: string | null;
  /** Set once "Start dialling" has handed this campaign's contacts to Ello's own batch dialler. */
  providerCampaignId?: string | null;
  /** Soft-delete marker — present once an admin deletes the campaign. */
  deletedAt?: string | null;
}

export function campaignToForm(c: Campaign): CampaignForm {
  const tz = c.timezone || 'Asia/Kolkata';
  return {
    name: c.name ?? '',
    code: c.code ?? '',
    note: c.note ?? '',
    startAt: isoToZoned(c.startAt, tz),
    endAt: isoToZoned(c.endAt, tz),
    timezone: CAMPAIGN_TIMEZONE,
    scheduleType: (c.scheduleType === 'recurring' ? 'recurring' : 'one_time'),
    dailyStart: minutesToTime(c.dailyStartMinute ?? 540) || '09:00',
    dailyEnd: minutesToTime(c.dailyEndMinute ?? 1140) || '19:00',
    daysOfWeek: Array.isArray(c.daysOfWeek) ? c.daysOfWeek : [],
    retryStrategy: (['once', 'n_per_day', 'every_n_days', 'until_answered'].includes(String(c.retryStrategy))
      ? c.retryStrategy : 'once') as RetryStrategy,
    maxAttemptsPerContact: String(c.maxAttemptsPerContact ?? 3),
    attemptsPerDay: String(c.attemptsPerDay ?? 1),
    retryIntervalDays: String(c.retryIntervalDays ?? 1),
    retryIntervalMinutes: String(c.retryIntervalMinutes ?? 60),
    stopOnAnswer: c.stopOnAnswer !== false,
    assistantId: c.assistantId ?? '',
    assistantName: c.assistantName ?? '',
    concurrency: String(c.concurrency ?? 1),
  };
}

// Build the PATCH/POST body. Returns null-safe numbers and ISO datetimes.
export function formToPayload(f: CampaignForm): Record<string, unknown> {
  const n = (v: string, fallback: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.round(x) : fallback;
  };
  return {
    name: f.name.trim(),
    // Omitted entirely when blank so the server derives it from the name.
    // Sending '' would fail the server's min(1) rule.
    ...(f.code.trim() ? { code: f.code.trim() } : {}),
    note: f.note.trim() || null,
    startAt: zonedToIso(f.startAt, f.timezone),
    endAt: zonedToIso(f.endAt, f.timezone),
    scheduleType: f.scheduleType,
    timezone: CAMPAIGN_TIMEZONE,
    dailyStartMinute: timeToMinutes(f.dailyStart) ?? 540,
    dailyEndMinute: timeToMinutes(f.dailyEnd) ?? 1140,
    daysOfWeek: [...f.daysOfWeek].sort((a, b) => a - b),
    retryStrategy: f.retryStrategy,
    maxAttemptsPerContact: n(f.maxAttemptsPerContact, 1),
    attemptsPerDay: n(f.attemptsPerDay, 1),
    retryIntervalDays: n(f.retryIntervalDays, 1),
    retryIntervalMinutes: n(f.retryIntervalMinutes, 0),
    stopOnAnswer: f.stopOnAnswer,
    assistantId: f.assistantId.trim() || null,
    assistantName: f.assistantName.trim() || null,
    concurrency: Math.min(50, Math.max(1, n(f.concurrency, 1))),
  };
}

// Field-level validation. Returns a map of field -> message.
export function validate(f: CampaignForm): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!f.name.trim()) errs.name = 'Give the campaign a name';
  // `code` is no longer entered by hand — the server derives it from the name
  // and guarantees uniqueness. Only validate it when something set it anyway.
  if (f.code.trim() && !/^[a-zA-Z0-9._-]+$/.test(f.code.trim())) {
    errs.code = 'Use letters, numbers, dot, dash or underscore only';
  }

  if (f.startAt && f.endAt) {
    const a = zonedToIso(f.startAt, f.timezone);
    const b = zonedToIso(f.endAt, f.timezone);
    if (a && b && Date.parse(b) <= Date.parse(a)) errs.endAt = 'End must be after start';
  }
  if (timeToMinutes(f.dailyStart) == null) errs.dailyStart = 'Enter a valid time';
  if (timeToMinutes(f.dailyEnd) == null) errs.dailyEnd = 'Enter a valid time';

  const c = Number(f.concurrency);
  if (!Number.isFinite(c) || c < 1 || c > 50) errs.concurrency = 'Concurrency must be between 1 and 50';

  if (f.retryStrategy === 'n_per_day' || f.retryStrategy === 'until_answered') {
    if (Number(f.attemptsPerDay) < 1) errs.attemptsPerDay = 'At least 1';
  }
  if (f.retryStrategy === 'every_n_days' && Number(f.retryIntervalDays) < 1) {
    errs.retryIntervalDays = 'At least 1 day';
  }
  if (Number(f.maxAttemptsPerContact) < 1) errs.maxAttemptsPerContact = 'At least 1';
  return errs;
}
