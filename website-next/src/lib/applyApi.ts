/**
 * Typed wrappers around the SAME `/api/users` and `/api/applications`
 * endpoints the mobile app uses (server/src/modules/{users,applications}.routes.ts)
 * — nothing new was added server-side for the application funnel itself, only
 * for login (see session.ts). Every call goes through authFetch, which
 * attaches the website's access token and silently refreshes it on expiry.
 */
import { authFetch, logout } from './session';
import {
  rememberOffers,
  upshotIdentifyServerUser,
  upshotOfferSelected,
  upshotOffersFetched,
  upshotPanVerified,
} from './upshot';

export interface Offer {
  id: string;
  amount: number;
  apr: number;
  emi: number;
  tenureMonths: number;
  processingFeeAmount: number | null;
  gstOnProcessingFee?: number | null;
  netDisbursalAmount: number | null;
  redirectionUrl: string | null;
  lenderName: string | null;
  lenderLogoUrl: string | null;
  recommended: boolean;
  // Real, backend-driven signals — mirrors offers.tsx's OfferCard exactly
  // (badgeText/recommended → the pill shown, offerLikelihood !== '0' → the
  // "High match" pill, lenderStatus → the applied-offer status label). These
  // were already returned by GET /:id/offers; this type just didn't expose
  // them, which is how the website ended up inventing a fake
  // `i === 0 ? 'High match' : 'Pending eligibility'` badge instead of using
  // the real thing.
  badgeText?: string | null;
  offerLikelihood?: string | null;
  lenderStatus?: string | null;
  applied?: boolean;
  selected?: boolean;
  partner?: { name: string } | null;
  emiOptions?: { id: string; tenureMonths: number; monthlyEmi: number }[];
}

/**
 * Lender-application statuses that mean "the lender has not confirmed the submission yet":
 * 'offers_ready' (the applicant tapped Apply — our own record, nothing reported by the lender)
 * and 'handoff' (the lender reports the journey started). 'handoff' is only ever set from the
 * lender's own report; our server never writes it. From 'under_review' on the lender has it.
 */
export const LENDER_PENDING_STATUSES = ['offers_ready', 'handoff'];
export function isLenderPending(status: string | null | undefined): boolean {
  return !!status && LENDER_PENDING_STATUSES.includes(status);
}

/**
 * The applicant tapped Apply (the offer is `applied`) but the lender has not confirmed it —
 * they opened the lender's page and came back without finishing (e.g. never entered the OTP).
 * They can resume the SAME lender page, so the offers list keeps these and shows "Re-apply".
 * Once the lender reports progress this turns false and the offer leaves the list as committed.
 */
export function offerNeedsReapply(o: Pick<Offer, 'applied' | 'lenderStatus' | 'redirectionUrl'>): boolean {
  return !!o.applied && isLenderPending(o.lenderStatus) && !!o.redirectionUrl;
}

export interface LoanApplication {
  id: string;
  ref: string;
  status: string;
  // Why prequalify landed on zero offers — a reason CODE ('not_eligible' | 'duplicate' |
  // 'technical'), never lender-written text; the offers page maps it to our own copy. Older rows may
  // hold a sentence, which is ignored. Null otherwise (offers exist, or prequalify hasn't run yet).
  prequalifyReason?: string | null;
  amount: number;
  tenureMonths: number;
  updatedAt: string;
  offers?: Offer[];
  loan?: { id: string } | null;
  lenderApplications?: {
    id: string;
    offerId?: string;
    status: string;
    lenderName: string | null;
    amount: number;
    apr: number | null;
    emi: number | null;
    tenureMonths: number | null;
    redirectionUrl: string | null;
    appliedAt: string;
    updatedAt?: string;
  }[];
  /** Partner (Yubi / YMPL) referrals the applicant proceeded with — each is a row in My Applications. */
  partnerReferrals?: {
    id: string;
    applicationId: string;
    appliedAt: string | null;
    appliedLender: string | null;
    lastStatus: string | null;
  }[];
}

export async function fetchMe() {
  const res = await authFetch('/api/website/auth/me');
  // A returning visitor (session restored from the cookie) never goes through OTP again.
  upshotIdentifyServerUser(res?.data?.user);
  return res;
}

/**
 * Short-lived proof that this browser session is signed in (i.e. passed the OTP), for the voice
 * agent to send back with its customer-lookup tools. Null when signed out or on any failure.
 */
export async function fetchLookupGrant(): Promise<string | null> {
  try {
    const res = await authFetch('/api/context/lookup-grant');
    const grant = res?.data?.grant;
    return typeof grant === 'string' && grant ? grant : null;
  } catch {
    return null;
  }
}

/**
 * DELETE /api/users/me — permanently erase the account. The reason is mandatory from the website and is
 * stored anonymously server-side. On success the local session is cleared too.
 */
export async function deleteAccount(input: { reason: string; details?: string }) {
  await authFetch('/api/users/me', { method: 'DELETE', body: JSON.stringify({ ...input, source: 'website' }) });
  await logout();
}

/** PATCH /api/users/me — the exact field set mobile's basic/moredetails/basicpan screens save. */
export async function patchProfile(patch: Record<string, unknown>) {
  const body = await authFetch('/api/users/me', { method: 'PATCH', body: JSON.stringify(patch) });
  // Name / email are only known after the About You step — push them so the Upshot profile isn't blank.
  upshotIdentifyServerUser(body.user);
  return body.user;
}

export async function createApplication(payload: {
  amount: number;
  tenureMonths?: number;
  purpose?: string;
  employment?: string;
  monthlyIncome?: number;
  residenceType?: string;
}) {
  const body = await authFetch('/api/applications', { method: 'POST', body: JSON.stringify(payload) });
  return body.application as LoanApplication;
}

export async function patchApplication(id: string, patch: { amount?: number; tenureMonths?: number; usePanOnFile?: boolean }) {
  const body = await authFetch(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return body.application as LoanApplication;
}

export async function getApplication(id: string) {
  const body = await authFetch(`/api/applications/${id}`);
  rememberOffers(body.application?.offers);
  return body.application as LoanApplication;
}

export async function listApplications() {
  const body = await authFetch('/api/applications');
  return body.applications as LoanApplication[];
}

export async function prequalify(id: string) {
  const body = await authFetch(`/api/applications/${id}/prequalify`, { method: 'POST' });
  upshotOffersFetched(body.offers);
  return body.offers as Offer[];
}

/**
 * Apply to a lender's offer — mirrors offers.tsx exactly: this single call
 * both records the per-lender application AND marks the offer `selected`, so
 * it covers the mock/fallback path's `/handoff` precondition too. The caller
 * branches on `offer.redirectionUrl` afterward to decide the next screen.
 */
export async function applyOffer(applicationId: string, offerId: string) {
  const body = await authFetch(`/api/applications/${applicationId}/offers/${offerId}/apply`, { method: 'POST' });
  // A repeat apply for the same lender+amount isn't a new selection.
  if (!body?.duplicate) upshotOfferSelected(offerId);
  return body as { lenderApplicationId?: string; duplicate?: boolean };
}

export async function reportLenderOutcome(
  applicationId: string,
  offerId: string,
  outcome: 'success' | 'failed' | 'error',
  reason?: string,
  lenderApplicationId?: string | null,
) {
  const path = outcome === 'success'
    ? `/api/applications/${applicationId}/offers/${offerId}/outcome`
    : `/api/applications/${applicationId}/offers/${offerId}/fail`;
  return authFetch(path, { method: 'POST', body: JSON.stringify({ outcome, reason, lenderApplicationId }) });
}

/** Mock/fallback path only (no redirectionUrl on the offer) — creates the loan instantly. */
export async function handoff(applicationId: string) {
  const body = await authFetch(`/api/applications/${applicationId}/handoff`, { method: 'POST' });
  return body.loan;
}

export async function patchNotifications(patch: { loanUpdates?: boolean; securityAlerts?: boolean; promoOffers?: boolean }) {
  const body = await authFetch('/api/users/me/notifications', { method: 'PATCH', body: JSON.stringify(patch) });
  return body.user;
}

export async function refreshApplicationStatus(applicationId: string, lenderApplicationId?: string | null) {
  // One LoanApplication can hold several lender applications (a different offer each) —
  // the server needs to know WHICH one, or it always queries the lender with no offer code.
  const body = await authFetch(`/api/applications/${applicationId}/refresh-status`, {
    method: 'POST',
    body: JSON.stringify({ lenderApplicationId: lenderApplicationId ?? undefined }),
  });
  // A failed lender call degrades server-side to "return what we already
  // knew" (see applications.routes.ts) rather than a thrown error — surface
  // that as a soft warning, not a broken page.
  return { application: body.application as LoanApplication, refreshError: body.refreshError as string | undefined };
}

/** What PAN Comprehensive returned for Step 2's pre-fill (all optional). */
export interface PanPrefill {
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dob?: string; // YYYY-MM-DD
  gender?: 'male' | 'female' | 'other';
  email?: string;
  /** Already masked by Aurix, e.g. 30XXXXXXXX00. */
  maskedAadhaar?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
}

export interface PanVerifyResult {
  status: 'verified' | 'invalid';
  verified: boolean;
  aadhaarLinked: boolean | null;
  prefill: PanPrefill;
  message?: string;
  source: 'cache' | 'aurix';
}

/**
 * Step 1: verify the PAN (server/src/lib/panVerification.ts). The server
 * answers from its own PAN cache when it has seen this PAN before, and only
 * then calls the paid Aurix PAN Comprehensive API — so calling this again for
 * the same PAN (back/forward, "Update details") costs nothing.
 */
export async function verifyPan(pan: string) {
  const body = await authFetch('/api/kyc/pan/verify', { method: 'POST', body: JSON.stringify({ pan }) });
  // Never the PAN itself — only that it verified.
  upshotPanVerified(body.data);
  return body.data as PanVerifyResult;
}

// ── Support tickets ──────────────────────────────────────────────────────────

export type TicketCategory = 'repayments' | 'documents' | 'privacy' | 'disbursement' | 'fees' | 'application' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface SupportTicket {
  id: string;
  /** Public reference, e.g. SL-T-00042. */
  ref: string;
  type: 'query' | 'grievance';
  category: TicketCategory;
  subject: string;
  body: string | null;
  status: TicketStatus;
  applicationId: string | null;
  /** Reply from the support team, once they've added one. */
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export async function listTickets(): Promise<SupportTicket[]> {
  const body = await authFetch('/api/support/tickets');
  return body.tickets as SupportTicket[];
}

export async function createTicket(payload: {
  type: 'query' | 'grievance';
  category: TicketCategory;
  subject: string;
  body: string;
  applicationId?: string;
}): Promise<SupportTicket> {
  const body = await authFetch('/api/support/tickets', { method: 'POST', body: JSON.stringify(payload) });
  return body.ticket as SupportTicket;
}
