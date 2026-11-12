import { describe, it, expect } from 'vitest';
import { bucketConversions, conversionsWithPct, conversionsDetailed, pct } from './conversions.js';

const byStatus = {
  draft: 5, pan_pending: 2, prequalifying: 1, offers_ready: 3,
  handoff: 4, under_review: 6, approved: 7, disbursed: 2, closed: 1, rejected: 3, failed: 1,
};

describe('bucketConversions', () => {
  it('maps statuses into mutually-exclusive buckets that reconcile to the total', () => {
    expect(bucketConversions(byStatus)).toEqual({
      inProgress: 5 + 2 + 1 + 3,    // draft + pan_pending + prequalifying + offers_ready
      submitted: 4,                 // handoff
      inReview: 6,                  // under_review
      approved: 7 + 2 + 1,          // approved + disbursed + closed
      rejected: 3,                  // rejected (genuine decline only)
      failed: 1,                    // failed (technical) — now its own bucket
    });
    const b = bucketConversions(byStatus);
    const total = Object.values(byStatus).reduce((n, v) => n + v, 0);
    expect(b.inProgress + b.submitted + b.inReview + b.approved + b.rejected + b.failed).toBe(total);
  });
  it('is zero for an empty map', () => {
    expect(bucketConversions({})).toEqual({ inProgress: 0, submitted: 0, inReview: 0, approved: 0, rejected: 0, failed: 0 });
  });
});

describe('pct', () => {
  it('rounds and guards a zero base', () => {
    expect(pct(10, 40)).toBe(25);
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe('conversionsWithPct', () => {
  it('pairs each bucket with its percentage of the base', () => {
    const r = conversionsWithPct(byStatus, 100);
    expect(r.approved).toEqual({ count: 10, pct: 10 });
    expect(r.rejected).toEqual({ count: 3, pct: 3 });
    expect(r.failed).toEqual({ count: 1, pct: 1 });
    expect(r.submitted).toEqual({ count: 4, pct: 4 });
    expect(r.inReview).toEqual({ count: 6, pct: 6 });
    expect(r.inProgress).toEqual({ count: 11, pct: 11 });
  });
});

describe('conversionsDetailed', () => {
  const byAmount = {
    handoff: 400000, under_review: 600000, approved: 700000, disbursed: 200000, closed: 100000, rejected: 300000, failed: 100000,
  };
  it('adds the application worth (Σ amount) to each bucket', () => {
    const r = conversionsDetailed(byStatus, byAmount, 100);
    expect(r.submitted).toEqual({ count: 4, pct: 4, amount: 400000 });
    expect(r.inReview).toEqual({ count: 6, pct: 6, amount: 600000 });
    expect(r.approved).toEqual({ count: 10, pct: 10, amount: 700000 + 200000 + 100000 });
    expect(r.rejected).toEqual({ count: 3, pct: 3, amount: 300000 });
    expect(r.failed).toEqual({ count: 1, pct: 1, amount: 100000 });
    expect(r.inProgress).toEqual({ count: 11, pct: 11, amount: 0 });
  });
});
