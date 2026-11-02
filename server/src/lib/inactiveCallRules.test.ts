import { describe, expect, it } from 'vitest';
import { dayAfterStop, inactiveBrief, inactiveCallDue } from './inactiveCallRules.js';

// Stopped Monday 2 Nov 15:00 IST (09:30Z). 8 PM IST = 14:30Z.
const stoppedAt = new Date('2026-11-02T09:30:00Z');
const base = {
  stoppedAt, callAtMinute: 1200, days: 3, status: 'application_filled' as const,
  calledToday: false, messagedRecently: false, inCallingHours: true, callAllowed: true, doNotContact: false, dailyLimitReached: false,
};
const at = (iso: string) => ({ ...base, now: new Date(iso) });

describe('dayAfterStop', () => {
  it('counts India days, not 24-hour blocks', () => {
    expect(dayAfterStop(stoppedAt, new Date('2026-11-02T18:00:00Z'))).toBe(0); // 23:30 IST same day
    expect(dayAfterStop(stoppedAt, new Date('2026-11-02T18:30:00Z'))).toBe(1); // 00:00 IST next day
    expect(dayAfterStop(stoppedAt, new Date('2026-11-05T14:30:00Z'))).toBe(3);
  });
});

describe('inactiveCallDue — 8 PM on the next three days', () => {
  it('never on the day they stopped, even after 8 PM', () => {
    expect(inactiveCallDue(at('2026-11-02T14:30:00Z'))).toEqual({ due: false, reason: 'same_day' });
  });
  it('next day: not before 8 PM, due from 8 PM', () => {
    expect(inactiveCallDue(at('2026-11-03T14:29:00Z'))).toEqual({ due: false, reason: 'not_yet_time' });
    expect(inactiveCallDue(at('2026-11-03T14:30:00Z'))).toEqual({ due: true, day: 1 });
  });
  it('days 2 and 3 as well, then no more', () => {
    expect(inactiveCallDue(at('2026-11-04T14:35:00Z'))).toEqual({ due: true, day: 2 });
    expect(inactiveCallDue(at('2026-11-05T14:35:00Z'))).toEqual({ due: true, day: 3 });
    expect(inactiveCallDue(at('2026-11-06T14:35:00Z'))).toEqual({ due: false, reason: 'past_last_day' });
  });
  it('once per day; waits for the quiet gap, calling hours, the switch, the cap', () => {
    const d = at('2026-11-03T14:30:00Z');
    expect(inactiveCallDue({ ...d, calledToday: true })).toEqual({ due: false, reason: 'called_today' });
    expect(inactiveCallDue({ ...d, messagedRecently: true })).toEqual({ due: false, reason: 'after_message' });
    expect(inactiveCallDue({ ...d, inCallingHours: false })).toEqual({ due: false, reason: 'outside_hours' });
    expect(inactiveCallDue({ ...d, callAllowed: false })).toEqual({ due: false, reason: 'not_allowed' });
    expect(inactiveCallDue({ ...d, dailyLimitReached: true })).toEqual({ due: false, reason: 'daily_limit' });
  });
  it('never for nothing started, finished, a technical failure, or do-not-contact', () => {
    const d = at('2026-11-03T14:30:00Z');
    expect(inactiveCallDue({ ...d, status: null }).due).toBe(false);
    expect(inactiveCallDue({ ...d, status: 'finished' }).due).toBe(false);
    expect(inactiveCallDue({ ...d, status: 'failed' }).due).toBe(false);
    expect(inactiveCallDue({ ...d, doNotContact: true })).toEqual({ due: false, reason: 'do_not_contact' });
  });
});

describe('inactiveBrief', () => {
  it('says yesterday / N days ago, where they stopped, and to ask why', () => {
    const b = inactiveBrief('offers_not_applied', 1, 'Choosing an offer');
    expect(b.reason).toBe('They received their loan offers yesterday and have done nothing since; the next step is to choose an offer and apply.');
    expect(inactiveBrief('pan_verified', 3, 'Basic details').reason).toContain('3 days ago');
    expect(b.help).toContain('left this yesterday');
    expect(b.help).toContain('Ask why they have not continued');
  });
  it('never uses the lender word "duplicate" or a reason for no offers', () => {
    expect(inactiveBrief('rejected', 2, 'Offers').reason).not.toMatch(/duplicate|credit|score/i);
  });
});
