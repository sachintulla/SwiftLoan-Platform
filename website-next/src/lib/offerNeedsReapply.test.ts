import { describe, it, expect } from 'vitest';
import { offerNeedsReapply, isLenderPending } from './applyApi';

const url = 'https://lender.example/journey';

describe('isLenderPending', () => {
  it("is true while the lender hasn't confirmed: our own 'offers_ready' record or the lender's 'handoff'", () => {
    expect(isLenderPending('offers_ready')).toBe(true);
    expect(isLenderPending('handoff')).toBe(true);
  });
  it('is false once the lender has it, and for empty values', () => {
    for (const s of ['under_review', 'approved', 'rejected', 'disbursed', 'failed', 'closed', '', null, undefined]) {
      expect(isLenderPending(s as string | null | undefined)).toBe(false);
    }
  });
});

describe('offerNeedsReapply', () => {
  it("is true when applied, the lender hasn't confirmed ('offers_ready' or 'handoff'), and there is a lender page", () => {
    expect(offerNeedsReapply({ applied: true, lenderStatus: 'offers_ready', redirectionUrl: url })).toBe(true);
    expect(offerNeedsReapply({ applied: true, lenderStatus: 'handoff', redirectionUrl: url })).toBe(true);
  });
  it('is false once the lender has reported any progress', () => {
    for (const s of ['under_review', 'approved', 'rejected', 'disbursed', 'failed']) {
      expect(offerNeedsReapply({ applied: true, lenderStatus: s, redirectionUrl: url })).toBe(false);
    }
  });
  it('is false for an offer that was never applied to', () => {
    expect(offerNeedsReapply({ applied: false, lenderStatus: null, redirectionUrl: url })).toBe(false);
    expect(offerNeedsReapply({ lenderStatus: 'offers_ready', redirectionUrl: url })).toBe(false);
  });
  it('is false when there is no lender page to reopen', () => {
    expect(offerNeedsReapply({ applied: true, lenderStatus: 'offers_ready', redirectionUrl: null })).toBe(false);
  });
});
