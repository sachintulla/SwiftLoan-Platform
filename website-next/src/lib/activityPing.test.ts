import { describe, expect, it } from 'vitest';
import { MIN_PING_GAP_MS, shouldPing } from './activityPing';

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
