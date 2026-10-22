/**
 * The registry of every timing and limit an admin can change (Admin → Timings), and how the server reads them.
 *
 * Precedence for one setting: an admin override saved in the database → the environment variable that used to
 * control it → the built-in default. So nothing changes until someone edits a value, and a deployment that already
 * set an env var keeps working exactly as before.
 *
 * Reads are synchronous and served from an in-memory copy (timingsStore.ts refreshes it from the database every
 * 30 s and right after a save), because many callers need the value inside loops or at import time. Read these
 * settings ONLY through `timing.*` — never `process.env` — or the admin page would silently stop controlling them.
 *
 * This file is pure (no database, no network) so the rules are unit-tested: timings.test.ts.
 */

export type TimingGroup = 'install' | 'hours' | 'calls' | 'auth' | 'tracking' | 'website';
export type TimingUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'count' | 'minuteOfDay' | 'none';

export interface ScheduleRow {
  channel: 'sms' | 'whatsapp';
  /** Minutes after the visitor dropped off. */
  afterMinutes: number;
}

interface Base {
  key: string;
  group: TimingGroup;
  label: string;
  help: string;
  /** The environment variable that controlled this before the admin page existed (still honoured as the fallback). */
  env?: string;
  /** Shown as a warning in the admin next to the field. */
  warn?: string;
}
export interface NumberDef extends Base {
  kind: 'number';
  unit: Exclude<TimingUnit, 'minuteOfDay' | 'none'>;
  def: number;
  min: number;
  max: number;
  /** Turns the raw env text into this setting's unit (default: Number(raw)). */
  fromEnv?: (raw: string) => number | undefined;
}
export interface MinuteOfDayDef extends Base {
  kind: 'minuteOfDay';
  unit: 'minuteOfDay';
  def: number;
  min: 0;
  max: 1439;
}
export interface BoolDef extends Base {
  kind: 'boolean';
  unit: 'none';
  def: boolean;
}
export interface ScheduleDef extends Base {
  kind: 'schedule';
  unit: 'minutes';
  def: ScheduleRow[];
  maxRows: number;
  maxMinutes: number;
}
export interface PhonesDef extends Base {
  kind: 'phones';
  unit: 'none';
  def: string[];
  maxItems: number;
}
export type TimingDef = NumberDef | MinuteOfDayDef | BoolDef | ScheduleDef | PhonesDef;
export type TimingValue = number | boolean | ScheduleRow[] | string[];

/** SMS, then WhatsApp 30 minutes later, at the drop-off, +4 h, +8 h, then every day for a week. */
const DEFAULT_OFFSETS_MIN = [0, 4 * 60, 8 * 60, 24 * 60, 48 * 60, 72 * 60, 96 * 60, 120 * 60, 144 * 60, 168 * 60];
export const DEFAULT_SCHEDULE: readonly ScheduleRow[] = Object.freeze(
  DEFAULT_OFFSETS_MIN.flatMap((m): ScheduleRow[] => [
    { channel: 'sms', afterMinutes: m },
    { channel: 'whatsapp', afterMinutes: m + 30 },
  ]),
);

/** "900" or "15m" / "2h" / "7d" → minutes (the env format ACCESS_TTL has always used: seconds or a suffixed duration). */
function ttlToMinutes(raw: string): number | undefined {
  const m = raw.trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const seconds = unit === 's' ? n : unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : n * 86_400;
  return Math.max(1, Math.round(seconds / 60));
}

export const TIMINGS: readonly TimingDef[] = [
  /* ───────────── A. Website drop-off → install reminders ───────────── */
  {
    key: 'install.sendEnabled', group: 'install', kind: 'boolean', unit: 'none', def: false, env: 'INSTALL_REMINDER_SEND',
    label: 'Send the reminders for real',
    help: 'Off: the job only writes what it would send to the server log. On: real SMS and WhatsApp messages go out.',
    warn: 'Turning this on messages every website visitor who drops off, unless the test-number list below is filled in.',
  },
  {
    key: 'install.allowedNumbers', group: 'install', kind: 'phones', unit: 'none', def: [], maxItems: 200,
    label: 'Only these numbers (test list)',
    help: 'When this list has any numbers, ONLY they receive reminders. Leave it empty to send to everyone.',
  },
  {
    key: 'install.idleMinutes', group: 'install', kind: 'number', unit: 'minutes', def: 5, min: 1, max: 120,
    label: 'Counts as dropped off after',
    help: 'How long a visitor must be inactive on the website before the reminder schedule starts.',
  },
  {
    key: 'install.schedule', group: 'install', kind: 'schedule', unit: 'minutes', def: DEFAULT_SCHEDULE.map((r) => ({ ...r })), maxRows: 40, maxMinutes: 30 * 1440,
    label: 'Message schedule',
    help: 'Each message is one SMS or WhatsApp, sent a set time after the visitor leaves the website. Use Edit schedule to change, add or remove messages.',
  },
  {
    key: 'install.minGapMinutes', group: 'install', kind: 'number', unit: 'minutes', def: 30, min: 0, max: 1440,
    label: 'Minimum gap between two messages',
    help: 'Never send two reminders to the same person closer together than this, even if both are due.',
  },
  {
    key: 'install.maxLateHours', group: 'install', kind: 'number', unit: 'hours', def: 14, min: 1, max: 168,
    label: 'Skip a message that is this late',
    help: 'A step that could not go out on time (for example overnight quiet hours or an outage) is skipped, not sent, after this long.',
  },
  {
    key: 'install.maxCycles', group: 'install', kind: 'number', unit: 'count', def: 3, min: 1, max: 10,
    label: 'Maximum runs per visitor',
    help: 'A visitor who keeps coming back and leaving restarts the schedule; this caps how many times.',
  },
  {
    key: 'install.recheckMinutes', group: 'install', kind: 'number', unit: 'minutes', def: 15, min: 1, max: 240,
    label: 'Re-check a held message after',
    help: 'How soon to look again at a message that is due but held back (for example outside calling hours).',
  },
  {
    key: 'install.jobEveryMinutes', group: 'install', kind: 'number', unit: 'minutes', def: 1, min: 1, max: 60,
    label: 'Reminder job runs every',
    help: 'How often the server checks for reminders that are due. Larger = less load, but messages can be up to this late.',
  },
  {
    key: 'install.resumeMaxAgeDays', group: 'install', kind: 'number', unit: 'days', def: 14, min: 1, max: 90, env: 'JOURNEY_RESUME_MAX_AGE_DAYS',
    label: 'A saved website visit can resume for',
    help: 'After this many days the app no longer offers to continue where the visitor left off.',
  },
  {
    key: 'website.pingEverySeconds', group: 'website', kind: 'number', unit: 'seconds', def: 60, min: 15, max: 900,
    label: 'Website "still here" signal every',
    help: 'How often the open website tells us the visitor is still active. Must be well under the idle time above.',
  },
  {
    key: 'calling.windowStart', group: 'hours', kind: 'minuteOfDay', unit: 'minuteOfDay', def: 540, min: 0, max: 1439, env: 'LEAD_CALL_WINDOW_START',
    label: 'Calling hours start',
    help: 'Reminders, nudges and calls go out only between the start and end time (India time). Shared by every automatic message and call.',
    warn: 'Telecom rules limit promotional calls and messages to 9am–9pm.',
  },
  {
    key: 'calling.windowEnd', group: 'hours', kind: 'minuteOfDay', unit: 'minuteOfDay', def: 1260, min: 0, max: 1439, env: 'LEAD_CALL_WINDOW_END',
    label: 'Calling hours end',
    help: 'See "Calling hours start". Set start 00:00 and end 23:59 to turn the window off.',
  },

  /* ───────────── C. Website lead → automatic call ───────────── */
  {
    key: 'calls.firstDelaySeconds', group: 'calls', kind: 'number', unit: 'seconds', def: 20, min: 0, max: 600, env: 'IMMEDIATE_CALLBACK_DELAY_SECONDS',
    label: 'First call after the person says yes',
    help: 'How long after a website lead agrees to a call before the first attempt.',
  },
  {
    key: 'calls.retryMinutes', group: 'calls', kind: 'number', unit: 'minutes', def: 60, min: 5, max: 1440, env: 'IMMEDIATE_CALLBACK_RETRY_MINUTES',
    label: 'Retry when a call does not connect',
    help: 'Wait between attempts when the person does not pick up.',
  },
  {
    key: 'calls.maxAttempts', group: 'calls', kind: 'number', unit: 'count', def: 3, min: 1, max: 10, env: 'IMMEDIATE_CALLBACK_MAX_ATTEMPTS',
    label: 'Maximum attempts per lead',
    help: 'The first try plus the retries, before giving up.',
  },
  {
    key: 'calls.declineFollowupMinutes', group: 'calls', kind: 'number', unit: 'minutes', def: 60, min: 5, max: 1440, env: 'LEAD_CALL_DECLINE_DELAY_MINUTES',
    label: 'Follow-up after a declined call',
    help: 'How long to wait before the next try when someone said no or did not answer the first question.',
  },
  {
    key: 'calls.maxPerHour', group: 'calls', kind: 'number', unit: 'count', def: 60, min: 1, max: 600, env: 'LEAD_CALL_MAX_PER_HOUR',
    label: 'Maximum calls per hour (spend limit)',
    help: 'A safety ceiling across all automatic calls. Reaching it holds new calls and raises an alert.',
    warn: 'Every call costs money; raise this carefully.',
  },
  {
    key: 'calls.perScan', group: 'calls', kind: 'number', unit: 'count', def: 25, min: 1, max: 200,
    label: 'Calls started per minute at most',
    help: 'Stops one bad batch from dialling a whole table at once.',
  },

  /* ───────────── E. Login and sessions ───────────── */
  {
    key: 'auth.otpValidityMinutes', group: 'auth', kind: 'number', unit: 'minutes', def: 5, min: 1, max: 15,
    label: 'OTP is valid for',
    help: 'How long a one-time code works after it is sent.',
    warn: 'The OTP text message tells people a validity time; keep the two in step.',
  },
  {
    key: 'auth.otpResendWindowMinutes', group: 'auth', kind: 'number', unit: 'minutes', def: 10, min: 1, max: 60,
    label: 'OTP resend counting window',
    help: 'The window in which repeated OTP requests for one number are counted.',
  },
  {
    key: 'auth.accessTokenMinutes', group: 'auth', kind: 'number', unit: 'minutes', def: 15, min: 5, max: 120, env: 'ACCESS_TTL', fromEnv: ttlToMinutes,
    label: 'App login: access token lasts',
    help: 'Short-lived token; the app renews it quietly. Applies to new logins and renewals.',
    warn: 'Security setting. Longer means a stolen token works for longer.',
  },
  {
    key: 'auth.refreshTokenDays', group: 'auth', kind: 'number', unit: 'days', def: 30, min: 1, max: 90, env: 'REFRESH_TTL_DAYS',
    label: 'App login: stay signed in for',
    help: 'How long a user stays signed in on the phone without logging in again. Applies to new logins.',
  },
  {
    key: 'auth.websiteSessionMinutes', group: 'auth', kind: 'number', unit: 'minutes', def: 120, min: 15, max: 1440,
    label: 'Website login lasts',
    help: 'How long a website visitor stays signed in while active.',
  },
  {
    key: 'auth.adminIdleMinutes', group: 'auth', kind: 'number', unit: 'minutes', def: 30, min: 5, max: 240, env: 'ADMIN_IDLE_TIMEOUT_MINUTES',
    label: 'Admin signs out after being idle',
    help: 'Admins are logged out after this long without any activity.',
  },

  /* ───────────── F. Tracking and limits ───────────── */
  {
    key: 'tracking.clickTtlHours', group: 'tracking', kind: 'number', unit: 'hours', def: 48, min: 1, max: 168, env: 'ATTRIBUTION_CLICK_TTL_HOURS',
    label: 'An install link click can be claimed for',
    help: 'After this long a tapped link can no longer be matched to an install.',
  },
  {
    key: 'tracking.ipWindowMinutes', group: 'tracking', kind: 'number', unit: 'minutes', def: 30, min: 5, max: 240, env: 'ATTRIBUTION_WINDOW_MIN',
    label: 'Match an install to a click on the same network within',
    help: 'Used for installs that carry no exact link code (for example a downloaded APK).',
  },
  {
    key: 'offers.reuseHours', group: 'tracking', kind: 'number', unit: 'hours', def: 24, min: 1, max: 168, env: 'OFFERS_REUSE_HOURS',
    label: 'Reuse saved offers for',
    help: 'Offers are not fetched again from the lender within this time if the applicant\'s details did not change.',
  },
  {
    key: 'pan.dailyLimit', group: 'tracking', kind: 'number', unit: 'count', def: 5, min: 1, max: 50, env: 'PAN_DAILY_LIMIT',
    label: 'PAN checks per person per day',
    help: 'Each check is a paid lender call; this stops one person from running many.',
    warn: 'Every check costs money.',
  },
  {
    key: 'referral.eligibleDays', group: 'tracking', kind: 'number', unit: 'days', def: 7, min: 1, max: 90, env: 'REFERRAL_ELIGIBLE_DAYS',
    label: 'A new account can be referred for',
    help: 'A friend referral only counts if the new account is younger than this.',
  },
];

const BY_KEY = new Map(TIMINGS.map((d) => [d.key, d]));

export function defOf(key: string): TimingDef {
  const d = BY_KEY.get(key);
  if (!d) throw new Error(`unknown timing key "${key}"`);
  return d;
}
export const isTimingKey = (key: string) => BY_KEY.has(key);

/* ───────────────────────────── validation ───────────────────────────── */

export type Checked = { ok: true; value: TimingValue } | { ok: false; error: string };
const bad = (error: string): Checked => ({ ok: false, error });

const MOBILE = /^[6-9]\d{9}$/;

/** Check an admin-supplied value against its definition. Returns the cleaned value to store. */
export function checkTiming(def: TimingDef, raw: unknown): Checked {
  switch (def.kind) {
    case 'number':
    case 'minuteOfDay': {
      if (raw === '' || raw === null || raw === undefined || typeof raw === 'boolean') return bad('Enter a number');
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) return bad('Enter a whole number');
      if (n < def.min || n > def.max) return bad(`Must be between ${def.min} and ${def.max}`);
      return { ok: true, value: n };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (raw === 'true' || raw === 'false') return { ok: true, value: raw === 'true' };
      return bad('Must be on or off');
    }
    case 'phones': {
      if (!Array.isArray(raw)) return bad('Must be a list of mobile numbers');
      const out: string[] = [];
      for (const item of raw) {
        const digits = String(item ?? '').replace(/\D/g, '');
        const n = digits.length >= 10 ? digits.slice(-10) : digits;
        if (!MOBILE.test(n)) return bad(`"${String(item)}" is not a 10-digit mobile number`);
        if (!out.includes(n)) out.push(n);
      }
      if (out.length > def.maxItems) return bad(`At most ${def.maxItems} numbers`);
      return { ok: true, value: out };
    }
    case 'schedule': {
      if (!Array.isArray(raw)) return bad('Must be a list of messages');
      if (raw.length < 1) return bad('Add at least one message');
      if (raw.length > def.maxRows) return bad(`At most ${def.maxRows} messages`);
      const rows: ScheduleRow[] = [];
      let prev = -1;
      for (let i = 0; i < raw.length; i++) {
        const r = raw[i] as Partial<ScheduleRow> | null;
        const n = Number(r?.afterMinutes);
        if (r?.channel !== 'sms' && r?.channel !== 'whatsapp') return bad(`Row ${i + 1}: channel must be SMS or WhatsApp`);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return bad(`Row ${i + 1}: enter whole minutes (0 or more)`);
        if (n > def.maxMinutes) return bad(`Row ${i + 1}: at most ${def.maxMinutes} minutes (${def.maxMinutes / 1440} days)`);
        if (n < prev) return bad(`Row ${i + 1}: must not be earlier than the row above`);
        prev = n;
        rows.push({ channel: r.channel, afterMinutes: n });
      }
      return { ok: true, value: rows };
    }
  }
}

/* ───────────────────────────── resolution ───────────────────────────── */

let overrides: ReadonlyMap<string, unknown> = new Map();

/** The saved admin overrides (timingsStore.ts replaces this from the database). */
export function setOverrides(next: ReadonlyMap<string, unknown>) {
  overrides = next;
}
export function getOverrides(): ReadonlyMap<string, unknown> {
  return overrides;
}

function envValue(def: TimingDef): TimingValue | undefined {
  if (!def.env) return undefined;
  const raw = process.env[def.env];
  if (raw == null || raw.trim() === '') return undefined;
  if (def.kind === 'boolean') return /^(1|true|yes)$/i.test(raw.trim());
  if (def.kind === 'number') {
    const n = def.fromEnv ? def.fromEnv(raw) : Number(raw);
    return n !== undefined && Number.isFinite(n) ? n : undefined;
  }
  if (def.kind === 'minuteOfDay') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1439 ? n : undefined;
  }
  return undefined;
}

export type Source = 'override' | 'env' | 'default';

export function sourceOf(def: TimingDef): Source {
  if (overrides.has(def.key)) return 'override';
  return envValue(def) !== undefined ? 'env' : 'default';
}

export function effective(def: TimingDef): TimingValue {
  if (overrides.has(def.key)) return overrides.get(def.key) as TimingValue;
  const e = envValue(def);
  return e !== undefined ? e : def.def;
}

function typed<T extends TimingValue>(key: string, kind: TimingDef['kind'][]): T {
  const d = defOf(key);
  if (!kind.includes(d.kind)) throw new Error(`timing "${key}" is a ${d.kind}, not ${kind.join('/')}`);
  return effective(d) as T;
}

/** Synchronous, cached reads. These are the only way server code should read a setting that is on the Timings page. */
export const timing = {
  num: (key: string) => typed<number>(key, ['number', 'minuteOfDay']),
  bool: (key: string) => typed<boolean>(key, ['boolean']),
  schedule: (key: string) => typed<ScheduleRow[]>(key, ['schedule']),
  phones: (key: string) => typed<string[]>(key, ['phones']),
  /** Minutes → milliseconds, for the many callers that think in ms. */
  minutesMs: (key: string) => typed<number>(key, ['number']) * 60_000,
  hoursMs: (key: string) => typed<number>(key, ['number']) * 3_600_000,
  daysMs: (key: string) => typed<number>(key, ['number']) * 86_400_000,
  secondsMs: (key: string) => typed<number>(key, ['number']) * 1_000,
};

/** Everything the admin page needs for one setting. */
export function describeTiming(def: TimingDef) {
  const plain: Record<string, unknown> = { ...def };
  delete plain.fromEnv; // a function: not part of what the admin page needs
  return { ...(plain as unknown as TimingDef), effective: effective(def), source: sourceOf(def) };
}
