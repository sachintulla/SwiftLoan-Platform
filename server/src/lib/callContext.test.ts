import { describe, it, expect } from 'vitest';
import {
  STALL_REASONS, STALL_HELP, stallReasonFor, stallHelpFor,
  LEAD_CALL_VARIABLES, compactContext,
} from './callContext.js';

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

describe('stall help', () => {
  it('offers something specific for every drop-off we describe', () => {
    // A reason without matching help produces a call that names the problem and
    // then has nothing to say about it — worse than not calling.
    for (const key of Object.keys(STALL_REASONS)) {
      expect(STALL_HELP[key], `no help text for ${key}`).toBeTruthy();
    }
  });

  it('reads grammatically after "you can offer to"', () => {
    for (const [key, help] of Object.entries(STALL_HELP)) {
      expect(`you can offer to ${help}`, key).not.toMatch(/\btheir\b/);
      expect(help[0], key).toBe(help[0].toLowerCase());
    }
  });

  it('never tells the agent to obtain the OTP code from the customer', () => {
    // The one instruction that would turn our own call into a phishing script.
    //
    // Matches only the dangerous DIRECTION — code travelling from customer to
    // agent. "tell them to request a fresh code" is the opposite and correct, and
    // an explicit "NEVER ask them to read the code" prohibition must not trip it,
    // which a blunter pattern did.
    const asksForCode = /\b(read|say|share|give|tell)\b[^.]{0,40}\b(otp|code)\b[^.]{0,20}\b(to|with)\s+(you|me|us)\b/i;
    for (const [key, help] of Object.entries(STALL_HELP)) {
      // Strip explicit prohibitions before checking — they mention the phrase in
      // order to forbid it.
      const withoutWarnings = help.replace(/\bNEVER\b[^.]*/gi, '');
      expect(withoutWarnings, key).not.toMatch(asksForCode);
    }
    // And the OTP entry must carry that prohibition explicitly.
    expect(stallHelpFor('otp_requested', 'otp_verified')).toMatch(/NEVER ask/i);
  });

  it('never has the agent quote a rate on the offers drop-off', () => {
    // Quoting a rate on a recorded line is a mis-selling problem for a lender.
    expect(stallHelpFor('offer_viewed', 'offer_selected')).toMatch(/not quote|Do NOT quote/i);
  });

  it('falls back to something usable for an unmapped rule', () => {
    const h = stallHelpFor('new_event', 'other_event');
    expect(h.length).toBeGreaterThan(20);
    expect(`you can offer to ${h}`).not.toMatch(/\btheir\b/);
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
