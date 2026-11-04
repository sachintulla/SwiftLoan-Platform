import { describe, it, expect } from 'vitest';
import { stepsFromRows, clockLabel } from './reminderSchedule.js';
import { TIMINGS, checkTiming, type ScheduleRow } from './timings.js';

const MIN = 60_000;
// 2026-11-04 13:00 IST = 07:30 UTC
const stoppedAt = new Date('2026-11-04T07:30:00Z');
const at = (s: { offsetMs: number }) => new Date(stoppedAt.getTime() + s.offsetMs).toISOString();

/** Scenario 2 (signed in, PAN not done), as in Sachin's review. */
const SCENARIO_2: ScheduleRow[] = [
  { channel: 'whatsapp', afterMinutes: 30 },
  { channel: 'whatsapp', afterMinutes: 240 },
  { channel: 'call', afterMinutes: 1440 + 660, atClock: true }, // day 1, 11:00
  { channel: 'whatsapp', afterMinutes: 3 * 1440 + 1140, atClock: true }, // day 3, 19:00
  { channel: 'call', afterMinutes: 5 * 1440 + 1080, atClock: true }, // day 5, 18:00
  { channel: 'whatsapp', afterMinutes: 7 * 1440 + 600, atClock: true }, // day 7, 10:00
];

describe('stage timeline steps', () => {
  it('a set-time row lands on that India day at that clock time; a plain row is a delay after they stopped', () => {
    const steps = stepsFromRows(SCENARIO_2, stoppedAt);
    expect(steps.map((s) => [s.channel, at(s)])).toEqual([
      ['whatsapp', '2026-11-04T08:00:00.000Z'], // +30 min = 13:30 IST
      ['whatsapp', '2026-11-04T11:30:00.000Z'], // +4 h = 17:00 IST
      ['call', '2026-11-05T05:30:00.000Z'], // 5 Nov 11:00 IST
      ['whatsapp', '2026-11-07T13:30:00.000Z'], // 7 Nov 19:00 IST
      ['call', '2026-11-09T12:30:00.000Z'], // 9 Nov 18:00 IST
      ['whatsapp', '2026-11-11T04:30:00.000Z'], // 11 Nov 10:00 IST
    ]);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(steps[2].label).toBe('day 1 11:00 call');
  });

  it('the India day is used, not the UTC day: a stop at 00:30 IST counts as that India day', () => {
    const lateNight = new Date('2026-11-04T19:00:00Z'); // 5 Nov 00:30 IST
    const [s] = stepsFromRows([{ channel: 'call', afterMinutes: 1440 + 660, atClock: true }], lateNight);
    expect(new Date(lateNight.getTime() + s.offsetMs).toISOString()).toBe('2026-11-06T05:30:00.000Z'); // 6 Nov 11:00 IST
  });

  it('a late stop keeps time order: a +4 h row that falls after a set time the next morning still comes first only if earlier', () => {
    const night = new Date('2026-11-04T16:00:00Z'); // 21:30 IST
    const steps = stepsFromRows([{ channel: 'whatsapp', afterMinutes: 900 }, { channel: 'call', afterMinutes: 1440 + 600, atClock: true }], night);
    expect(steps.map((s) => s.channel)).toEqual(['call', 'whatsapp']); // call 10:00 next day, WhatsApp 12:30 next day
  });

  it('without a start time (install reminders) every row is a plain delay, unchanged', () => {
    expect(stepsFromRows([{ channel: 'sms', afterMinutes: 5 }]).map((s) => s.offsetMs)).toEqual([5 * MIN]);
  });

  it('labels a set-time row by day and clock', () => {
    expect(clockLabel(3 * 1440 + 1140)).toBe('day 3 19:00');
  });
});

describe('timeline settings validation', () => {
  const stage = TIMINGS.find((d) => d.key === 'dropoff.schedule.otp_verified')!;
  const shared = TIMINGS.find((d) => d.key === 'install.schedule')!;
  it('a drop-off stage timeline accepts calls and set-time rows', () => {
    const r = checkTiming(stage, SCENARIO_2);
    expect(r.ok).toBe(true);
  });
  it('other schedules refuse calls and set times', () => {
    expect(checkTiming(shared, [{ channel: 'call', afterMinutes: 10 }]).ok).toBe(false);
    expect(checkTiming(shared, [{ channel: 'sms', afterMinutes: 2100, atClock: true }]).ok).toBe(false);
  });
  it('a set time must be on day 1 or later', () => {
    expect(checkTiming(stage, [{ channel: 'call', afterMinutes: 660, atClock: true }]).ok).toBe(false);
  });
});
