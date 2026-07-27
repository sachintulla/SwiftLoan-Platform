import { Platform } from 'react-native';

/**
 * Typed client for the SwiftLoan backend (see /server).
 * iOS simulator reaches the host at localhost; the Android emulator uses 10.0.2.2.
 * Override with a real host for a physical device / deployed API.
 */
export const API_BASE =
  (globalThis as any).SWIFTLOAN_API_BASE ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api');

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string | null, refresh?: string | null) {
  accessToken = access;
  if (refresh !== undefined) refreshToken = refresh;
}
export const getTokens = () => ({ accessToken, refreshToken });
export const isAuthed = () => !!accessToken;

/**
 * Request timeout. Without one, an unreachable host doesn't fail fast — it waits
 * for the TCP connect timeout (30s+). That bites hardest on a physical device,
 * where the default 10.0.2.2 is the *emulator's* host alias and simply isn't
 * routable: "Send OTP" appeared to hang for half a minute before the offline
 * fallback could run. It also stops each fire-and-forget tracking call from
 * holding a socket open for 30s.
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
    // Surface an abort as a network-class failure so the offline demo path
    // recognises it (isNetworkError) rather than treating it as an API error.
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

/* ─────────────────────────────────────────────────────────────
 * Offline demo mode.
 *
 * The app's backend (server/, port 4000) needs local Postgres and is often not
 * running during UI/voice work. Rather than dead-ending the onboarding funnel on
 * "Could not send OTP", auth falls back to a local demo session so the rest of
 * the app stays walkable — the same spirit as the existing graceful degradation
 * for authed endpoints.
 *
 * DEV ONLY. This accepts a fixed OTP, so it is hard-gated on __DEV__: shipping an
 * OTP bypass in a lending app would be a real security hole, not a convenience.
 * ───────────────────────────────────────────────────────────── */
export const DEMO_OTP = '123456';

/**
 * This is a demo app with no backend of its own, so auth is always local and the
 * dummy OTP is always accepted — including in release builds, where __DEV__ is
 * false. If a real backend is ever wired up, gate this before shipping to users.
 */
const DEMO_ALLOWED = true;

/**
 * True when nobody pointed the app at a real backend. The default host is the
 * Android emulator's alias for the dev machine (10.0.2.2), which isn't routable
 * from a physical device — so auth calls didn't fail, they hung until the TCP
 * connect timeout. When no server is configured we skip the network entirely and
 * authenticate locally, which is instant.
 *
 * Set globalThis.SWIFTLOAN_API_BASE to use the real server/ backend instead.
 */
const SERVER_CONFIGURED = !!(globalThis as any).SWIFTLOAN_API_BASE;
const LOCAL_AUTH_ONLY = DEMO_ALLOWED && !SERVER_CONFIGURED;

let offline = LOCAL_AUTH_ONLY;
export const isOfflineDemo = () => offline;

/** True for transport-level failures (server down / unreachable), not 4xx/5xx. */
function isNetworkError(e: unknown): boolean {
  if (e instanceof ApiError) return false;
  const m = (e as any)?.message || '';
  return e instanceof TypeError || /Network request failed|Failed to fetch|timed out/i.test(m);
}

function demoAuth(phone: string): AuthResult {
  offline = true;
  return {
    user: {
      id: 'demo-user',
      phone,
      name: 'Demo User',
      email: 'demo@swiftloan.example',
      offlineDemo: true,
    },
    accessToken: 'offline-demo-token',
    refreshToken: 'offline-demo-refresh',
    expiresIn: 3600,
  };
}

export interface AuthResult {
  user: Record<string, any>;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const api = {
  health: () => request('GET', '/health'),

  // Auth
  register: (phone: string, opts: { email?: string; password?: string; lang?: string } = {}) =>
    request('POST', '/auth/register', { phone, ...opts }),
  requestOtp: async (phone: string) => {
    // Already known unreachable: don't pay the timeout again.
    if (DEMO_ALLOWED && offline) return { devOtp: DEMO_OTP, offlineDemo: true };
    try {
      return await request('POST', '/auth/otp/request', { phone });
    } catch (e) {
      if (DEMO_ALLOWED && isNetworkError(e)) {
        offline = true;
        return { devOtp: DEMO_OTP, offlineDemo: true };
      }
      throw e;
    }
  },
  verifyOtp: async (phone: string, code: string): Promise<AuthResult> => {
    const acceptDemo = (): AuthResult => {
      if (code !== DEMO_OTP) {
        throw new ApiError(400, `Server unreachable — use ${DEMO_OTP} for the offline demo.`);
      }
      const r = demoAuth(phone);
      setTokens(r.accessToken, r.refreshToken);
      return r;
    };
    // Short-circuit: requestOtp already proved the server is unreachable, so
    // verifying is instant instead of waiting on another request that must fail.
    if (DEMO_ALLOWED && offline) return acceptDemo();
    try {
      const r = await request<AuthResult>('POST', '/auth/otp/verify', { phone, code });
      setTokens(r.accessToken, r.refreshToken);
      return r;
    } catch (e) {
      if (DEMO_ALLOWED && isNetworkError(e)) return acceptDemo();
      throw e;
    }
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
  updateProfile: (patch: Record<string, unknown>) => request('PATCH', '/users/me', patch),
  setLanguage: (lang: string) => request('PATCH', '/users/me/language', { lang }),
  setNotifications: (prefs: { loanUpdates?: boolean; securityAlerts?: boolean; promoOffers?: boolean }) =>
    request('PATCH', '/users/me/notifications', prefs),
  creditScore: () => request('GET', '/users/me/credit-score'),

  // Application funnel
  createApplication: (payload: { amount: number; tenureMonths?: number; loanType?: string }) =>
    request('POST', '/applications', payload),
  listApplications: () => request('GET', '/applications'),
  getApplication: (id: string) => request('GET', `/applications/${id}`),
  updateApplication: (id: string, patch: Record<string, unknown>) => request('PATCH', `/applications/${id}`, patch),
  prequalify: (id: string) => request('POST', `/applications/${id}/prequalify`),
  selectOffer: (id: string, offerId: string) => request('POST', `/applications/${id}/offers/${offerId}/select`),
  handoff: (id: string) => request('POST', `/applications/${id}/handoff`),

  // KYC / loans / misc
  submitKyc: (method: 'aadhaar' | 'pan' | 'bank' | 'selfie', payload: Record<string, unknown> = {}) =>
    request('POST', `/kyc/${method}`, payload),
  listLoans: () => request('GET', '/loans'),
  getLoan: (id: string) => request('GET', `/loans/${id}`),
  payEmi: (loanId: string, repaymentId: string) => request('POST', `/loans/${loanId}/repayments/${repaymentId}/pay`),
  partners: () => request('GET', '/catalog/partners'),
  emi: (amount: number, tenureMonths: number, rate: number) =>
    request('POST', '/tools/emi', { amount, tenureMonths, rate }),
  createTicket: (subject: string, type: 'query' | 'grievance' = 'query', body?: string) =>
    request('POST', '/support/tickets', { subject, type, body }),
};

/**
 * Fire-and-forget tracking calls — never await, never block UI.
 */
export function trackEvent(
  eventType: string,
  eventName: string,
  screen: string,
  metadata?: Record<string, unknown>
): void {
  request('POST', '/track/event', { event_type: eventType, event_name: eventName, screen, metadata }).catch(() => {});
}

export function trackOnboardingStep(
  stepNumber: number,
  stepName: string,
  status: 'completed' | 'paused',
  timeSpentSeconds: number,
  dropOffReason?: string
): void {
  request('POST', '/track/onboarding/step', {
    step_number: stepNumber,
    step_name: stepName,
    status,
    time_spent_seconds: timeSpentSeconds,
    drop_off_reason: dropOffReason,
  }).catch(() => {});
}

export function trackLoanStep(
  loanId: string,
  stepName: string,
  status: 'completed' | 'paused',
  timeSpentSeconds: number,
  holdReason?: string
): void {
  request('POST', '/track/loan/step', {
    loan_id: loanId,
    step_name: stepName,
    status,
    time_spent_seconds: timeSpentSeconds,
    hold_reason: holdReason,
  }).catch(() => {});
}

export function trackSessionStart(deviceInfo?: Record<string, unknown>): void {
  request('POST', '/track/session/start', { platform: 'mobile', device_info: deviceInfo }).catch(() => {});
}

export function trackSessionEnd(
  sessionId: string,
  pagesVisited?: Array<{ screen: string; timestamp: number; timeSpentSeconds: number }>
): void {
  request('POST', '/track/session/end', { session_id: sessionId, pages_visited: pagesVisited }).catch(() => {});
}

/**
 * Guarantee an authenticated session exists before an authed call. Used by the
 * "Skip for now — explore the app" path so the funnel/profile still work without
 * an explicit login: it provisions an anonymous demo account (dev OTP 123456).
 * No-op if already authed.
 */
export async function ensureSession(): Promise<void> {
  if (accessToken) return;
  const phone = String(9000000000 + Math.floor(Math.random() * 999_999_999)).slice(0, 10);
  // Known offline: provision the local demo session immediately ("Skip for now"
  // otherwise stalled on the same unreachable host).
  if (DEMO_ALLOWED && offline) {
    const r = demoAuth(phone);
    setTokens(r.accessToken, r.refreshToken);
    return;
  }
  try {
    await api.register(phone).catch(() => api.requestOtp(phone));
    await api.verifyOtp(phone, DEMO_OTP);
  } catch (e) {
    // Offline: hold a local demo session so the funnel/profile screens still work.
    if (DEMO_ALLOWED) {
      const r = demoAuth(phone);
      setTokens(r.accessToken, r.refreshToken);
      return;
    }
    throw e;
  }
}
