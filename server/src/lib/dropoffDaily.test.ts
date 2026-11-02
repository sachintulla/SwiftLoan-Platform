import { describe, expect, it } from 'vitest';
import { dailyRows, nextIstTime, returnVerdict } from './dropoffDaily.js';

describe('nextIstTime', () => {
  it('finds the next 7:00 IST (01:30 UTC) after a moment', () => {
    expect(nextIstTime(new Date('2026-11-02T09:30:00Z'), 420).toISOString()).toBe('2026-11-03T01:30:00.000Z'); // 15:00 IST → next morning
    expect(nextIstTime(new Date('2026-11-02T00:10:00Z'), 420).toISOString()).toBe('2026-11-02T01:30:00.000Z'); // 05:40 IST → same morning
    expect(nextIstTime(new Date('2026-11-02T01:30:00Z'), 420).toISOString()).toBe('2026-11-03T01:30:00.000Z'); // exactly 7:00 → tomorrow
  });
});

describe('dailyRows', () => {
  it('stopped at 15:00 IST: WhatsApp +30 min, then 7:00 each morning for 7 days', () => {
    const startAt = new Date('2026-11-02T09:30:00Z');
    const rows = dailyRows(startAt, [{ channel: 'whatsapp', afterMinutes: 30 }], 420, 7);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.channel === 'whatsapp')).toBe(true);
    expect(rows[0].afterMinutes).toBe(16 * 60); // next day 7:00
    expect(rows[1].afterMinutes).toBe(16 * 60 + 1440);
    expect(rows[6].afterMinutes).toBe(16 * 60 + 6 * 1440);
  });
  it('a stop at 6:50 IST whose first message lands at 7:20 does not also get the 7:00 message that morning', () => {
    const startAt = new Date('2026-11-02T01:20:00Z');
    const rows = dailyRows(startAt, [{ channel: 'whatsapp', afterMinutes: 30 }], 420, 2);
    expect(rows[0].afterMinutes).toBe(1440 + 10); // tomorrow 7:00
  });
  it('0 days = no daily rows', () => {
    expect(dailyRows(new Date(), [{ channel: 'whatsapp', afterMinutes: 30 }], 420, 0)).toEqual([]);
  });
});

describe('returnVerdict', () => {
  const startAt = new Date('2026-11-02T09:00:00Z');
  const idleMs = 5 * 60_000;
  it('no newer action: carry on', () => {
    expect(returnVerdict({ startAt, stepsSent: 0, lastActivityAt: startAt, now: new Date('2026-11-02T09:20:00Z'), idleMs })).toBe('none');
  });
  it('came back before the first message: the clock restarts once they are idle again', () => {
    const back = new Date('2026-11-02T09:10:00Z');
    expect(returnVerdict({ startAt, stepsSent: 0, lastActivityAt: back, now: new Date('2026-11-02T09:12:00Z'), idleMs })).toBe('not_idle');
    expect(returnVerdict({ startAt, stepsSent: 0, lastActivityAt: back, now: new Date('2026-11-02T09:15:00Z'), idleMs })).toBe('reanchor');
  });
  it('came back after a message: the run ends', () => {
    expect(returnVerdict({ startAt, stepsSent: 1, lastActivityAt: new Date('2026-11-02T10:00:00Z'), now: new Date('2026-11-02T10:01:00Z'), idleMs })).toBe('returned');
  });
});
