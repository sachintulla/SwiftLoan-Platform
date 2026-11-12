/**
 * Pure conversion-bucket rules for the admin "Conversions & Commercials"
 * analytics (the Analytics page + the summary strips on Loan Pipeline / Yubi /
 * Revasure). Kept pure so the mapping and percentages are covered by
 * conversions.test.ts without a database.
 *
 * The four buckets the dashboard reports, mapped onto ApplicationStatus. They are
 * mutually exclusive, so counts never double-count a single application:
 *   • Application submitted → handoff (submitted to the lender, not yet reviewed)
 *   • In review            → under_review
 *   • Approved             → approved + disbursed + closed (approved or beyond)
 *   • Rejected             → rejected + failed
 * draft / pan_pending / prequalifying / offers_ready are pre-submission and are
 * not conversions.
 */
export const CONVERSION_STATUSES = {
  // Started an application but not yet submitted to a lender.
  inProgress: ['draft', 'pan_pending', 'prequalifying', 'offers_ready'],
  submitted: ['handoff'],
  inReview: ['under_review'],
  approved: ['approved', 'disbursed', 'closed'],
  rejected: ['rejected', 'failed'],
} as const;

export type ConversionKey = keyof typeof CONVERSION_STATUSES;
export const CONVERSION_KEYS = Object.keys(CONVERSION_STATUSES) as ConversionKey[];

export interface ConversionBuckets { inProgress: number; submitted: number; inReview: number; approved: number; rejected: number }

/** Sum the status→count map into the mutually-exclusive conversion buckets. Together they cover every application status, so the buckets always reconcile to the total. */
export function bucketConversions(byStatus: Record<string, number>): ConversionBuckets {
  const sum = (keys: readonly string[]) => keys.reduce((n, k) => n + (byStatus[k] ?? 0), 0);
  return {
    inProgress: sum(CONVERSION_STATUSES.inProgress),
    submitted: sum(CONVERSION_STATUSES.submitted),
    inReview: sum(CONVERSION_STATUSES.inReview),
    approved: sum(CONVERSION_STATUSES.approved),
    rejected: sum(CONVERSION_STATUSES.rejected),
  };
}

/** Whole-number percentage of `part` over `whole`; 0 when the base is 0 (never NaN/∞). */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** The ApplicationStatus set behind a conversion bucket, or null for a non-application bucket (all/customers/leads/unknown). */
export function statusesForBucket(bucket: string): readonly string[] | null {
  return bucket in CONVERSION_STATUSES ? CONVERSION_STATUSES[bucket as ConversionKey] : null;
}

/** Each bucket paired with its percentage of the base. */
export function conversionsWithPct(byStatus: Record<string, number>, base: number) {
  const b = bucketConversions(byStatus);
  const withPct = (n: number) => ({ count: n, pct: pct(n, base) });
  return {
    inProgress: withPct(b.inProgress),
    submitted: withPct(b.submitted),
    inReview: withPct(b.inReview),
    approved: withPct(b.approved),
    rejected: withPct(b.rejected),
  };
}

/**
 * Each bucket with its count, its % of the base, AND the total application worth
 * in that bucket (Σ LoanApplication.amount). `byCount` and `byAmount` are both
 * status→number maps (counts and rupee sums respectively), bucketed the same way.
 *
 * `base` is the TOTAL APPLICATIONS in the range, so count ÷ base = the shown %
 * and the buckets reconcile to the total (the five buckets partition every
 * application status exactly once).
 */
export function conversionsDetailed(byCount: Record<string, number>, byAmount: Record<string, number>, base: number) {
  const c = bucketConversions(byCount);
  const a = bucketConversions(byAmount);
  const make = (k: ConversionKey) => ({ count: c[k], pct: pct(c[k], base), amount: a[k] });
  return {
    inProgress: make('inProgress'),
    submitted: make('submitted'),
    inReview: make('inReview'),
    approved: make('approved'),
    rejected: make('rejected'),
  };
}
