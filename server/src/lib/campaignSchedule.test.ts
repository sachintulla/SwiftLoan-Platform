/**
 * Campaign cadence + calling-window rules.
 *
 * These were originally verified with a throwaway script that lived outside the
 * repo and ran in no pipeline. They are the highest-risk pure logic in the
 * system: a mistake here dials real customers at the wrong hour or on the wrong
 * day, so they belong in CI.
 *
 * The timezone cases matter most — a naive `getHours()` would evaluate a
 * 09:00–19:00 IST window against the server's own zone.
 */
import { describe, it, expect } from 'vitest';
import type { Campaign, CampaignContact } from '@prisma/client';
import {
  canDialNow, isContactEligible, planNextAttempt, localParts, formatMinutes, nextWindowOpening,
} from './campaignSchedule.js';

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  status: 'running',
  startAt: new Date('2026-08-01T00:00:00Z'),
  endAt: new Date('2026-08-31T23:59:00Z'),
  timezone: 'Asia/Kolkata',
  dailyStartMinute: 540,  // 09:00
  dailyEndMinute: 1140,   // 19:00
  daysOfWeek: [],
  retryStrategy: 'once',
  maxAttemptsPerContact: 1,
  attemptsPerDay: 1,
  retryIntervalDays: 1,
  retryIntervalMinutes: 60,
  stopOnAnswer: true,
  concurrency: 1,
  ...over,
} as unknown as Campaign);

const contact = (over: Partial<CampaignContact> = {}): CampaignContact => ({
  state: 'pending',
  attempts: 0,
  attemptsToday: 0,
  attemptDayKey: null,
  nextEligibleAt: null,
  answered: false,
  ...over,
} as unknown as CampaignContact);

describe('calling window (IST 09:00–19:00)', () => {
  it('allows a time inside the window', () => {
    // 12:00 IST == 06:30 UTC
    expect(canDialNow(campaign(), new Date('2026-08-05T06:30:00Z')).canDial).toBe(true);
  });

  it('blocks before the window opens', () => {
    expect(canDialNow(campaign(), new Date('2026-08-05T02:30:00Z')).reason).toBe('outside_daily_window');
  });

  it('blocks after the window closes', () => {
    expect(canDialNow(campaign(), new Date('2026-08-05T14:30:00Z')).reason).toBe('outside_daily_window');
  });

  it('handles a UTC instant that is the previous day in IST', () => {
    // 23:00 UTC on the 4th is 04:30 IST on the 5th — the case a naive
    // UTC-based check gets wrong.
    expect(canDialNow(campaign(), new Date('2026-08-04T23:00:00Z')).reason).toBe('outside_daily_window');
  });

  it('supports a window that wraps past midnight (22:00–06:00)', () => {
    const night = campaign({ dailyStartMinute: 1320, dailyEndMinute: 360 });
    expect(canDialNow(night, new Date('2026-08-05T17:30:00Z')).canDial).toBe(true); // 23:00 IST
    expect(canDialNow(night, new Date('2026-08-04T21:30:00Z')).canDial).toBe(true); // 03:00 IST
    expect(canDialNow(night, new Date('2026-08-05T06:30:00Z')).canDial).toBe(false); // 12:00 IST
  });
});

describe('date range and status', () => {
  it('blocks before startAt', () => {
    expect(canDialNow(campaign(), new Date('2026-07-30T06:30:00Z')).reason).toBe('before_start');
  });
  it('blocks after endAt', () => {
    expect(canDialNow(campaign(), new Date('2026-09-02T06:30:00Z')).reason).toBe('after_end');
  });
  it('blocks when paused', () => {
    expect(canDialNow(campaign({ status: 'paused' }), new Date('2026-08-05T06:30:00Z')).reason).toBe('not_running');
  });
});

describe('weekday filter', () => {
  const wed = new Date('2026-08-05T06:30:00Z'); // Wednesday
  it('allows a permitted weekday', () => {
    expect(canDialNow(campaign({ daysOfWeek: [3] }), wed).canDial).toBe(true);
  });
  it('blocks a non-permitted weekday', () => {
    expect(canDialNow(campaign({ daysOfWeek: [1] }), wed).reason).toBe('day_not_allowed');
  });
});

describe('contact eligibility', () => {
  const now = new Date('2026-08-05T06:30:00Z');
  const dayKey = localParts(now, 'Asia/Kolkata').dayKey;

  it('a fresh contact is eligible', () => {
    expect(isContactEligible(campaign(), contact(), now).eligible).toBe(true);
  });
  it('an answered contact is skipped when stopOnAnswer', () => {
    expect(isContactEligible(campaign(), contact({ answered: true }), now).eligible).toBe(false);
  });
  it('respects maxAttemptsPerContact', () => {
    expect(isContactEligible(campaign(), contact({ attempts: 1 }), now).eligible).toBe(false);
  });
  it('respects a future nextEligibleAt', () => {
    expect(isContactEligible(campaign(), contact({ nextEligibleAt: new Date('2099-01-01') }), now).eligible).toBe(false);
  });

  const thrice = campaign({ retryStrategy: 'n_per_day', attemptsPerDay: 3, maxAttemptsPerContact: 10 });
  it('allows attempts under the daily cap', () => {
    expect(isContactEligible(thrice, contact({ attempts: 2, attemptsToday: 2, attemptDayKey: dayKey }), now).eligible).toBe(true);
  });
  it('blocks at the daily cap', () => {
    expect(isContactEligible(thrice, contact({ attempts: 3, attemptsToday: 3, attemptDayKey: dayKey }), now).eligible).toBe(false);
  });
  it("does not carry yesterday's count into today", () => {
    // The counter is keyed by local day, so it self-resets at midnight without
    // a separate reset job.
    expect(isContactEligible(thrice, contact({ attempts: 3, attemptsToday: 3, attemptDayKey: '2026-08-04' }), now).eligible).toBe(true);
  });
});

describe('planNextAttempt', () => {
  const now = new Date('2026-08-05T06:30:00Z');

  it('strategy "once" exhausts the contact', () => {
    const p = planNextAttempt(campaign(), contact(), { answered: false }, now);
    expect(p.exhausted).toBe(true);
    expect(p.nextEligibleAt).toBeNull();
  });

  it('n_per_day schedules the retry after the minimum gap', () => {
    const c = campaign({ retryStrategy: 'n_per_day', attemptsPerDay: 3, maxAttemptsPerContact: 10 });
    const p = planNextAttempt(c, contact(), { answered: false }, now);
    expect(p.exhausted).toBe(false);
    expect(p.nextEligibleAt?.toISOString()).toBe(new Date(now.getTime() + 60 * 60_000).toISOString());
  });

  it('an answered call exhausts the contact', () => {
    const c = campaign({ retryStrategy: 'n_per_day', attemptsPerDay: 3, maxAttemptsPerContact: 10 });
    const p = planNextAttempt(c, contact(), { answered: true }, now);
    expect(p.exhausted).toBe(true);
    expect(p.answered).toBe(true);
  });

  it('every_n_days waits the configured number of days', () => {
    const c = campaign({ retryStrategy: 'every_n_days', retryIntervalDays: 7, maxAttemptsPerContact: 5 });
    const p = planNextAttempt(c, contact(), { answered: false }, now);
    expect(p.nextEligibleAt?.toISOString()).toBe(new Date(now.getTime() + 7 * 86_400_000).toISOString());
  });

  it('never schedules a retry past endAt', () => {
    const c = campaign({
      retryStrategy: 'every_n_days', retryIntervalDays: 7,
      maxAttemptsPerContact: 5, endAt: new Date('2026-08-06T00:00:00Z'),
    });
    const p = planNextAttempt(c, contact(), { answered: false }, now);
    expect(p.exhausted).toBe(true);
    expect(p.nextEligibleAt).toBeNull();
  });
});

describe('nextWindowOpening', () => {
  it('skips a non-permitted weekday', () => {
    // Saturday 13:15 IST on a Mon–Fri campaign should land on Monday 09:00 IST.
    const c = campaign({ daysOfWeek: [1, 2, 3, 4, 5] });
    const sat = new Date('2026-08-01T07:45:00Z');
    const next = nextWindowOpening(c, sat);
    expect(localParts(next, 'Asia/Kolkata').weekday).toBe(1); // Monday
    expect(localParts(next, 'Asia/Kolkata').minutes).toBe(540); // 09:00
  });
});

describe('formatMinutes', () => {
  it('formats minutes from midnight as HH:MM', () => {
    expect(formatMinutes(540)).toBe('09:00');
    expect(formatMinutes(1140)).toBe('19:00');
    expect(formatMinutes(0)).toBe('00:00');
  });
});
