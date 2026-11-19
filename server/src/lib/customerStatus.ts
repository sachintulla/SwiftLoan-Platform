/**
 * The customer's REAL status for the admin, read from stored data. Pure (no database, no network); tested in
 * customerStatus.test.ts. The database side is customerStatusDb.ts.
 *
 * Why not `Customer.currentStage`: that stage is moved by events and only ever forward, so one wrong event sticks for
 * good (2026-11-19: the lender's own PAN / bureau pushes had put 696 of 949 customers at "Application submitted";
 * about 105 had applied and 535 had been told "no offers"). It also has no word for "no offers found", the largest
 * group. This status is decided by what is stored, the same way the drop-off messages (dropoffSteps.ts) and the voice
 * agent's briefing (callSituation.ts) decide it, so the three agree.
 *
 * Order of evidence, strongest first:
 *   1. do-not-contact (`lost`), set by an admin or an opt-out: always shown.
 *   2. a lender application: the best state across every lender the person applied with.
 *   3. the person's MOST RECENT application: how its offers check ended.
 *   4. the account alone: PAN on file, or just a verified number.
 *   5. no account: the journey stage (website enquiry, called, app installed), or "account deleted" when the customer
 *      was linked to an account that no longer exists.
 */

export type StatusTone = 'green' | 'blue' | 'amber' | 'red' | 'grey' | 'teal';

export type CustomerStatusKey =
  | 'lead_captured' | 'contacted' | 'app_installed' | 'otp_pending'
  | 'otp_verified' | 'pan_verified' | 'filling_details' | 'checking_offers'
  | 'no_offers' | 'offers_failed' | 'offers_ready'
  | 'applied' | 'under_review' | 'approved' | 'lender_rejected' | 'lender_failed' | 'disbursed'
  | 'account_deleted' | 'lost';

/** Every status, in journey order. This list is what the admin's filter shows (GET /api/admin/customers/statuses). */
export const CUSTOMER_STATUSES: ReadonlyArray<{ key: CustomerStatusKey; label: string; tone: StatusTone }> = [
  { key: 'lead_captured', label: 'Lead submitted', tone: 'grey' },
  { key: 'contacted', label: 'Contacted by agent', tone: 'grey' },
  { key: 'app_installed', label: 'App installed', tone: 'grey' },
  { key: 'otp_pending', label: 'OTP not entered', tone: 'grey' },
  { key: 'otp_verified', label: 'OTP verified', tone: 'grey' },
  { key: 'pan_verified', label: 'PAN verified', tone: 'amber' },
  { key: 'filling_details', label: 'Filling details', tone: 'amber' },
  { key: 'checking_offers', label: 'Checking offers', tone: 'amber' },
  { key: 'no_offers', label: 'No offers found', tone: 'red' },
  { key: 'offers_failed', label: 'Offers check failed', tone: 'red' },
  { key: 'offers_ready', label: 'Offers ready, not applied', tone: 'blue' },
  { key: 'applied', label: 'Applied with a lender', tone: 'teal' },
  { key: 'under_review', label: 'Under review at lender', tone: 'blue' },
  { key: 'approved', label: 'Approved', tone: 'green' },
  { key: 'lender_rejected', label: 'Rejected by lender', tone: 'red' },
  { key: 'lender_failed', label: 'Lender application failed', tone: 'red' },
  { key: 'disbursed', label: 'Disbursed', tone: 'green' },
  { key: 'account_deleted', label: 'Account deleted', tone: 'grey' },
  { key: 'lost', label: 'Lost', tone: 'red' },
];

const BY_KEY = new Map(CUSTOMER_STATUSES.map((s) => [s.key, s]));

export function isCustomerStatusKey(v: unknown): v is CustomerStatusKey {
  return typeof v === 'string' && BY_KEY.has(v as CustomerStatusKey);
}

export interface CustomerStatus {
  key: CustomerStatusKey;
  label: string;
  tone: StatusTone;
  /** A few words of context for the admin (lender name, why no offers, how many offers). Null when there is none. */
  detail: string | null;
}

export interface LenderApplicationFact {
  /** LenderApplication.status */
  status: string;
  lenderName: string | null;
}

export interface CustomerFacts {
  /** Customer.currentStage: used only for do-not-contact and for people with no account. */
  stage: string;
  /** True when the customer was linked to an account that has since been deleted: nothing about it is stored any more. */
  accountDeleted?: boolean;
  /** The account behind the customer, if any. */
  account: null | {
    phoneVerified: boolean;
    panOnFile: boolean;
    /** The person's most recent application, if any. */
    application: null | { status: string; prequalifyReason: string | null; offerCount: number };
    /** Every lender application the person has, across all their applications. */
    lenderApplications: LenderApplicationFact[];
  };
}

function make(key: CustomerStatusKey, detail: string | null = null): CustomerStatus {
  const s = BY_KEY.get(key)!;
  return { key, label: s.label, tone: s.tone, detail };
}

/** How far a lender application has got; the furthest one decides the status. */
const LENDER_RANK: Record<string, { key: CustomerStatusKey; rank: number }> = {
  disbursed: { key: 'disbursed', rank: 6 },
  closed: { key: 'disbursed', rank: 6 },
  approved: { key: 'approved', rank: 5 },
  under_review: { key: 'under_review', rank: 4 },
  rejected: { key: 'lender_rejected', rank: 2 },
  failed: { key: 'lender_failed', rank: 1 },
};
/** Any other state (handoff, offers_ready, …) means "they tapped Apply and the lender has not said more". */
const JUST_APPLIED = { key: 'applied' as CustomerStatusKey, rank: 3 };

function fromLenderApplications(list: LenderApplicationFact[]): CustomerStatus | null {
  if (!list.length) return null;
  let best = { ...(LENDER_RANK[list[0].status] ?? JUST_APPLIED), name: list[0].lenderName };
  for (const la of list.slice(1)) {
    const r = LENDER_RANK[la.status] ?? JUST_APPLIED;
    if (r.rank > best.rank) best = { ...r, name: la.lenderName };
  }
  const lenders = new Set(list.map((l) => (l.lenderName ?? '').trim()).filter(Boolean));
  const name = (best.name ?? '').trim();
  const others = name ? lenders.size - 1 : lenders.size;
  const detail = name ? (others > 0 ? `${name} +${others} more` : name) : null;
  return make(best.key, detail);
}

/** Why the offers check found nothing, in the admin's words. Admin only: never shown to a customer. */
export function noOffersReasonLabel(reason: string | null | undefined): string | null {
  const r = (reason ?? '').trim().toLowerCase();
  if (!r) return null;
  if (r === 'not_eligible') return 'Not eligible';
  if (r === 'duplicate') return 'Already registered with the lender';
  if (r === 'technical') return 'Technical error';
  return r.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const DETAILS_STATES = new Set(['draft', 'pan_pending']);
/** States a lender push can leave on an application that never reached a lender (its offers check was still running). */
const CHECKING_STATES = new Set(['prequalifying', 'under_review', 'handoff']);

function fromApplication(a: NonNullable<NonNullable<CustomerFacts['account']>['application']>): CustomerStatus | null {
  const reason = (a.prequalifyReason ?? '').trim().toLowerCase();
  if (a.status === 'offers_ready') {
    // "offers_ready" with no offers should not happen; say nothing rather than claim offers that are not there.
    return a.offerCount > 0 ? make('offers_ready', `${a.offerCount} ${a.offerCount === 1 ? 'offer' : 'offers'}`) : null;
  }
  if (a.status === 'rejected') return make('no_offers', noOffersReasonLabel(reason) ?? null);
  // "Number already registered with the lender" is stored as failed + duplicate: not a decline, but still no offers.
  if (a.status === 'failed') return reason === 'duplicate' ? make('no_offers', noOffersReasonLabel(reason)) : make('offers_failed', noOffersReasonLabel(reason));
  if (a.status === 'approved') return make('approved');
  if (a.status === 'disbursed' || a.status === 'closed') return make('disbursed');
  if (CHECKING_STATES.has(a.status)) {
    // The check already answered "no" and a later lender push changed only the state: still no offers.
    if (reason === 'not_eligible' || reason === 'duplicate') return make('no_offers', noOffersReasonLabel(reason));
    return make('checking_offers');
  }
  if (DETAILS_STATES.has(a.status)) return make('filling_details');
  return null;
}

/** Stages that describe someone who has no account yet. */
const PRE_ACCOUNT_STAGES = new Set<string>(['lead_captured', 'contacted', 'app_installed']);

export function deriveCustomerStatus(f: CustomerFacts): CustomerStatus {
  if (f.stage === 'lost') return make('lost');
  const acc = f.account;
  if (!acc) {
    if (f.accountDeleted) return make('account_deleted');
    return make(PRE_ACCOUNT_STAGES.has(f.stage) ? (f.stage as CustomerStatusKey) : 'lead_captured');
  }

  const lender = fromLenderApplications(acc.lenderApplications);
  if (lender) return lender;
  const application = acc.application ? fromApplication(acc.application) : null;
  if (application) return application;
  if (acc.panOnFile) return make('pan_verified');
  if (acc.phoneVerified) return make('otp_verified');
  // An account row exists from the moment an OTP is requested; until the code is entered the number is unproven.
  return make('otp_pending');
}
