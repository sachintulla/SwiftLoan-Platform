import { describe, it, expect } from 'vitest';
import { STALL_REASONS, stallReasonFor, LEAD_CALL_VARIABLES, compactContext } from './callContext.js';

/**
 * These guard things a customer would actually hear on a phone call, which is why
 * they are worth a test: a grammar slip here is not a cosmetic bug, it is a
 * regulated lender's outbound agent saying something odd to a real person.
 */
describe('stall reasons', () => {
  it('reads grammatically after the word "you"', () => {
    // The prompt renders: "I noticed you {{stall_reason}}". A third-person entry
    // produced "I noticed you entered THEIR phone number" — caught in testing.
    for (const [key, reason] of Object.entries(STALL_REASONS)) {
      const sentence = `I noticed you ${reason}`;
      expect(sentence, key).not.toMatch(/\btheir\b/);
      expect(sentence, key).not.toMatch(/\bhas\b/); // "has not installed" → "have not"
      // No leading pronoun — the prompt supplies "you".
      expect(reason, key).not.toMatch(/^(you|they|he|she|the customer)\b/i);
    }
  });

  it('never starts with a capital, since it lands mid-sentence', () => {
    for (const [key, reason] of Object.entries(STALL_REASONS)) {
      expect(reason[0], key).toBe(reason[0].toLowerCase());
    }
  });

  it('describes both sides of the drop-off', () => {
    // A reason that only says what they did, without what they did not do, gives
    // the agent nothing to ask about.
    for (const [key, reason] of Object.entries(STALL_REASONS)) {
      expect(reason, key).toMatch(/\b(but|never|not)\b/);
    }
  });

  it('has wording for the OTP drop-off, the most common one', () => {
    expect(stallReasonFor('otp_requested', 'otp_verified')).toContain('OTP');
  });

  it('falls back readably for a rule with no wording', () => {
    const r = stallReasonFor('some_new_event', 'another_new_event');
    expect(r).toContain('some new event');
    expect(r).toContain('another new event');
    expect(`I noticed you ${r}`).not.toMatch(/\btheir\b/);
  });
});

describe('LEAD_CALL_VARIABLES', () => {
  it('includes the stall variables the drop-off prompt references', () => {
    for (const v of ['stall_reason', 'stall_last_step', 'stall_expected_step', 'stall_minutes', 'stall_channel']) {
      expect(LEAD_CALL_VARIABLES).toContain(v);
    }
  });

  it('has no duplicates — Ello would register the same name twice', () => {
    expect(new Set(LEAD_CALL_VARIABLES).size).toBe(LEAD_CALL_VARIABLES.length);
  });

  it('uses snake_case only, matching the {{...}} placeholders in the prompts', () => {
    for (const v of LEAD_CALL_VARIABLES) expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe('compactContext', () => {
  it('drops empty values so a blank never renders mid-sentence', () => {
    // "your  loan" with a hole in it is worse than the agent asking.
    const out = compactContext({ a: 'x', b: '', c: 'y' });
    expect(out).toEqual({ a: 'x', c: 'y' });
  });

  it('keeps a legitimate "0"', () => {
    expect(compactContext({ n: '0' })).toEqual({ n: '0' });
  });
});
