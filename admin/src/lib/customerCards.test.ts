import { describe, it, expect } from 'vitest';
import { customerCards, share } from './customerCards';

describe('customerCards', () => {
  it('works the six cards out of the status counts (production, 23 Nov 2026)', () => {
    const c = customerCards([
      { key: 'otp_verified', count: 229 }, { key: 'pan_verified', count: 11 }, { key: 'filling_details', count: 22 },
      { key: 'no_offers', count: 1073 }, { key: 'offers_failed', count: 2 }, { key: 'offers_ready', count: 46 },
      { key: 'applied', count: 130 }, { key: 'under_review', count: 72 }, { key: 'lender_failed', count: 6 },
      { key: 'account_deleted', count: 14 }, { key: 'approved', count: 0 },
    ]);
    expect(c.total).toBe(1605);
    expect([c.askedOffers, c.gotOffers, c.noOffers, c.appliedLender, c.rejected]).toEqual([1329, 254, 1073, 208, 1073]);
    expect([c.askedOffersPct, c.gotOffersPct, c.noOffersPct, c.appliedLenderPct, c.rejectedPct]).toEqual([82.8, 15.8, 66.9, 13, 66.9]);
  });
  it('counts a lender rejection as rejected, and as someone who got offers and applied', () => {
    const c = customerCards([{ key: 'no_offers', count: 3 }, { key: 'lender_rejected', count: 2 }, { key: 'otp_verified', count: 5 }]);
    expect(c.rejected).toBe(5); expect(c.lenderRejected).toBe(2);
    expect(c.gotOffers).toBe(2); expect(c.appliedLender).toBe(2); expect(c.askedOffers).toBe(5);
  });
  it('is all zeros with nobody, and never divides by zero', () => {
    const c = customerCards([]);
    expect(c.total).toBe(0); expect(c.askedOffersPct).toBe(0);
    expect(share(5, 0)).toBe(0); expect(share(1, 3)).toBe(33.3);
  });
});
