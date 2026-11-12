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
  submitted: ['handoff'],
  inReview: ['under_review'],
  approved: ['approved', 'disbursed', 'closed'],
  rejected: ['rejected', 'failed'],
} as const;

export type ConversionKey = keyof typeof CONVERSION_STATUSES;
export const CONVERSION_KEYS = Object.keys(CONVERSION_STATUSES) as ConversionKey[];

export interface ConversionBuckets { submitted: number; inReview: number; approved: number; rejected: number }

/** Sum the status→count map into the four mutually-exclusive conversion buckets. */
export function bucketConversions(byStatus: Record<string, number>): ConversionBuckets {
  const sum = (keys: readonly string[]) => keys.reduce((n, k) => n + (byStatus[k] ?? 0), 0);
  return {
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

/** Each bucket paired with its percentage of the base (total customers). */
export function conversionsWithPct(byStatus: Record<string, number>, base: number) {
  const b = bucketConversions(byStatus);
  const withPct = (n: number) => ({ count: n, pct: pct(n, base) });
  return {
    submitted: withPct(b.submitted),
    inReview: withPct(b.inReview),
    approved: withPct(b.approved),
    rejected: withPct(b.rejected),
  };
}
