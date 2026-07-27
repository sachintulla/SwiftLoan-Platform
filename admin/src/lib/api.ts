'use client';

// Thin API client for the admin dashboard. Talks to the existing SwiftLoan server
// (server/) at NEXT_PUBLIC_API_BASE. Admin access token is kept in localStorage and
// attached as a Bearer header. All server responses use the { success, data, message,
// pagination } envelope.

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const TOKEN_KEY = 'sl_admin_token';
const REFRESH_KEY = 'sl_admin_refresh';
const ADMIN_KEY = 'sl_admin_user';

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
  let body: ApiResult<T>;
  try { body = await res.json(); } catch { throw new ApiError(res.status, `HTTP ${res.status}`); }
  if (res.status === 401) {
    // token expired / invalid — force re-login
    if (typeof window !== 'undefined' && !path.includes('/auth/')) {
      clearSession();
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    throw new ApiError(401, body?.message || 'Unauthorized');
  }
  if (!res.ok || body?.success === false) {
    throw new ApiError(res.status, body?.message || body?.error || `HTTP ${res.status}`);
  }
  return body;
}

// SWR fetcher returning the unwrapped envelope so components get { data, pagination }.
export async function swrFetcher<T>(path: string): Promise<ApiResult<T>> {
  return apiFetch<T>(path);
}

export async function login(email: string, password: string) {
  const res = await apiFetch<{ accessToken: string; refreshToken: string; admin: unknown }>(
    '/api/admin/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  setSession(res.data.accessToken, res.data.refreshToken, res.data.admin);
  return res.data.admin;
}
