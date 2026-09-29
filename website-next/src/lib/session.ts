/**
 * Website's own login session — a real User + a short (2-hour, sliding)
 * refresh session, distinct from the marketing site's lead-capture OTP
 * (useLeadCapture.ts / leads.ts, which never creates a session at all).
 *
 * The refresh token lives in an httpOnly cookie set by the server
 * (POST /api/website/auth/*) and is never touched from JS. The access token
 * is kept in memory only (never localStorage — an XSS payload could exfiltrate
 * anything stored there), so a hard page reload always calls `bootstrapSession`
 * to trade the cookie for a fresh access token before any authenticated call.
 */
import { apiBase } from './leads';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();
function notify() {
  listeners.forEach((l) => l());
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  return accessToken;
}

function setAccessToken(token: string | null) {
  accessToken = token;
  notify();
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

/** Trade the httpOnly refresh cookie for a new access token. Never throws. */
export async function refreshSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${apiBase()}/api/website/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const body = await parseJson(res);
      setAccessToken(body?.data?.accessToken ?? null);
      return accessToken;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Called once on app mount so a page reload mid-flow resumes silently. */
export async function bootstrapSession(): Promise<boolean> {
  if (accessToken) return true;
  const token = await refreshSession();
  return !!token;
}

export interface OtpVerifyResult {
  user: Record<string, unknown>;
  hasApplication: boolean;
  applicationId: string | null;
}

export async function requestOtp(phone: string): Promise<{ otpSent: boolean; devOtp?: string }> {
  const res = await fetch(`${apiBase()}/api/website/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const body = await parseJson(res);
  if (!res.ok) throw new Error(body?.error || 'Could not send OTP');
  return body.data;
}

export async function verifyOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  const res = await fetch(`${apiBase()}/api/website/auth/otp/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const body = await parseJson(res);
  if (!res.ok) throw new Error(body?.error || 'Invalid or expired code');
  setAccessToken(body.data.accessToken);
  return { user: body.data.user, hasApplication: body.data.hasApplication, applicationId: body.data.applicationId };
}

export async function logout(): Promise<void> {
  await fetch(`${apiBase()}/api/website/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  setAccessToken(null);
}

/**
 * Authenticated fetch — attaches the in-memory access token, and on a 401
 * (expired token) refreshes once via the cookie and retries once. Throws with
 * the server's own error message on any other failure.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<any> {
  if (!accessToken) await refreshSession();

  const run = () =>
    fetch(`${apiBase()}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  let res = await run();
  if (res.status === 401) {
    const token = await refreshSession();
    if (token) res = await run();
  }
  const body = await parseJson(res);
  // status travels with the error so callers can tell e.g. a 429 from a 502.
  if (!res.ok) throw Object.assign(new Error(body?.error || 'Request failed'), { status: res.status });
  return body;
}
