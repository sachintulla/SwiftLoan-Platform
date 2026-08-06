import { describe, it, expect } from 'vitest';
import {
  inferOutcome, transcriptText, parseAgentOutcome, shouldReplaceOutcome,
} from './callOutcome.js';

/**
 * These guard a judgement call that is easy to regress: an inferred outcome is a
 * guess, and a wrong guess here has real consequences — a false `do_not_call`
 * silences a paying customer, a false `interested` keeps messaging someone who
 * refused. So the tests care as much about when we DON'T decide as when we do.
 */
describe('transcriptText', () => {
  it('pulls text out of nested provider shapes', () => {
    const t = transcriptText({
      messages: [{ role: 'user', text: 'I want a loan' }, { role: 'agent', content: 'sure' }],
    });
    expect(t).toContain('I want a loan');
    expect(t).toContain('sure');
  });

  it('ignores ids and timestamps so they cannot trigger a match', () => {
    // A conversation id containing "busy" must not read as an outcome.
    const t = transcriptText({ conversation_id: 'busy-1234', createdAt: '2026-01-01' });
    expect(t.trim()).toBe('');
  });

  it('includes the summary alongside the transcript', () => {
    expect(transcriptText([{ text: 'hello' }], 'Customer was interested')).toContain('interested');
  });
});

describe('inferOutcome', () => {
  it('refuses to guess from too little text', () => {
    expect(inferOutcome([{ text: 'hello?' }], null).outcome).toBeNull();
    expect(inferOutcome(null, 'ok').outcome).toBeNull();
  });

  it('detects an explicit do-not-call and reports its evidence', () => {
    const r = inferOutcome([{ text: 'Please do not call me again, remove my number' }]);
    expect(r.outcome).toBe('do_not_call');
    expect(r.source).toBe('inferred');
    expect(r.evidence).toBeTruthy();
  });

  it('prefers the stronger signal when a call contains both', () => {
    // "interested" appears, but so does an explicit refusal — the refusal wins
    // because acting on the wrong one is the more costly mistake.
    const r = inferOutcome([
      { text: 'I was interested earlier but now do not call me again' },
    ]);
    expect(r.outcome).toBe('do_not_call');
  });

  it('detects a callback request', () => {
    expect(inferOutcome([{ text: 'I am driving right now, can you call me later please' }]).outcome)
      .toBe('callback_requested');
  });

  it('detects not-interested without confusing it for interested', () => {
    const r = inferOutcome([{ text: 'No thanks, I am not interested in a loan right now' }]);
    expect(r.outcome).toBe('not_interested');
  });

  it('detects a wrong number', () => {
    expect(inferOutcome([{ text: 'This is the wrong number, I never applied for anything' }]).outcome)
      .toBe('wrong_number');
  });

  it('detects interest', () => {
    expect(inferOutcome([{ text: 'Yes please send me the link on whatsapp, how do I apply' }]).outcome)
      .toBe('interested');
  });

  it('stays null on a long but non-committal call', () => {
    const r = inferOutcome([
      { text: 'Hello yes hello. Can you hear me. The line is not clear. Hello.' },
    ]);
    expect(r.outcome).toBeNull();
  });
});

describe('parseAgentOutcome', () => {
  it('accepts the documented values', () => {
    expect(parseAgentOutcome('interested')).toBe('interested');
    expect(parseAgentOutcome('do_not_call')).toBe('do_not_call');
    expect(parseAgentOutcome('CALLBACK_REQUESTED')).toBe('callback_requested');
    expect(parseAgentOutcome('callback-requested')).toBe('callback_requested');
  });

  it('rejects anything it does not recognise rather than guessing', () => {
    expect(parseAgentOutcome('maybe_later')).toBeNull();
    expect(parseAgentOutcome('')).toBeNull();
    expect(parseAgentOutcome(undefined)).toBeNull();
  });
});

describe('shouldReplaceOutcome', () => {
  const inferred = { outcome: 'interested' as const, source: 'inferred' as const };
  const agent = { outcome: 'not_interested' as const, source: 'agent' as const };

  it('lets an agent report win over anything', () => {
    expect(shouldReplaceOutcome('interested', 'inferred', agent)).toBe(true);
    expect(shouldReplaceOutcome('interested', 'agent', agent)).toBe(true);
  });

  it('never lets an inference overwrite an agent report', () => {
    expect(shouldReplaceOutcome('not_interested', 'agent', inferred)).toBe(false);
  });

  it('never re-infers over an existing inference', () => {
    // Ello fires several events per call; re-deriving on each would make the
    // disposition flap between them.
    expect(shouldReplaceOutcome('interested', 'inferred', inferred)).toBe(false);
  });

  it('fills an empty outcome', () => {
    expect(shouldReplaceOutcome(null, null, inferred)).toBe(true);
  });

  it('does nothing when there is nothing to write', () => {
    expect(shouldReplaceOutcome(null, null, { outcome: null, source: null })).toBe(false);
  });
});
