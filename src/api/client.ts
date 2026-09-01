import NetInfo from '@react-native-community/netinfo';
import { saveTokens, clearTokens, clearOffersCache } from '../state/session';
import { reportOfflineAttempt } from '../state/offlineBridge';

/**
 * Typed client for the SwiftLoan backend (see /server).
 * Points at the deployed dev box (dev-api.swiftloan.ai) rather than a local
 * server — a physical device can't reach `localhost`/`10.0.2.2` anyway, and
 * this way testing doesn't depend on anyone having the local backend running.
 * Override with SWIFTLOAN_API_BASE (see index.js) for local-backend testing.
 */
export const API_BASE = (globalThis as any).SWIFTLOAN_API_BASE || 'https://dev-api.swiftloan.ai/api';

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

// Auto-refresh: the access token is short-lived (~15 min). On a 401 we exchange
// the stored refresh token for a fresh access token and retry the request once,
// so a user who lingers on a screen (e.g. filling the details form) never sees
// an "invalid/expired token" error. Concurrent 401s share one in-flight refresh.
let refreshInFlight: Promise<boolean> | null = null;
async function doRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    if (data?.accessToken) {
      setTokens(data.accessToken, refreshToken); // refresh token is not rotated server-side
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

/**
 * Request timeout. Without one, an unreachable host doesn't fail fast — it waits
 * for the TCP connect timeout (30s+), and each fire-and-forget tracking call
 * holds a socket open that whole time.
 *
 * Kept well under 30s so we still fail fast, but generous enough for real
 * mobile networks + occasional backend cold-starts: at 4s, user-initiated GETs
 * like /users/me intermittently aborted on cellular and surfaced a spurious
 * "please try again" screen even though the server responded fine. Per-call
 * overrides (e.g. prequalify's 45s) still apply via request()'s timeoutMs arg.
 */
const REQUEST_TIMEOUT_MS = 12000;

async function request<T = any>(method: string, path: string, body?: unknown, _retried = false, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    // Checked before dialing out, not after: this is the one place every
    // user-facing screen (OTP, application, offers, loans…) goes through, so
    // catching "no signal" here means those screens fail fast with a clear
    // reason instead of sitting on a spinner for the full request timeout.
    const netState = await NetInfo.fetch();
    if (netState.isConnected === false || netState.isInternetReachable === false) {
      throw new TypeError('offline: no internet connection');
    }
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
    // The fetch itself failed to reach anything — as opposed to reaching the
    // server and getting back an error response, which is handled below and
    // isn't a connectivity problem. Surface it to OfflineNotice so a feature
    // that needed the internet visibly tells the user why it didn't work,
    // even on the (real, observed) case where NetInfo still reports "online".
    reportOfflineAttempt();
    // Normalize an abort into the same TypeError shape a network failure throws.
    if (e?.name === 'AbortError') throw new TypeError(`request timed out after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Access token expired → refresh once and retry transparently. Skip for the
    // auth endpoints themselves (they mint/rotate tokens) to avoid loops.
    if (res.status === 401 && !_retried && refreshToken && !path.startsWith('/auth/')) {
      const refreshed = await refreshOnce();
      if (refreshed) return request<T>(method, path, body, true, timeoutMs);
      setTokens(null, null); // refresh failed — session is truly gone
    }
    throw new ApiError(res.status, (data as any).error || res.statusText, data);
  }
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

// Admin-curated catalog of market-available loan offers shown on the dashboard
// (no PAN, no credit pull) — see server's MarketLoanOffer model. Distinct from
// the personalised/eligible Offer results returned per application. Amounts in paise.
export interface MarketLoanOffer {
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

// A firm, global "pre-approved for you" offer — shown at the top of Home the
// moment the user logs in, independent of the application funnel. Distinct from
// MarketLoanOffer (soft marketing catalog, ranges): firm economics, and its
// Accept path skips eligibility and hands off to the lender. Amounts in paise.
export interface PrequalifyingOffer {
  id: string;
  lenderName: string;
  logoUrl?: string | null;
  icon: string;
  badge?: string | null;
  amount: number; // paise
  rate: number; // % p.a.
  tenureMonths: number;
  processingFeePercent?: number | null;
  redirectionUrl?: string | null;
  terms?: string | null;
  validTill?: string | null;
  displayOrder: number;
  active: boolean;
}

// A real per-application lender offer (distinct from MarketLoanOffer above,
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
  // Aurix (Knight Fintech) passthrough — present on real partner-lender offers,
  // null on the mock provider. The real lender's own name/logo, ROI and the
  // deep link to complete the application on the lender's page.
  lenderName?: string | null;
  lenderLogoUrl?: string | null;
  roi?: number | null;
  offerType?: string | null;
  offerLikelihood?: string | null;
  redirectionUrl?: string | null;
  externalPartnerId?: string | null;
  // Per-lender application tracking. `applied` once the user applies to this
  // lender's offer; `lenderStatus` is that lender application's own status,
  // advanced by KFT status webhooks (independent of the parent application).
  applied?: boolean;
  appliedAt?: string | null;
  lenderStatus?: string | null;
  kftApplicationId?: string | null;
}

// One tracked application to a lender. Each "Apply" creates a new one, so the
// same lender can appear multiple times in My Loans, each with its own status.
// Included on each application by GET /applications (newest first).
export interface LenderApplication {
  id: string;
  applicationId: string;
  offerId: string;
  lenderName?: string | null;
  lenderLogoUrl?: string | null;
  amount: number;
  apr?: number | null;
  emi?: number | null;
  tenureMonths?: number | null;
  processingFeeAmount: number;
  redirectionUrl?: string | null;
  status: string; // handoff | under_review | approved | rejected | disbursed | failed | …
  appliedAt: string;
  underReviewAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  disbursedAt?: string | null;
  failureReason?: string | null;
}

/**
 * Surface the offer API's OWN message when a prequalify run returns no offers,
 * shown to the user verbatim (no hardcoded rephrasing) so testers/users see
 * exactly what the lender (Aurix) API responded with. Returns '' when offers
 * exist, or when there's genuinely no message/error to show (the offers screen
 * then falls back to its generic "no offers" empty state).
 * `aurixResponse` shape: { httpStatus, response: { Meta, Data } | { Result: { Meta } } }.
 */
export function friendlyAurixError(aurixResponse: any, offerCount: number): string {
  if (offerCount > 0) return '';
  const r = aurixResponse?.response ?? {};
  const meta = r.Meta ?? r.Result?.Meta ?? {};
  // The API's own message, verbatim.
  const msg = String(meta.Message ?? meta.message ?? r.Message ?? r.message ?? r.error ?? '').trim();
  if (msg) return msg;
  // No message but the call failed — surface why. httpStatus 0 is a
  // client-side timeout/network failure (confirmed live: a 30s Aurix
  // timeout), not an HTTP response at all, so it needs its own check —
  // 0 is not >= 400, and without this it silently fell through to the
  // empty-string return below, indistinguishable from a genuine "no offers
  // matched" decision and telling a timed-out user to change their loan
  // amount instead of just retrying.
  const http = aurixResponse?.httpStatus;
  if (http === 0) return 'We’re having trouble reaching our lending partners right now. Please try again in a moment.';
  if (typeof http === 'number' && http >= 400) return `Offers request failed (HTTP ${http}).`;
  return '';
}

export interface NudgeConfigDTO {
  nudgeEnabled: boolean;
  nudgeIdleMs: number;
  nudgeDropoffMs: number;
  nudgeEligibleMs: number;
  version: number;
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
    // Drop any eligible-offers cache left by a previous session (e.g. one that
    // ended without a clean logout), so a freshly-logged-in phone never inherits
    // the last user's "My Offers".
    await clearOffersCache().catch(() => {});
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
    // Per-user eligible-offers cache is persisted (fare.tsx "My Offers" reads it
    // local-first). Clear it on logout, or the NEXT phone number to log in sees
    // the previous user's offers until a slower backend re-fetch overwrites them.
    await clearOffersCache().catch(() => {});
  },

  // Users
  me: () => request('GET', '/users/me'),
  /** Right to erasure — irreversible, cascades every record tied to this user. */
  deleteAccount: () => request('DELETE', '/users/me'),
  updateProfile: (patch: Record<string, unknown>) => request('PATCH', '/users/me', patch),
  setLanguage: (lang: string) => request('PATCH', '/users/me/language', { lang }),
  /** The language the user has spoken to the voice agent — distinct from setLanguage's UI-copy language. */
  setVoiceLanguage: (lang: string) => request('PATCH', '/users/me/voice-language', { lang }),
  setNotifications: (prefs: { loanUpdates?: boolean; securityAlerts?: boolean; promoOffers?: boolean }) =>
    request('PATCH', '/users/me/notifications', prefs),
  presignAvatarUpload: (contentType: 'image/jpeg' | 'image/png' | 'image/webp') =>
    request<{ uploadUrl: string; publicUrl: string }>('POST', '/users/me/avatar/presign', { contentType }),
  confirmAvatar: (avatarUrl: string) => request('PATCH', '/users/me/avatar', { avatarUrl }),

  // Application funnel
  createApplication: (payload: { amount: number; tenureMonths?: number; loanType?: string }) =>
    request('POST', '/applications', payload),
  listApplications: () => request('GET', '/applications'),
  getApplication: (id: string) => request('GET', `/applications/${id}`),
  updateApplication: (id: string, patch: Record<string, unknown>) => request('PATCH', `/applications/${id}`, patch),
  prequalify: async (id: string) => {
    // A real bureau/BRE call (Aurix) can take 25-30s — well beyond the default
    // 4s timeout. Allow 45s so real offers aren't lost to a client-side abort.
    const res = await request<{ offers: unknown[]; aurixResponse?: any }>(
      'POST',
      `/applications/${id}/prequalify`,
      undefined,
      false,
      45000,
    );
    // Turn any lender-side rejection into a clear, actionable note for the user
    // (surfaced on the offers screen), instead of a raw debug dump.
    return { ...res, friendlyError: friendlyAurixError(res?.aurixResponse, (res?.offers ?? []).length) };
  },
  selectOffer: (id: string, offerId: string, emiOptionId?: string) =>
    request('POST', `/applications/${id}/offers/${offerId}/select`, emiOptionId ? { emiOptionId } : undefined),
  // Apply to a specific lender's offer — creates a tracked per-lender
  // application (returns { offer, lenderApplicationId, alreadyApplied }).
  applyOffer: (id: string, offerId: string, emiOptionId?: string) =>
    request('POST', `/applications/${id}/offers/${offerId}/apply`, emiOptionId ? { emiOptionId } : undefined),
  // Mark a per-lender application failed (e.g. the lender web flow errored out).
  // Pass lenderApplicationId to target the exact application; the server falls
  // back to the latest apply for the offer when omitted.
  failApplication: (id: string, offerId: string, reason?: string, lenderApplicationId?: string | null) =>
    request('POST', `/applications/${id}/offers/${offerId}/fail`, {
      ...(reason ? { reason } : {}),
      ...(lenderApplicationId ? { lenderApplicationId } : {}),
    }),
  handoff: (id: string) => request('POST', `/applications/${id}/handoff`),

  // KYC / loans / misc
  submitKyc: (method: 'aadhaar' | 'pan' | 'bank' | 'selfie', payload: Record<string, unknown> = {}) =>
    request('POST', `/kyc/${method}`, payload),
  listLoans: () => request('GET', '/loans'),
  getLoan: (id: string) => request('GET', `/loans/${id}`),
  payEmi: (loanId: string, repaymentId: string) => request('POST', `/loans/${loanId}/repayments/${repaymentId}/pay`),
  partners: () => request('GET', '/catalog/partners'),
  marketLoanOffers: (): Promise<{ data: MarketLoanOffer[] }> => request('GET', '/market-loan-offers'),
  // Firm "pre-approved for you" offers shown at the top of Home on login. Auth'd,
  // active + unexpired, admin-ordered. Amounts in paise.
  prequalifyingOffers: (): Promise<{ data: PrequalifyingOffer[] }> => request('GET', '/prequalifying-offers'),
  // Admin-tunable nudge timers (public). The app fetches this on launch/foreground.
  nudgeConfig: (): Promise<{ data: NudgeConfigDTO }> => request('GET', '/config/nudges'),
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
  // No x-amz-acl: the bucket's Object Ownership is "Bucket owner enforced"
  // (rejects any ACL) and public read is already granted via bucket policy,
  // not per-object ACLs — matches the presign command's own PutObjectCommand.
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: blob as any,
  });
  // ApiError (not a plain Error) so the caller's `e instanceof ApiError` check
  // in profile.tsx actually shows this reason instead of a generic fallback.
  if (!putRes.ok) throw new ApiError(putRes.status, `Photo upload failed (${putRes.status})`);
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
    if (!data || typeof data !== 'object' || !('hasHistory' in data)) return null;
    // This is forwarded to the voice agent verbatim as page_context.userContext
    // on every turn (see store.ts's registerPageContext) — allowlisted to
    // exactly the fields prompts/ello-inapp-copilot-prompt.md's `userContext`
    // section documents (matching the UserContext type below), rather than
    // trusting whatever /context/me happens to return. The endpoint's actual
    // response carries extra fields (conversationBrief, a full conversations[]
    // transcript list) meant for other consumers — the prompt's own STRICT
    // RULE is to open from the single `brief` line, never the raw history, so
    // those extras were pure bloat riding along on every call, roughly
    // doubling this payload for a field the agent was never told to read.
    const d = data as UserContext;
    return {
      hasHistory: d.hasHistory,
      name: d.name,
      city: d.city,
      email: d.email,
      stage: d.stage,
      stageLabel: d.stageLabel,
      nextAction: d.nextAction,
      inquiries: d.inquiries,
      lastCall: d.lastCall,
      application: d.application,
      loan: d.loan,
      brief: d.brief,
    };
  } catch {
    return null;
  }
}
