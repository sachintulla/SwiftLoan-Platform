/**
 * THE counting rules for the admin (owner's decision, 2026-11-27): every page that shows "got offers", "no offers",
 * "applied", "rejected" reads them from here, so the Dashboard, the Customers page, the lender chart and the daily
 * Slack message cannot disagree. Pure (no database); tested in peopleMetrics.test.ts. Database side: peopleMetricsDb.ts.
 *
 * Rules:
 *   1. PEOPLE are counted, once each. A person is in exactly one status (lib/customerStatus.ts), so the groups below
 *      never overlap in a way that double counts and never exceed the total.
 *   2. The words mean one thing everywhere:
 *        Checked eligibility   asked for offers (sent an application). Never called "applied".
 *        Got offers            at least one lender made an offer.
 *        No offers             the eligibility check found none. Never called "rejected".
 *        Tapped Apply          opened a lender's page; the lender has not confirmed an application.
 *        Applied with a lender the lender confirmed the application (it is under review or further).
 *        Rejected              a lender turned down an application the customer made. Nothing else.
 *        Approved / Disbursed  a lender said yes / paid the loan out. Lenders reached through Yubi count too
 *                              (Yubi reports decisions; the Aurix lenders do not yet): lib/yubiStatus.ts.
 *   3. Every percentage is out of the people who checked eligibility (`checked`), except `checkedPct`, which is out
 *      of everyone in the slice.
 */
import type { CustomerStatusKey } from './customerStatus.js';

/** Which statuses each word covers. The single source: no page keeps its own list. */
export const METRIC_STATUSES = {
  checked: ['checking_offers', 'no_offers', 'offers_failed', 'offers_ready', 'applied', 'lender_failed', 'under_review', 'approved', 'lender_rejected', 'disbursed'],
  gotOffers: ['offers_ready', 'applied', 'lender_failed', 'under_review', 'approved', 'lender_rejected', 'disbursed'],
  noOffers: ['no_offers'],
  tappedApply: ['applied', 'lender_failed'],
  appliedLender: ['under_review', 'approved', 'lender_rejected', 'disbursed'],
  rejected: ['lender_rejected'],
  approved: ['approved'],
  disbursed: ['disbursed'],
} as const satisfies Record<string, readonly CustomerStatusKey[]>;

export type MetricKey = keyof typeof METRIC_STATUSES;

/** The words shown in the admin for each number. */
export const METRIC_LABELS: Record<MetricKey, string> = {
  checked: 'Checked eligibility',
  gotOffers: 'Got offers',
  noOffers: 'No offers',
  tappedApply: 'Tapped Apply, not confirmed',
  appliedLender: 'Applied with a lender',
  rejected: 'Rejected by a lender',
  approved: 'Approved by a lender',
  disbursed: 'Disbursed',
};

export interface PeopleMetrics {
  /** Everyone in the slice. */
  total: number;
  checked: number; checkedPct: number;
  gotOffers: number; gotOffersPct: number;
  noOffers: number; noOffersPct: number;
  tappedApply: number; tappedApplyPct: number;
  appliedLender: number; appliedLenderPct: number;
  rejected: number; rejectedPct: number;
  /** A lender said yes and the money is not out yet / the loan was paid out (Aurix lenders or through Yubi). */
  approved: number;
  disbursed: number;
}

/** Share to one decimal place; 0 when there is nobody to divide by. */
export function share(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 1000) / 10 : 0;
}

/** The numbers, from how many people are in each customer status. */
export function peopleMetrics(counts: Record<string, number>): PeopleMetrics {
  const n = (k: string) => Math.max(0, Math.floor(counts[k] || 0));
  const sum = (keys: readonly string[]) => keys.reduce((s, k) => s + n(k), 0);
  const total = Object.keys(counts).reduce((s, k) => s + n(k), 0);
  const checked = sum(METRIC_STATUSES.checked);
  const of = (keys: readonly string[]) => { const v = sum(keys); return [v, share(v, checked)] as const; };
  const [gotOffers, gotOffersPct] = of(METRIC_STATUSES.gotOffers);
  const [noOffers, noOffersPct] = of(METRIC_STATUSES.noOffers);
  const [tappedApply, tappedApplyPct] = of(METRIC_STATUSES.tappedApply);
  const [appliedLender, appliedLenderPct] = of(METRIC_STATUSES.appliedLender);
  const [rejected, rejectedPct] = of(METRIC_STATUSES.rejected);
  return {
    total,
    checked, checkedPct: share(checked, total),
    gotOffers, gotOffersPct, noOffers, noOffersPct, tappedApply, tappedApplyPct, appliedLender, appliedLenderPct, rejected, rejectedPct,
    approved: sum(METRIC_STATUSES.approved), disbursed: sum(METRIC_STATUSES.disbursed),
  };
}
