import { describe, expect, it } from 'vitest';
import { dailyLimitReached, effectiveCallDelayMinutes, istDateKey, istDayStart } from './stallCallLimits.js';

describe('istDayStart', () => {
  it('is midnight India time (18:30 UTC the evening before)', () => {
    expect(istDayStart(new Date('2026-10-30T10:00:00Z')).toISOString()).toBe('2026-10-29T18:30:00.000Z');
  });
  it('rolls over at 00:00 IST, not at UTC midnight', () => {
    // 18:29 UTC = 23:59 IST (still 30 Oct); 18:30 UTC = 00:00 IST on 31 Oct
    expect(istDayStart(new Date('2026-10-30T18:29:00Z')).toISOString()).toBe('2026-10-29T18:30:00.000Z');
    expect(istDayStart(new Date('2026-10-30T18:30:00Z')).toISOString()).toBe('2026-10-30T18:30:00.000Z');
  });
});

describe('istDateKey', () => {
  it('rolls over at 00:00 IST (18:30 UTC)', () => {
    expect(istDateKey(new Date('2026-11-02T18:29:00Z'))).toBe('2026-11-02');
    expect(istDateKey(new Date('2026-11-02T18:30:00Z'))).toBe('2026-11-03');
  });
});

describe('effectiveCallDelayMinutes', () => {
  it('raises a short rule delay to the global minimum', () => {
    expect(effectiveCallDelayMinutes(20, 120)).toBe(120);
    expect(effectiveCallDelayMinutes(45, 120)).toBe(120);
  });
  it('keeps a rule delay that is already longer', () => {
    expect(effectiveCallDelayMinutes(180, 120)).toBe(180);
  });
  it('a minimum of 0 changes nothing', () => {
    expect(effectiveCallDelayMinutes(30, 0)).toBe(30);
  });
});

describe('dailyLimitReached', () => {
  it('stops at the limit', () => {
    expect(dailyLimitReached(2, 3)).toBe(false);
    expect(dailyLimitReached(3, 3)).toBe(true);
    expect(dailyLimitReached(5, 3)).toBe(true);
  });
  it('0 means no limit', () => {
    expect(dailyLimitReached(1000, 0)).toBe(false);
  });
});
