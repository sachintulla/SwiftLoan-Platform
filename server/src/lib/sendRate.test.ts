import { describe, it, expect } from 'vitest';
import { createRateGate, runPool, isThrottled } from './sendRate.js';

/** A fake clock: sleeping just moves time on. */
function clock(start = 0) {
  let t = start;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, get t() { return t; } };
}

describe('createRateGate', () => {
  it('lets the limit through at once, then makes the next send wait for the oldest to leave the minute', async () => {
    const c = clock();
    const gate = createRateGate({ perMinute: () => 3, now: c.now, sleep: c.sleep });
    for (let i = 0; i < 3; i++) await gate.acquire();
    expect(c.t).toBe(0);
    await gate.acquire();
    expect(c.t).toBe(60_000);
  });
  it('1,000 a minute: 2,000 messages take one minute of waiting, never more than 1,000 in any minute', async () => {
    const c = clock();
    const gate = createRateGate({ perMinute: () => 1000, now: c.now, sleep: c.sleep });
    const times: number[] = [];
    for (let i = 0; i < 2000; i++) { await gate.acquire(); times.push(c.t); }
    expect(c.t).toBe(60_000);
    for (const t of times) expect(times.filter((x) => x > t - 60_000 && x <= t).length).toBeLessThanOrEqual(1000);
  });
  it('concurrent callers do not share a slot', async () => {
    const c = clock();
    const gate = createRateGate({ perMinute: () => 2, now: c.now, sleep: c.sleep });
    await Promise.all([gate.acquire(), gate.acquire(), gate.acquire()]);
    expect(c.t).toBe(60_000);
    expect(gate.inWindow()).toBe(1);
  });
  it('reads the limit every time, and treats 0 or nonsense as 1', async () => {
    const c = clock();
    let limit = 0;
    const gate = createRateGate({ perMinute: () => limit, now: c.now, sleep: c.sleep });
    await gate.acquire();
    limit = 5;
    for (let i = 0; i < 4; i++) await gate.acquire();
    expect(c.t).toBe(0);
  });
});

describe('runPool', () => {
  it('runs every item, never more than N at once', async () => {
    let active = 0; let peak = 0; const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      seen.push(n); active--;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });
  it('copes with an empty list and a silly parallel value', async () => {
    await runPool([], 10, async () => { throw new Error('never'); });
    const seen: number[] = [];
    await runPool([1, 2], 0, async (n) => { seen.push(n); });
    expect(seen).toEqual([1, 2]);
  });
});

describe('isThrottled', () => {
  it.each([
    [429, null, true],
    [400, { error: { code: 130429, message: 'Rate limit hit' } }, true],
    [400, { error: { code: 80007 } }, true],
    [200, { status: 'FAILED', message: 'Too many requests, slow down' }, true],
    [400, { status: 'FAILED', message: 'Template not found' }, false],
    [500, null, false],
    [400, { error: { code: 131026, message: 'Message undeliverable' } }, false],
  ])('http %s %j → %s', (status, body, want) => expect(isThrottled(status as number, body)).toBe(want));
});
