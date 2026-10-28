import { describe, it, expect } from 'vitest';
import { lenderNoteChange, NOTE_MAX } from './lenderNote.js';

describe('lenderNoteChange', () => {
  it('keeps the lender\'s own words with the step they happened at (the real PREFR event)', () => {
    expect(lenderNoteChange({ state: 'lender_selection', reason: 'Unknown error.', mapped: 'handoff' }))
      .toEqual({ set: 'Unknown error. (at lender selection)' });
  });
  it('tidies whitespace and works without a state', () => {
    expect(lenderNoteChange({ state: '', reason: '  Could   not\nreach lender ', mapped: null })).toEqual({ set: 'Could not reach lender' });
  });
  it('ignores an empty or benign reason', () => {
    for (const r of ['', '   ', 'Success', 'success.', 'OK', 'Completed', 'N/A', 'none', 'null', '-']) {
      expect(lenderNoteChange({ state: 'lender_selection', reason: r, mapped: 'handoff' })).toBeNull();
    }
  });
  it('clears the note once the lender has moved on, whatever the reason says', () => {
    for (const mapped of ['under_review', 'approved', 'disbursed', 'closed'] as const) {
      expect(lenderNoteChange({ state: 'application_submitted', reason: '', mapped })).toEqual({ clear: true });
      expect(lenderNoteChange({ state: 'application_submitted', reason: 'Some wording', mapped })).toEqual({ clear: true });
    }
  });
  it('keeps the reason of a decline or technical failure (it explains the outcome)', () => {
    expect(lenderNoteChange({ state: 'post_lender_redirection_journey', reason: 'Rejected by lender policy', mapped: 'rejected' }))
      .toEqual({ set: 'Rejected by lender policy (at post lender redirection journey)' });
    expect(lenderNoteChange({ state: 'lender_api_journey', reason: 'Timeout', mapped: 'failed' })).toEqual({ set: 'Timeout (at lender api journey)' });
  });
  it('an unmapped event still keeps its reason', () => {
    expect(lenderNoteChange({ state: 'pan_comprehensive', reason: 'PAN mismatch', mapped: null })).toEqual({ set: 'PAN mismatch (at pan comprehensive)' });
  });
  it('is capped', () => {
    const r = lenderNoteChange({ state: 'x', reason: 'a'.repeat(1000), mapped: null }) as { set: string };
    expect(r.set.length).toBe(NOTE_MAX);
    expect(r.set.endsWith('…')).toBe(true);
  });
});
