import { describe, it, expect } from 'vitest';
import { bucketConversions, conversionsWithPct, conversionsDetailed, pct } from './conversions.js';

const byStatus = {
  draft: 5, pan_pending: 2, prequalifying: 1, offers_ready: 3,
  handoff: 4, under_review: 6, approved: 7, disbursed: 2, closed: 1, rejected: 3, failed: 1,
};

describe('bucketConversions', () => {
  it('maps statuses into four mutually-exclusive buckets', () => {
    expect(bucketConversions(byStatus)).toEqual({
      submitted: 4,                 // handoff
      inReview: 6,                  // under_review
      approved: 7 + 2 + 1,          // approved + disbursed + closed
      rejected: 3 + 1,              // rejected + failed
    });
  });
  it('is zero for an empty map', () => {
    expect(bucketConversions({})).toEqual({ submitted: 0, inReview: 0, approved: 0, rejected: 0 });
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
    expect(r.rejected).toEqual({ count: 4, pct: 4 });
    expect(r.submitted).toEqual({ count: 4, pct: 4 });
    expect(r.inReview).toEqual({ count: 6, pct: 6 });
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
    expect(r.rejected).toEqual({ count: 4, pct: 4, amount: 300000 + 100000 });
  });
});
