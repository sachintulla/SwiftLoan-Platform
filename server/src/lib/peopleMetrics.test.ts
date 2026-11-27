import { describe, it, expect } from 'vitest';
import { METRIC_STATUSES, METRIC_LABELS, peopleMetrics, share } from './peopleMetrics.js';
import { CUSTOMER_STATUSES } from './customerStatus.js';

// People in each customer status, live prod on 27 Nov 2026.
const PEOPLE = { no_offers: 1540, otp_verified: 288, applied: 162, under_review: 97, offers_ready: 70, filling_details: 43, pan_verified: 36, lender_rejected: 8, lender_failed: 6, offers_failed: 2, checking_offers: 1 };

describe('peopleMetrics', () => {
  it('counts people once, with every percentage out of people who checked eligibility', () => {
    const m = peopleMetrics(PEOPLE);
    expect(m.total).toBe(2253);
    expect([m.checked, m.gotOffers, m.noOffers, m.tappedApply, m.appliedLender, m.rejected]).toEqual([1886, 343, 1540, 168, 105, 8]);
    expect([m.gotOffersPct, m.noOffersPct, m.tappedApplyPct, m.appliedLenderPct, m.rejectedPct]).toEqual([18.2, 81.7, 8.9, 5.6, 0.4]);
    expect(m.checkedPct).toBe(83.7); // the one share that is out of everyone
  });

  it('"rejected" is only a lender turning an application down: no offers is never added to it', () => {
    const m = peopleMetrics({ no_offers: 500, lender_rejected: 3 });
    expect(m.rejected).toBe(3);
    expect(m.noOffers).toBe(500);
    expect(METRIC_STATUSES.rejected).toEqual(['lender_rejected']);
    expect(METRIC_STATUSES.noOffers).toEqual(['no_offers']);
  });

  it('a tap on Apply is not an application with a lender until the lender confirms it', () => {
    const m = peopleMetrics({ applied: 10, lender_failed: 2, under_review: 4, lender_rejected: 1 });
    expect(m.tappedApply).toBe(12);
    expect(m.appliedLender).toBe(5);
    expect(METRIC_STATUSES.appliedLender as readonly string[]).not.toContain('applied');
  });

  it('the groups fit inside each other, so no number can pass the one it is part of', () => {
    const inside = (a: readonly string[], b: readonly string[]) => a.every((k) => b.includes(k));
    expect(inside(METRIC_STATUSES.gotOffers, METRIC_STATUSES.checked)).toBe(true);
    expect(inside(METRIC_STATUSES.noOffers, METRIC_STATUSES.checked)).toBe(true);
    expect(inside(METRIC_STATUSES.tappedApply, METRIC_STATUSES.gotOffers)).toBe(true);
    expect(inside(METRIC_STATUSES.appliedLender, METRIC_STATUSES.gotOffers)).toBe(true);
    expect(inside(METRIC_STATUSES.rejected, METRIC_STATUSES.appliedLender)).toBe(true);
    // Nobody is both "no offers" and "got offers", or both "tapped Apply" and "applied with a lender".
    expect(METRIC_STATUSES.noOffers.some((k) => (METRIC_STATUSES.gotOffers as readonly string[]).includes(k))).toBe(false);
    expect(METRIC_STATUSES.tappedApply.some((k) => (METRIC_STATUSES.appliedLender as readonly string[]).includes(k))).toBe(false);
    // Got offers = offers waiting + tapped Apply + applied with a lender, exactly.
    const m = peopleMetrics(PEOPLE);
    expect(m.gotOffers).toBe(PEOPLE.offers_ready + m.tappedApply + m.appliedLender);
  });

  it('uses only real customer statuses, and has a label for every number', () => {
    const real = CUSTOMER_STATUSES.map((s) => s.key as string);
    for (const [name, keys] of Object.entries(METRIC_STATUSES)) {
      for (const k of keys) expect(real, `${name} uses unknown status ${k}`).toContain(k);
      expect(METRIC_LABELS[name as keyof typeof METRIC_LABELS]).toBeTruthy();
    }
  });

  it('counts approved and disbursed people, and they are part of "applied with a lender"', () => {
    const m = peopleMetrics({ no_offers: 10, under_review: 5, approved: 2, disbursed: 1 });
    expect([m.approved, m.disbursed, m.appliedLender, m.gotOffers, m.checked]).toEqual([2, 1, 8, 8, 18]);
  });

  it('is all zeros with nobody, and ignores bad counts', () => {
    const m = peopleMetrics({});
    expect([m.total, m.checked, m.gotOffersPct, m.rejectedPct]).toEqual([0, 0, 0, 0]);
    expect(peopleMetrics({ no_offers: -5, offers_ready: NaN as unknown as number }).checked).toBe(0);
    expect(share(1, 3)).toBe(33.3);
    expect(share(5, 0)).toBe(0);
  });
});
