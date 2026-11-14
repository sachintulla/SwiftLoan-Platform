import { describe, expect, it } from 'vitest';
import { CUSTOMER_ACTION_CHANNELS, NOT_A_RETURN_EVENT_NAMES, SYSTEM_EVENT_NAMES, isCustomerAction } from './journey.js';

// 2026-11-02: a stall SMS we sent counted as the customer coming back and re-armed 100+ drop-off runs. Only the customer's own
// channels may ever move the "last action" clock.
describe('what counts as the customer acting', () => {
  it('website and app do; what we send, detect or dial does not', () => {
    expect(isCustomerAction('website')).toBe(true);
    expect(isCustomerAction('app')).toBe(true);
    for (const c of ['system', 'voice', 'campaign', 'admin'] as const) expect(isCustomerAction(c), c).toBe(false);
    expect(CUSTOMER_ACTION_CHANNELS).toEqual(['website', 'app']);
  });
  it('names our jobs write are never activity, whatever channel an old row carries', () => {
    for (const n of ['nudge_sent', 'stage_stalled', 'call_queued', 'call_completed']) expect(SYSTEM_EVENT_NAMES).toContain(n);
  });
  // 2026-11-10: a customer asked for login codes during the Vox wallet outage, never got them, and that "came back" would have ended
  // their drop-off run for good. Only entering the code is a return.
  it('asking for a login code is not coming back; entering it is', () => {
    expect(NOT_A_RETURN_EVENT_NAMES).toContain('otp_requested');
    expect(NOT_A_RETURN_EVENT_NAMES).not.toContain('otp_verified');
    for (const n of SYSTEM_EVENT_NAMES) expect(NOT_A_RETURN_EVENT_NAMES).toContain(n);
  });
});
