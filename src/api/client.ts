import { saveTokens, clearTokens } from '../state/session';

/**
 * Typed client for the SwiftLoan backend (see /server).
 * Points at the deployed dev box (dev-api.swiftloan.ai) rather than a local
 * server — a physical device can't reach `localhost`/`10.0.2.2` anyway, and
 * this way testing doesn't depend on anyone having the local backend running.
 * Override with SWIFTLOAN_API_BASE (see index.js) for local-backend testing.
 */
export const API_BASE = (globalThis as any).SWIFTLOAN_API_BASE || 'http://dev-api.swiftloan.ai/api';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string | null, refresh?: string | null) {
  accessToken = access;
  if (refresh !== undefined) refreshToken = refresh;
  // Persisted so a returning user stays logged in across app restarts, not
  // just within one in-memory session.
  if (access && refreshToken) saveTokens({ accessToken: access, refreshToken });
  else if (!access) clearTokens();
}
export const getTokens = () => ({ accessToken, refreshToken });
export const isAuthed = () => !!accessToken;

/**
 * Request timeout. Without one, an unreachable host doesn't fail fast — it waits
 * for the TCP connect timeout (30s+). That bites hardest on a physical device,
 * where the default 10.0.2.2 is the *emulator's* host alias and simply isn't
 * routable. It also stops each fire-and-forget tracking call from holding a
 * socket open for 30s.
 */
const REQUEST_TIMEOUT_MS = 4000;

async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    // Normalize an abort into the same TypeError shape a network failure throws.
    if (e?.name === 'AbortError') throw new TypeError(`request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as any).error || res.statusText, data);
  return data as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

export interface PriorInquiry {
  productInterest: string | null;
  amount: number | null; // paise
  createdAt: string;
}

export interface AuthResult {
  user: Record<string, any>;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  /** Website leads matched to this phone number, oldest first. `[]` when none. */
  priorInquiries: PriorInquiry[];
}

// Admin-curated, pre-application eligibility catalog — see server's
// PreApprovedPlan model. Amounts are in paise.
export interface PreApprovedPlan {
  id: string;
  lenderName: string;
  logoUrl?: string | null;
  icon: string;
  exploreUrl?: string | null;
  badge?: string | null;
  maxAmount?: number | null;
  amountAtApproval: boolean;
  rateMin?: number | null;
  rateMax?: number | null;
  rateAtApproval: boolean;
  tenureMinMonths?: number | null;
  tenureMaxMonths?: number | null;
  tags: string[];
  displayOrder: number;
  active: boolean;
}

// A real per-application lender offer (distinct from PreApprovedPlan above,
// which is admin-curated marketing data). Amounts are plain rupees, matching
// LoanApplication/Offer's existing convention (not paise). Server-side this is
// produced by a LenderOfferProvider (mock today) — see server/src/lib/lenderOffers.ts.
export interface EmiOption {
  id: string;
  tenureMonths: number;
  monthlyEmi: number;
  totalInterestPayable: number;
  totalRepaymentAmount: number;
  recommended: boolean;
}

export interface Offer {
  id: string;
  partner: { name: string; icon: string; logoUrl?: string | null; rating?: number | null; rbiApproved: boolean; features: string[]; disbursalTimeHrs?: number | null };
  amount: number;
  apr: number;
  processingFeeAmount: number;
  gstOnProcessingFee: number;
  netDisbursalAmount: number;
  badgeText?: string | null;
  recommended: boolean;
  selected: boolean;
  emiOptions: EmiOption[];
}

export const api = {
  health: () => request('GET', '/health'),

  // Auth
  register: (phone: string, opts: { email?: string; password?: string; lang?: string } = {}) =>
    request('POST', '/auth/register', { phone, ...opts }),
  requestOtp: (phone: string) => request('POST', '/auth/otp/request', { phone }),
  verifyOtp: async (phone: string, code: string): Promise<AuthResult> => {
    // WS5: hand over the anonymous tracking session so the server can claim
    // everything done before login (install, app_opened, language) onto this
    // person's journey. Without it those steps are recorded but orphaned, and
    // the 360 timeline starts abruptly at "OTP verified".
    const r = await request<AuthResult>('POST', '/auth/otp/verify', {
      phone,
      code,
      session_id: getTrackingSessionId(),
    });
    setTokens(r.accessToken, r.refreshToken);
    return r;
  },
  login: async (identifier: string, password: string): Promise<AuthResult> => {
    const r = await request<AuthResult>('POST', '/auth/login', { identifier, password });
    setTokens(r.accessToken, r.refreshToken);
    return r;
  },
  logout: async () => {
    if (refreshToken) await request('POST', '/auth/logout', { refreshToken }).catch(() => {});
    setTokens(null, null);
  },

  // Users
  me: () => request('GET', '/users/me'),
  /** Right to erasure — irreversible, cascades every record tied to this user. */
  deleteAccount: () => request('DELETE', '/users/me'),
  updateProfile: (patch: Record<string, unknown>) => request('PATCH', '/users/me', patch),
  setLanguage: (lang: string) => request('PATCH', '/users/me/language', { lang }),
  setNotifications: (prefs: { loanUpdates?: boolean; securityAlerts?: boolean; promoOffers?: boolean }) =>
    request('PATCH', '/users/me/notifications', prefs),
  creditScore: () => request('GET', '/users/me/credit-score'),
  presignAvatarUpload: (contentType: 'image/jpeg' | 'image/png' | 'image/webp') =>
    request<{ uploadUrl: string; publicUrl: string }>('POST', '/users/me/avatar/presign', { contentType }),
  confirmAvatar: (avatarUrl: string) => request('PATCH', '/users/me/avatar', { avatarUrl }),

  // Application funnel
  createApplication: (payload: { amount: number; tenureMonths?: number; loanType?: string }) =>
    request('POST', '/applications', payload),
  listApplications: () => request('GET', '/applications'),
  getApplication: (id: string) => request('GET', `/applications/${id}`),
  updateApplication: (id: string, patch: Record<string, unknown>) => request('PATCH', `/applications/${id}`, patch),
  prequalify: (id: string) => request('POST', `/applications/${id}/prequalify`),
  selectOffer: (id: string, offerId: string, emiOptionId?: string) =>
    request('POST', `/applications/${id}/offers/${offerId}/select`, emiOptionId ? { emiOptionId } : undefined),
  handoff: (id: string) => request('POST', `/applications/${id}/handoff`),

  // KYC / loans / misc
  submitKyc: (method: 'aadhaar' | 'pan' | 'bank' | 'selfie', payload: Record<string, unknown> = {}) =>
    request('POST', `/kyc/${method}`, payload),
  listLoans: () => request('GET', '/loans'),
  getLoan: (id: string) => request('GET', `/loans/${id}`),
  payEmi: (loanId: string, repaymentId: string) => request('POST', `/loans/${loanId}/repayments/${repaymentId}/pay`),
  partners: () => request('GET', '/catalog/partners'),
  preApprovedPlans: (): Promise<{ data: PreApprovedPlan[] }> => request('GET', '/preapproved-plans'),
  emi: (amount: number, tenureMonths: number, rate: number) =>
    request('POST', '/tools/emi', { amount, tenureMonths, rate }),
  createTicket: (subject: string, type: 'query' | 'grievance' = 'query', body?: string) =>
    request('POST', '/support/tickets', { subject, type, body }),
};

// ─────────────────────────── WS4 activity tracking ───────────────────────────
// Fire-and-forget instrumentation feeding the admin dashboard's funnel/analytics.
// These NEVER throw and NEVER block the UI — every call is wrapped and swallowed.
//
// Tracking posts to the same deployed dev API as everything else by default,
// so events from a physical device reach the live dashboard. Override with
// (globalThis).SWIFTLOAN_TRACK_BASE for local testing, e.g. 'http://10.0.2.2:4000/api'.
export const TRACK_BASE: string =
  (globalThis as any).SWIFTLOAN_TRACK_BASE ||
  (globalThis as any).SWIFTLOAN_API_BASE ||
  'http://dev-api.swiftloan.ai/api';

let sessionId: string | null = null;
export const getSessionId = () => sessionId;

// Low-level fire-and-forget POST. Short timeout; errors are silently ignored.
function trackPost(path: string, body: Record<string, unknown>): Promise<any> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;
  return fetch(TRACK_BASE + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
    signal: ctrl ? ctrl.signal : undefined,
  })
    .then((r) => r.json().catch(() => ({})))
    .catch(() => ({}))
    .finally(() => { if (timer) clearTimeout(timer); });
}

export function trackSessionStart(deviceInfo: Record<string, unknown>): void {
  trackPost('/track/session/start', { device_info: deviceInfo }).then((r) => {
    const id = r?.data?.session_id ?? r?.session_id;
    if (id) sessionId = id;
  });
}

/**
 * The current anonymous tracking session id, if a session has started. Sent with
 * OTP verify so the server can attribute pre-login activity to the person who
 * just identified themselves.
 */
export function getTrackingSessionId(): string | null {
  return sessionId;
}

export function trackSessionEnd(pagesVisited?: number): void {
  if (!sessionId) return;
  trackPost('/track/session/end', { session_id: sessionId, pages_visited: pagesVisited });
}

/**
 * WS5: report the install once, on first launch. Nothing wrote AppDownload
 * before this, so install attribution ("did this person come from a campaign
 * link?") had no data at all. `contextToken` is the WS3 deep-link token when
 * the user arrived via a tracked link.
 */
export function trackInstall(
  platform: string,
  opts: { source?: string; campaignId?: string; referrer?: string; contextToken?: string } = {},
): void {
  trackPost('/track/install', {
    platform,
    source: opts.source ?? 'organic',
    campaign_id: opts.campaignId,
    referrer: opts.referrer,
    context_token: opts.contextToken,
    session_id: sessionId,
  });
}

export function trackEvent(
  eventType: string,
  eventName: string,
  screen?: string,
  metadata?: Record<string, unknown>,
): void {
  trackPost('/track/event', {
    event_type: eventType,
    event_name: eventName,
    screen,
    session_id: sessionId,
    metadata,
  });
}

export function trackOnboardingStep(
  stepNumber: number,
  stepName: string,
  status: 'started' | 'completed' | 'skipped' | 'abandoned' | 'failed',
  timeSpentSeconds = 0,
): void {
  trackPost('/track/onboarding/step', {
    step_number: stepNumber,
    step_name: stepName,
    status,
    time_spent_seconds: timeSpentSeconds,
    session_id: sessionId,
  });
}

/**
 * Upload a profile photo: presign a direct-to-S3 PUT URL, upload the file
 * bytes straight to S3 (never proxied through our server), then confirm the
 * final URL so it's saved on the user record. Returns the updated user.
 */
export async function uploadAvatar(
  fileUri: string,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<Record<string, any>> {
  const { uploadUrl, publicUrl } = await api.presignAvatarUpload(contentType);
  const fileRes = await fetch(fileUri);
  const blob = await fileRes.blob();
  // x-amz-acl must match exactly what the server signed (public-read) or S3
  // rejects the upload as a signature mismatch.
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType, 'x-amz-acl': 'public-read' },
    body: blob as any,
  });
  if (!putRes.ok) throw new Error(`Photo upload failed (${putRes.status})`);
  const { user }: any = await api.confirmAvatar(publicUrl);
  return user;
}

// WS3: resolve a context token (from an install deep link) into the saved
// journey — name, product, amount, and a ready-to-speak greeting. Returns null
// if the token is unknown/expired. Never throws.
export interface ContextPayload {
  token: string;
  name: string | null;
  city: string | null;
  product: string | null;
  amount: number | null; // paise
  summary: string | null;
  source: string;
  greeting: string;
}
export async function fetchContext(token: string): Promise<ContextPayload | null> {
  try {
    const res = await fetch(`${API_BASE}/context/${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return (json && json.data) ? (json.data as ContextPayload) : null;
  } catch {
    return null;
  }
}

export function trackLoanStep(
  loanId: string | null,
  stepName: string,
  status: string,
  timeSpentSeconds = 0,
  holdReason?: string,
): void {
  trackPost('/track/loan/step', {
    loan_id: loanId,
    step_name: stepName,
    status,
    time_spent_seconds: timeSpentSeconds,
    hold_reason: holdReason,
  });
}

/* ── WS8: what the backend already knows about the signed-in user ──────────
 *
 * The non-deep-link path. Someone fills the website form, takes our callback,
 * then installs from the Play Store — arriving with only a phone number. This
 * fetches their history so the in-app voice agent can continue the conversation
 * instead of greeting them as a stranger.
 *
 * Phone is taken from the access token server-side, never sent by us: passing a
 * number would make it an open lookup of anyone's loan history.
 */
export interface UserContextInquiry {
  product: string | null;
  amount: number | null; // paise
  amountLabel: string | null;
  city: string | null;
  summary: string | null;
  createdAt: string;
  source: string | null;
  campaign: string | null;
}

export interface UserContext {
  hasHistory: boolean;
  name: string | null;
  city: string | null;
  email: string | null;
  stage: string | null;
  stageLabel: string | null;
  nextAction: string | null;
  inquiries: UserContextInquiry[];
  lastCall: {
    at: string;
    outcome: string | null;
    outcomeSource: string | null;
    summary: string | null;
    answered: boolean;
    durationSec: number | null;
  } | null;
  application: {
    id: string; ref: string; status: string;
    amount: number | null; loanType: string | null; offerCount: number;
  } | null;
  loan: { id: string; principal: number | null; status: string | null } | null;
  /** One-line brief the agent can open from. */
  brief: string | null;
}

/**
 * Never throws and never blocks a screen: a missing context just means the agent
 * opens generically, which is exactly how the app behaved before this existed.
 */
export async function fetchUserContext(): Promise<UserContext | null> {
  if (!accessToken) return null;
  try {
    const json = await request<{ data?: UserContext }>('GET', '/context/me');
    const data = (json as any)?.data ?? json;
    return data && typeof data === 'object' && 'hasHistory' in data ? (data as UserContext) : null;
  } catch {
    return null;
  }
}
