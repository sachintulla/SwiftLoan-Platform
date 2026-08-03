'use client';

// Thin API client for the admin dashboard. Talks to the existing SwiftLoan server
// (server/) at NEXT_PUBLIC_API_BASE. Admin access token is kept in localStorage and
// attached as a Bearer header. All server responses use the { success, data, message,
// pagination } envelope.

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const TOKEN_KEY = 'sl_admin_token';
const REFRESH_KEY = 'sl_admin_refresh';
const ADMIN_KEY = 'sl_admin_user';
// Sticky "the server told us this admin must rotate their password" flag. Set by a
// 428 from any endpoint (or by the login response) and cleared once the change lands,
// so the Shell can keep blocking navigation across reloads.
const MUST_CHANGE_KEY = 'sl_admin_must_change';
// Whether this admin has 2FA on. Recorded from the login response so /account can
// render the right section without a dedicated status endpoint.
const TOTP_KEY = 'sl_admin_totp';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setSession(accessToken: string, refreshToken: string, admin: unknown) {
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
  window.localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
}
export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(ADMIN_KEY);
  window.localStorage.removeItem(MUST_CHANGE_KEY);
  window.localStorage.removeItem(TOTP_KEY);
}
export function setMustChangePassword(v: boolean) {
  if (typeof window === 'undefined') return;
  if (v) window.localStorage.setItem(MUST_CHANGE_KEY, '1');
  else window.localStorage.removeItem(MUST_CHANGE_KEY);
}
export function mustChangePassword(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUST_CHANGE_KEY) === '1';
}
export function setTotpEnabled(v: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOTP_KEY, v ? '1' : '0');
}
export function getTotpEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(TOTP_KEY) === '1';
}
export function getAdmin<T = { name: string; email: string; role: string }>(): T | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ADMIN_KEY);
  return raw ? (JSON.parse(raw) as T) : null;
}

export interface ApiResult<T> {
  success: boolean;
  data: T;
  message: string;
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<ApiResult<T>> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  // Parse tolerantly: 440/428 must still be handled even if the body is not JSON.
  let body = null as unknown as ApiResult<T>;
  let parsed = true;
  try { body = await res.json(); } catch { parsed = false; }

  if (res.status === 440) {
    // Idle-session timeout. Global: sign out and explain why on the login screen.
    if (typeof window !== 'undefined') {
      clearSession();
      if (window.location.pathname !== '/login') window.location.href = '/login?reason=idle';
    }
    throw new ApiError(440, body?.message || 'Signed out for inactivity');
  }
  if (res.status === 428) {
    // Password rotation required — park the admin on /account until it is done.
    if (typeof window !== 'undefined') {
      setMustChangePassword(true);
      if (!window.location.pathname.startsWith('/account')) window.location.href = '/account?mustChange=1';
    }
    throw new ApiError(428, body?.message || 'Password change required');
  }
  if (res.status === 401) {
    // token expired / invalid — force re-login
    if (typeof window !== 'undefined' && !path.includes('/auth/')) {
      clearSession();
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    throw new ApiError(401, body?.message || 'Unauthorized');
  }
  if (!parsed) throw new ApiError(res.status, `HTTP ${res.status}`);
  if (!res.ok || body?.success === false) {
    throw new ApiError(res.status, body?.message || body?.error || `HTTP ${res.status}`);
  }
  return body;
}

// Multipart variant of apiFetch — used for spreadsheet uploads. The browser must set
// its own multipart boundary, so we deliberately do NOT send a Content-Type header.
export async function apiUpload<T>(path: string, form: FormData): Promise<ApiResult<T>> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: form,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let body: ApiResult<T>;
  try { body = await res.json(); } catch { throw new ApiError(res.status, `HTTP ${res.status}`); }
  if (!res.ok || body?.success === false) {
    throw new ApiError(res.status, body?.message || body?.error || `HTTP ${res.status}`);
  }
  return body;
}

// SWR fetcher returning the unwrapped envelope so components get { data, pagination }.
export async function swrFetcher<T>(path: string): Promise<ApiResult<T>> {
  return apiFetch<T>(path);
}

export interface AdminUser { id?: string; name: string; email: string; role: string }

export interface LoginResult {
  accessToken?: string;
  refreshToken?: string;
  admin?: AdminUser;
  mustChangePassword?: boolean;
  totpEnabled?: boolean;
  // 2FA challenge: HTTP 200 with no tokens, meaning "send me a code".
  totpRequired?: boolean;
}

// Single login entry point. Returns the raw payload so the caller can tell a 2FA
// challenge (`totpRequired`) apart from a real sign-in; the session is only stored
// when tokens actually came back.
export async function login(input: { email: string; password: string; totp?: string; recoveryCode?: string }) {
  const res = await apiFetch<LoginResult>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      ...(input.totp ? { totp: input.totp } : {}),
      ...(input.recoveryCode ? { recoveryCode: input.recoveryCode } : {}),
    }),
  });
  const data = (res.data ?? {}) as LoginResult;
  if (data.totpRequired && !data.accessToken) return data;
  if (!data.accessToken || !data.refreshToken) {
    throw new ApiError(500, res.message || 'Login did not return a session token');
  }
  setSession(data.accessToken, data.refreshToken, data.admin ?? { name: '', email: input.email, role: '' });
  setMustChangePassword(!!data.mustChangePassword);
  setTotpEnabled(!!data.totpEnabled);
  return data;
}

// Authenticated file download (CSV exports). Uses fetch + blob so the Bearer token
// travels on the request — a bare <a href> could not carry it.
export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json(); msg = b?.message || b?.error || msg; } catch { /* non-JSON error body */ }
    if (res.status === 403) msg = msg === `HTTP 403` ? 'Exports are restricted to super_admin' : msg;
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
