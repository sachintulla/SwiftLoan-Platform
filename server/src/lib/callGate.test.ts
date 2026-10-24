import { describe, it, expect } from 'vitest';
import { isCallAllowed, callNudgesEnabled, statusCallsEnabled } from './callGate.js';

/**
 * Safety-critical: automatic outbound calls must be OFF by default, so enabling a
 * voice stall rule (or shipping the daily-status job) never dials a real customer
 * until someone explicitly turns the master switch on in Admin → Timings.
 */
describe('callGate — off by default', () => {
  it('master + daily switches default off', () => {
    expect(callNudgesEnabled()).toBe(false);
    expect(statusCallsEnabled()).toBe(false);
  });

  it('isCallAllowed is false for any number while the master switch is off', () => {
    expect(isCallAllowed('7032206339')).toBe(false);
    expect(isCallAllowed('9949321067')).toBe(false);
    expect(isCallAllowed('+917032206339')).toBe(false);
    expect(isCallAllowed(null)).toBe(false);
    expect(isCallAllowed('')).toBe(false);
  });
});
