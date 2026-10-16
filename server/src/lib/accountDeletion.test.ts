import { describe, it, expect } from 'vitest';
import { parseDeletionFeedback, DETAILS_MAX } from './accountDeletion.js';

describe('parseDeletionFeedback', () => {
  it('website must give a reason', () => {
    expect(parseDeletionFeedback({ source: 'website' }).ok).toBe(false);
    expect(parseDeletionFeedback({ source: 'website', reason: '  ' }).ok).toBe(false);
  });

  it('shipped app builds (no body) still delete, with no feedback', () => {
    expect(parseDeletionFeedback(undefined)).toEqual({ ok: true, value: null });
    expect(parseDeletionFeedback({})).toEqual({ ok: true, value: null });
  });

  it('accepts a known reason and normalises details', () => {
    expect(parseDeletionFeedback({ source: 'website', reason: 'privacy', details: '  too   many\nmessages ' })).toEqual({
      ok: true,
      value: { reasonCode: 'privacy', details: 'too many messages', source: 'website' },
    });
    expect(parseDeletionFeedback({ source: 'website', reason: 'privacy' })).toMatchObject({ ok: true, value: { details: null } });
  });

  it('rejects an unknown reason', () => {
    expect(parseDeletionFeedback({ source: 'website', reason: 'because' }).ok).toBe(false);
  });

  it('"other" needs a few words, and details are length-capped', () => {
    expect(parseDeletionFeedback({ source: 'website', reason: 'other' }).ok).toBe(false);
    expect(parseDeletionFeedback({ source: 'website', reason: 'other', details: 'hi' }).ok).toBe(false);
    expect(parseDeletionFeedback({ source: 'website', reason: 'other', details: 'moving abroad' }).ok).toBe(true);
    expect(parseDeletionFeedback({ source: 'website', reason: 'privacy', details: 'x'.repeat(DETAILS_MAX + 1) }).ok).toBe(false);
  });

  it('a non-website source is treated as the app', () => {
    expect(parseDeletionFeedback({ source: 'hacker', reason: 'privacy' })).toMatchObject({ ok: true, value: { source: 'app' } });
  });
});
