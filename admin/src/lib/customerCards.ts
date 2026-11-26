// The six numbers on top of the Customers page, worked out from the count of customers in each status
// (GET /api/admin/customers/statuses). Pure, so it is unit tested. Every percentage is out of ALL the customers in the
// current slice, so the cards can be compared with each other.

export interface StatusCount { key: string; count: number }

/** Statuses that mean the customer asked for offers (sent an application), whatever came back. */
const ASKED = ['checking_offers', 'no_offers', 'offers_failed', 'offers_ready', 'applied', 'under_review', 'approved', 'lender_rejected', 'lender_failed', 'disbursed'];
/** Statuses that mean at least one lender made an offer. */
const GOT_OFFERS = ['offers_ready', 'applied', 'under_review', 'approved', 'lender_rejected', 'lender_failed', 'disbursed'];
/** Statuses that mean they went on and applied with a lender. */
const APPLIED_LENDER = ['applied', 'under_review', 'approved', 'lender_rejected', 'lender_failed', 'disbursed'];

export interface CustomerCards {
  total: number;
  askedOffers: number; askedOffersPct: number;
  gotOffers: number; gotOffersPct: number;
  noOffers: number; noOffersPct: number;
  appliedLender: number; appliedLenderPct: number;
  /** No lender offered a loan, or a lender turned the application down. */
  rejected: number; rejectedPct: number;
  lenderRejected: number;
}

/** Share of the total, to one decimal place; 0 when there is nobody. */
export function share(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

export function customerCards(counts: StatusCount[]): CustomerCards {
  const by = new Map(counts.map((c) => [c.key, Math.max(0, c.count || 0)]));
  const sum = (keys: string[]) => keys.reduce((s, k) => s + (by.get(k) ?? 0), 0);
  const total = [...by.values()].reduce((s, n) => s + n, 0);
  const askedOffers = sum(ASKED);
  const gotOffers = sum(GOT_OFFERS);
  const noOffers = by.get('no_offers') ?? 0;
  const appliedLender = sum(APPLIED_LENDER);
  const lenderRejected = by.get('lender_rejected') ?? 0;
  const rejected = noOffers + lenderRejected;
  return {
    total,
    askedOffers, askedOffersPct: share(askedOffers, total),
    gotOffers, gotOffersPct: share(gotOffers, total),
    noOffers, noOffersPct: share(noOffers, total),
    appliedLender, appliedLenderPct: share(appliedLender, total),
    rejected, rejectedPct: share(rejected, total),
    lenderRejected,
  };
}
