import { describe, it, expect, afterEach } from 'vitest';
import { TIMINGS, DEFAULT_SCHEDULE, checkTiming, defOf, effective, sourceOf, setOverrides, timing, describeTiming, isTimingKey } from './timings.js';

afterEach(() => { setOverrides(new Map()); });

describe('registry', () => {
  it('has unique keys', () => {
    expect(new Set(TIMINGS.map((t) => t.key)).size).toBe(TIMINGS.length);
  });
  it('every default passes its own rules (so a fresh deploy never starts with an invalid value)', () => {
    for (const d of TIMINGS) {
      const r = checkTiming(d, d.def);
      expect(r.ok, `${d.key}: ${r.ok ? '' : r.error}`).toBe(true);
    }
  });
  it('number defaults sit inside their min and max', () => {
    for (const d of TIMINGS) if (d.kind === 'number' || d.kind === 'minuteOfDay') expect(d.def >= d.min && d.def <= d.max, d.key).toBe(true);
  });
  it('keeps today\'s defaults (nothing changes until someone edits a value)', () => {
    const want: Record<string, unknown> = {
      'install.idleMinutes': 5, 'install.minGapMinutes': 30, 'install.maxLateHours': 14, 'install.maxCycles': 2, 'install.recheckMinutes': 15,
      'install.resumeMaxAgeDays': 14, 'website.pingEverySeconds': 60, 'calling.windowStart': 540, 'calling.windowEnd': 1260,
      'calls.firstDelaySeconds': 20, 'calls.retryMinutes': 60, 'calls.maxAttempts': 3, 'calls.declineFollowupMinutes': 60, 'calls.maxPerHour': 60, 'calls.perScan': 25,
      'auth.otpValidityMinutes': 5, 'auth.otpResendWindowMinutes': 10, 'auth.accessTokenMinutes': 15, 'auth.refreshTokenDays': 30, 'auth.websiteSessionMinutes': 120, 'auth.adminIdleMinutes': 30,
      'tracking.clickTtlHours': 48, 'tracking.ipWindowMinutes': 30, 'offers.reuseHours': 24, 'pan.dailyLimit': 0, 'referral.eligibleDays': 7,
      'install.sendEnabled': false,
    };
    for (const [k, v] of Object.entries(want)) expect(defOf(k).def, k).toBe(v);
  });
  it('the default schedule is lean: 5 messages over a week (WhatsApp 10 min, SMS 4 h, WhatsApp 1 day, SMS 3 days, WhatsApp 7 days)', () => {
    expect(DEFAULT_SCHEDULE).toEqual([
      { channel: 'whatsapp', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 240 }, { channel: 'whatsapp', afterMinutes: 1440 },
      { channel: 'sms', afterMinutes: 4320 }, { channel: 'whatsapp', afterMinutes: 10080 },
    ]);
  });
  it('the OTP-never-entered default is just two messages, and it is on by default (sending itself is still off)', () => {
    expect(defOf('install.unverifiedSchedule').def).toEqual([{ channel: 'whatsapp', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 1440 }]);
    expect(defOf('install.unverifiedEnabled').def).toBe(true);
    expect(defOf('install.sendEnabled').def).toBe(false);
  });
  it('knows which keys exist', () => {
    expect(isTimingKey('install.idleMinutes')).toBe(true);
    expect(isTimingKey('nope')).toBe(false);
  });
});

describe('numbers', () => {
  const d = defOf('install.idleMinutes'); // 1..120
  it('accepts whole numbers in range, also as text', () => {
    expect(checkTiming(d, 7)).toEqual({ ok: true, value: 7 });
    expect(checkTiming(d, '7')).toEqual({ ok: true, value: 7 });
    expect(checkTiming(d, 1)).toEqual({ ok: true, value: 1 });
    expect(checkTiming(d, 120)).toEqual({ ok: true, value: 120 });
  });
  it('rejects out of range, fractions, blanks, junk and booleans', () => {
    for (const v of [0, -1, 121, 5000, 2.5, '', null, undefined, 'abc', NaN, Infinity, true]) expect(checkTiming(d, v).ok, String(v)).toBe(false);
  });
  it('minute-of-day only allows 0 to 1439', () => {
    const w = defOf('calling.windowEnd');
    expect(checkTiming(w, 1439).ok).toBe(true);
    expect(checkTiming(w, 0).ok).toBe(true);
    expect(checkTiming(w, 1440).ok).toBe(false);
  });
});

describe('boolean and phone list', () => {
  it('boolean accepts true/false and their text', () => {
    const b = defOf('install.sendEnabled');
    expect(checkTiming(b, true)).toEqual({ ok: true, value: true });
    expect(checkTiming(b, 'false')).toEqual({ ok: true, value: false });
    expect(checkTiming(b, 'yes').ok).toBe(false);
    expect(checkTiming(b, 1).ok).toBe(false);
  });
  const p = defOf('install.allowedNumbers');
  it('cleans numbers to 10 digits and removes duplicates', () => {
    expect(checkTiming(p, ['+91 98765 43210', '9876543210', '919123456789'])).toEqual({ ok: true, value: ['9876543210', '9123456789'] });
  });
  it('rejects anything that is not an Indian mobile number', () => {
    for (const v of [['12345'], ['0123456789'], ['abc'], ['5876543210']]) expect(checkTiming(p, v).ok, JSON.stringify(v)).toBe(false);
    expect(checkTiming(p, 'not a list').ok).toBe(false);
  });
  it('an empty list is allowed (it means "everyone")', () => {
    expect(checkTiming(p, [])).toEqual({ ok: true, value: [] });
  });
  it('is capped', () => {
    const many = Array.from({ length: 201 }, (_, i) => `9${String(100000000 + i)}`);
    expect(checkTiming(p, many).ok).toBe(false);
  });
});

describe('schedule', () => {
  const s = defOf('install.schedule');
  it('accepts a valid custom schedule', () => {
    const rows = [{ channel: 'whatsapp', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 1440 }];
    expect(checkTiming(s, rows)).toEqual({ ok: true, value: rows });
  });
  it('rejects rows out of time order, with the row number', () => {
    const r = checkTiming(s, [{ channel: 'sms', afterMinutes: 60 }, { channel: 'sms', afterMinutes: 30 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Row 2/);
  });
  it('rejects an empty list, an unknown channel, negative or fractional minutes, and a too-long delay', () => {
    expect(checkTiming(s, []).ok).toBe(false);
    expect(checkTiming(s, [{ channel: 'email', afterMinutes: 5 }]).ok).toBe(false);
    expect(checkTiming(s, [{ channel: 'sms', afterMinutes: -1 }]).ok).toBe(false);
    expect(checkTiming(s, [{ channel: 'sms', afterMinutes: 1.5 }]).ok).toBe(false);
    expect(checkTiming(s, [{ channel: 'sms', afterMinutes: 31 * 1440 }]).ok).toBe(false);
    expect(checkTiming(s, 'x').ok).toBe(false);
  });
  it('is capped at 40 messages', () => {
    const rows = Array.from({ length: 41 }, (_, i) => ({ channel: 'sms', afterMinutes: i }));
    expect(checkTiming(s, rows).ok).toBe(false);
    expect(checkTiming(s, rows.slice(0, 40)).ok).toBe(true);
  });
});

describe('where a value comes from: override > env > default', () => {
  const key = 'referral.eligibleDays'; // env REFERRAL_ELIGIBLE_DAYS, default 7
  const withEnv = (v: string | undefined, fn: () => void) => {
    const old = process.env.REFERRAL_ELIGIBLE_DAYS;
    if (v === undefined) delete process.env.REFERRAL_ELIGIBLE_DAYS; else process.env.REFERRAL_ELIGIBLE_DAYS = v;
    try { fn(); } finally { if (old === undefined) delete process.env.REFERRAL_ELIGIBLE_DAYS; else process.env.REFERRAL_ELIGIBLE_DAYS = old; }
  };
  it('default when nothing is set', () => withEnv(undefined, () => {
    expect(timing.num(key)).toBe(7); expect(sourceOf(defOf(key))).toBe('default');
  }));
  it('the old env variable still works', () => withEnv('9', () => {
    expect(timing.num(key)).toBe(9); expect(sourceOf(defOf(key))).toBe('env');
  }));
  it('a blank or non-numeric env value is ignored', () => {
    withEnv('', () => expect(timing.num(key)).toBe(7));
    withEnv('soon', () => expect(timing.num(key)).toBe(7));
  });
  it('an admin override beats the env value', () => withEnv('9', () => {
    setOverrides(new Map([[key, 12]]));
    expect(timing.num(key)).toBe(12); expect(sourceOf(defOf(key))).toBe('override');
  }));
  it('removing the override falls back again', () => withEnv('9', () => {
    setOverrides(new Map([[key, 12]])); setOverrides(new Map());
    expect(timing.num(key)).toBe(9);
  }));
  it('ACCESS_TTL keeps its old formats (seconds, or 15m / 1h)', () => {
    const old = process.env.ACCESS_TTL;
    try {
      process.env.ACCESS_TTL = '900'; expect(timing.num('auth.accessTokenMinutes')).toBe(15);
      process.env.ACCESS_TTL = '30m'; expect(timing.num('auth.accessTokenMinutes')).toBe(30);
      process.env.ACCESS_TTL = '1h'; expect(timing.num('auth.accessTokenMinutes')).toBe(60);
      process.env.ACCESS_TTL = 'garbage'; expect(timing.num('auth.accessTokenMinutes')).toBe(15);
    } finally { if (old === undefined) delete process.env.ACCESS_TTL; else process.env.ACCESS_TTL = old; }
  });
  it('INSTALL_REMINDER_SEND keeps working as the fallback for the on/off switch', () => {
    const old = process.env.INSTALL_REMINDER_SEND;
    try {
      delete process.env.INSTALL_REMINDER_SEND; expect(timing.bool('install.sendEnabled')).toBe(false);
      process.env.INSTALL_REMINDER_SEND = 'true'; expect(timing.bool('install.sendEnabled')).toBe(true);
      setOverrides(new Map([['install.sendEnabled', false]])); expect(timing.bool('install.sendEnabled')).toBe(false); // the admin can switch it off even when the env says on
    } finally { if (old === undefined) delete process.env.INSTALL_REMINDER_SEND; else process.env.INSTALL_REMINDER_SEND = old; }
  });
});

describe('reading', () => {
  it('converts to milliseconds', () => {
    expect(timing.minutesMs('install.idleMinutes')).toBe(5 * 60_000);
    expect(timing.hoursMs('install.maxLateHours')).toBe(14 * 3_600_000);
    expect(timing.daysMs('install.resumeMaxAgeDays')).toBe(14 * 86_400_000);
    expect(timing.secondsMs('calls.firstDelaySeconds')).toBe(20_000);
  });
  it('a typo in a key or the wrong type fails loudly instead of returning garbage', () => {
    expect(() => timing.num('install.idelMinutes')).toThrow(/unknown timing/);
    expect(() => timing.bool('install.idleMinutes')).toThrow(/not boolean/);
  });
  it('describes a setting for the admin page without functions in it', () => {
    const d = describeTiming(defOf('auth.accessTokenMinutes'));
    expect(d).toMatchObject({ key: 'auth.accessTokenMinutes', effective: 15, source: 'default', min: 5, max: 120 });
    expect(JSON.stringify(d)).not.toMatch(/fromEnv/);
    expect(effective(defOf('install.idleMinutes'))).toBe(5);
  });
});
