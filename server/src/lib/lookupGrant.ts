/**
 * Proof-of-verification for the Ello customer-data lookups.
 *
 * `POST /api/context/lookup` (get_user_context) and `POST /api/conversations/context`
 * (get_customer_history) return a person's profile / loan history for ANY phone number
 * handed to them; the shared x-api-key only proves the caller is Ello. On the website a
 * visitor can simply SAY a number, and the agent would read back that person's details.
 *
 * A lookup grant closes that: after a real OTP sign-in the website asks the server for a
 * short-lived token bound to the signed-in user's own phone, and hands it to the agent,
 * which sends it back with the tool call. When a grant is present the phone comes from IT
 * and anything the visitor said is ignored. A tool configured as grant-required
 * (`x-agent-role: website`) answers "nothing known" without one.
 *
 * Signed with a key derived from the access secret and carrying its own audience, so a
 * grant can never be replayed as an access token (or the reverse).
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const AUDIENCE = 'agent-lookup';
export const LOOKUP_GRANT_TTL_SEC = 10 * 60;

const key = () => crypto.createHmac('sha256', env.jwtAccessSecret).update('lookup-grant/v1').digest();

export function signLookupGrant(p: { sub: string; phone: string }): string {
  return jwt.sign({ sub: p.sub, phone: p.phone }, key(), { audience: AUDIENCE, expiresIn: LOOKUP_GRANT_TTL_SEC });
}

/** The granted identity, or null for anything missing, malformed, expired or forged. */
export function verifyLookupGrant(raw: unknown): { sub: string; phone: string } | null {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) return null;
  try {
    const d = jwt.verify(raw.trim(), key(), { audience: AUDIENCE }) as { sub?: string; phone?: string };
    return d.sub && d.phone && /^\d{10}$/.test(d.phone) ? { sub: d.sub, phone: d.phone } : null;
  } catch {
    return null;
  }
}

/** Roles (from the tool's own `x-agent-role` header, set in the Ello dashboard) that may only look up with a grant. */
export function grantRequiredRoles(): Set<string> {
  return new Set(
    (process.env.LOOKUP_GRANT_REQUIRED_ROLES ?? 'website')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type LookupAccess =
  | { kind: 'granted'; phone: string; userId: string } // verified: use THIS phone, ignore any spoken one
  | { kind: 'denied' } // grant-required caller with no valid grant: reveal nothing
  | { kind: 'open' }; // trusted phone-only caller (outbound dialer, in-app) — unchanged behaviour

export function resolveLookupAccess(headers: Record<string, unknown>, body: Record<string, unknown> | undefined): LookupAccess {
  const granted = verifyLookupGrant(body?.lookup_grant ?? body?.lookupGrant);
  if (granted) return { kind: 'granted', phone: granted.phone, userId: granted.sub };
  const role = String(headers['x-agent-role'] ?? '').trim().toLowerCase();
  return grantRequiredRoles().has(role) ? { kind: 'denied' } : { kind: 'open' };
}

/** What a denied lookup returns — the same shape as "no history", plus a note steering the agent. */
export const NOT_VERIFIED_RESULT = {
  hasHistory: false,
  known: false,
  verified: false,
  note: 'This visitor has not verified their mobile number, so no personal details are available. Do not read out, confirm or hint at any stored details for a number they say. Offer to sign them in with the OTP first.',
} as const;
