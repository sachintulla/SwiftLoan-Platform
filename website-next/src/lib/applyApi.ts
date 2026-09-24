/**
 * Typed wrappers around the SAME `/api/users` and `/api/applications`
 * endpoints the mobile app uses (server/src/modules/{users,applications}.routes.ts)
 * — nothing new was added server-side for the application funnel itself, only
 * for login (see session.ts). Every call goes through authFetch, which
 * attaches the website's access token and silently refreshes it on expiry.
 */
import { authFetch } from './session';

export interface Offer {
  id: string;
  amount: number;
  apr: number;
  emi: number;
  tenureMonths: number;
  processingFeeAmount: number | null;
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

export interface LoanApplication {
  id: string;
  ref: string;
  status: string;
  amount: number;
  tenureMonths: number;
  updatedAt: string;
  offers?: Offer[];
  loan?: { id: string } | null;
  lenderApplications?: {
    id: string;
    status: string;
    lenderName: string | null;
    amount: number;
    apr: number | null;
    emi: number | null;
    tenureMonths: number | null;
    redirectionUrl: string | null;
    appliedAt: string;
  }[];
}

export async function fetchMe() {
  return authFetch('/api/website/auth/me');
}

/** PATCH /api/users/me — the exact field set mobile's basic/moredetails/basicpan screens save. */
export async function patchProfile(patch: Record<string, unknown>) {
  const body = await authFetch('/api/users/me', { method: 'PATCH', body: JSON.stringify(patch) });
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

export async function patchApplication(id: string, patch: { amount?: number; tenureMonths?: number; panNumber?: string }) {
  const body = await authFetch(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return body.application as LoanApplication;
}

export async function getApplication(id: string) {
  const body = await authFetch(`/api/applications/${id}`);
  return body.application as LoanApplication;
}

export async function listApplications() {
  const body = await authFetch('/api/applications');
  return body.applications as LoanApplication[];
}

export async function prequalify(id: string) {
  const body = await authFetch(`/api/applications/${id}/prequalify`, { method: 'POST' });
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

export async function refreshApplicationStatus(applicationId: string) {
  const body = await authFetch(`/api/applications/${applicationId}/refresh-status`, { method: 'POST' });
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
  return body.data as PanVerifyResult;
}
