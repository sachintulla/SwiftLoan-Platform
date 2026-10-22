import { afterEach, describe, expect, it } from 'vitest';
import { MIN_PING_GAP_MS, shouldPing, setPingGapFromServer, currentPingGapMs, resetPingGap } from './activityPing';

afterEach(() => resetPingGap());

describe('shouldPing', () => {
  it('pings the first time', () => {
    expect(shouldPing(null, 1000)).toBe(true);
  });
  it('holds interaction pings inside the gap', () => {
    expect(shouldPing(1000, 1000 + MIN_PING_GAP_MS - 1)).toBe(false);
  });
  it('pings once the gap has passed', () => {
    expect(shouldPing(1000, 1000 + MIN_PING_GAP_MS)).toBe(true);
  });
  it('a route change or leaving always pings', () => {
    expect(shouldPing(1000, 1001, true)).toBe(true);
  });
});

describe('the interval the server asks for (Admin → Timings)', () => {
  it('starts at the built-in 60 seconds', () => {
    expect(currentPingGapMs()).toBe(MIN_PING_GAP_MS);
  });
  it('adopts a sensible value, and shouldPing then uses it', () => {
    setPingGapFromServer(30);
    expect(currentPingGapMs()).toBe(30_000);
    expect(shouldPing(1000, 1000 + 29_999)).toBe(false);
    expect(shouldPing(1000, 1000 + 30_000)).toBe(true);
  });
  it('accepts the limits (15 s to 15 min)', () => {
    setPingGapFromServer(15); expect(currentPingGapMs()).toBe(15_000);
    setPingGapFromServer(900); expect(currentPingGapMs()).toBe(900_000);
  });
  it('ignores anything else, so a bad reply cannot make the page flood the server or go silent', () => {
    for (const v of [0, 1, 14, 901, -30, NaN, Infinity, '30', null, undefined, {}]) {
      resetPingGap();
      setPingGapFromServer(v as unknown);
      expect(currentPingGapMs(), String(v)).toBe(MIN_PING_GAP_MS);
    }
  });
});
