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

async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as any).error || res.statusText, data);
  return data as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
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
  requestOtp: (phone: string) => request('POST', '/auth/otp/request', { phone }),
  verifyOtp: async (phone: string, code: string): Promise<AuthResult> => {
    const r = await request<AuthResult>('POST', '/auth/otp/verify', { phone, code });
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
  await api.register(phone).catch(() => api.requestOtp(phone));
  await api.verifyOtp(phone, '123456');
}
