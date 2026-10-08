/**
 * Yubi Markets (YMPL) "Indiamart referrer" APIs — the alternative-offers
 * facility, run in PARALLEL to the Aurix (Knight Fintech) eligibility flow.
 *
 * Unlike a real LenderPartner adapter (see lenderOffers.ts), YMPL does NOT
 * return structured offers we can render as tiles. It issues a hosted web
 * journey: we register the applicant as a referral, mint a short-lived auth
 * token carrying a redirect URL, and the app opens that URL in an in-app
 * WebView. So YMPL is wired as its own thing, not as a `LenderOfferProvider`.
 *
 * Flow (per the Postman collection):
 *   1. Create Referral  POST /api/v1/referral      → { ymplReferralId, clientReferralId }
 *   2. Auth Token       POST /api/v1/auth/token    → { ...redirectUrl... }
 *   3. Get Status       POST /api/v1/referral/status
 *
 * Shared headers X-Api-Key / x-referrer-id are SECRETS — they live in env
 * (YUBI_API_KEY / YUBI_REFERRER_ID), never in the DB and never in the app
 * bundle, exactly like the Aurix audience secret. `clientReferralId` is a UUID
 * we generate and persist (PartnerReferral) as our idempotent handle.
 *
 * Everything here is best-effort and non-fatal: a YMPL failure must never break
 * the Aurix flow or the funnel. Callers fire create/token in parallel
 * (fire-and-forget) and the on-tap endpoint re-mints a fresh token.
 */
import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from './prisma.js';
import { scoped } from './log.js';

const log = scoped('yubi');

const DEFAULT_TIMEOUT_MS = 15_000;

// UAT defaults from the Postman collection. Overridable per-env; a real
// production launch sets all four YUBI_* keys to the prod values.
const UAT_BASE = 'https://api-uat.yubimarkets.in/api/v1';
const UAT_API_KEY = 'ref_uat_a7870ea9961a4d0e8de57ce42ee04a7f';
const UAT_REFERRER_ID = 'd17d647b-02e8-4400-b348-3d8c2797fd9f';

// YMPL format-validates these (and 400s otherwise). An Indian PIN never starts
// with 0. The email fallback domain is used only when the applicant has no
// email on file — a deterministic, RFC-valid lead address, overridable via env.
const PIN_RE = /^[1-9][0-9]{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEAD_EMAIL_DOMAIN = process.env.YUBI_LEAD_EMAIL_DOMAIN || 'leads.swiftloan.ai';

export interface YubiConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  referrerId: string;
  /** Where YMPL returns the applicant after their journey (back into our app). */
  returnRedirectionUrl: string;
}

export function yubiConfig(): YubiConfig {
  const baseUrl = (process.env.YUBI_BASE_URL || UAT_BASE).replace(/\/+$/, '');
  const apiKey = process.env.YUBI_API_KEY || UAT_API_KEY;
  const referrerId = process.env.YUBI_REFERRER_ID || UAT_REFERRER_ID;
  // Enabled by default when we have config; an operator can hard-disable with
  // YUBI_ENABLED=false (e.g. if the partner contract lapses).
  const enabled = process.env.YUBI_ENABLED !== 'false' && !!baseUrl && !!apiKey && !!referrerId;
  const returnRedirectionUrl = process.env.YUBI_RETURN_URL || 'https://swiftloan.ai/partner/return';
  return { enabled, baseUrl, apiKey, referrerId, returnRedirectionUrl };
}

export function yubiEnabled(): boolean {
  return yubiConfig().enabled;
}

async function httpJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, body: parsed, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    const aborted = e?.name === 'AbortError';
    return { ok: false, status: 0, body: null, error: aborted ? `timed out after ${timeoutMs}ms` : String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(cfg: YubiConfig): Record<string, string> {
  return {
    'X-Api-Key': cfg.apiKey,
    'x-referrer-id': cfg.referrerId,
    'idempotency-key': randomUUID(),
  };
}

/** Dig a redirect URL out of an auth-token response regardless of exact shape. */
export function extractRedirectUrl(raw: any): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidates = [
    raw.redirectUrl, raw.redirectionUrl, raw.redirect_url, raw.url, raw.journeyUrl,
    raw.data?.redirectUrl, raw.data?.redirectionUrl, raw.data?.redirect_url, raw.data?.url,
    raw.result?.redirectUrl, raw.result?.redirectionUrl, raw.result?.url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  }
  return null;
}

/** Best-effort applicant name split for YMPL's first/middle/last fields. */
function splitName(user: Pick<User, 'firstName' | 'lastName' | 'fullName'>): { firstName: string; middleName?: string; lastName: string } {
  if (user.firstName || user.lastName) {
    return { firstName: user.firstName || user.lastName || 'Applicant', lastName: user.lastName || user.firstName || '' };
  }
  const parts = (user.fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Applicant', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined, lastName: parts[parts.length - 1] };
}

type Referral = Awaited<ReturnType<typeof prisma.partnerReferral.findFirst>>;

/**
 * Ensure a PartnerReferral exists for this application and is registered with
 * YMPL (Create Referral). Idempotent: returns the existing row if already
 * referred. Best-effort — on failure it still persists a row (status 'failed')
 * so the on-tap path can retry, and never throws.
 */
export async function ensureReferral(applicationId: string, userId: string): Promise<Referral> {
  const cfg = yubiConfig();
  if (!cfg.enabled) return null;

  let ref = await prisma.partnerReferral.findFirst({ where: { applicationId, provider: 'ympl' } });
  if (ref?.ymplReferralId) return ref; // already registered

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return ref;

  // One clientReferralId per application, reused across retries.
  if (!ref) {
    ref = await prisma.partnerReferral.create({
      data: { applicationId, userId, provider: 'ympl', clientReferralId: randomUUID(), status: 'created' },
    });
  }

  const name = splitName(user);
  const mobile = (user.phone || '').replace(/\D/g, '').slice(-10);
  const rawEmail = user.email || user.companyEmail || user.businessEmail || '';
  // YMPL format-validates both fields (email RFC 5321, pincode ^[1-9][0-9]{5}$)
  // and 400s on a bad one. A pincode we simply don't have yet → DEFER (status
  // 'pending_data', no API call, no 'failed'); the on-tap / prequalify retry
  // fires once the funnel has collected it. Email: use the real one when valid,
  // else a deterministic lead-domain fallback so the referral can still proceed.
  const email = EMAIL_RE.test(rawEmail) ? rawEmail : `u${mobile || 'x'}@${LEAD_EMAIL_DOMAIN}`;
  const pincode = user.pincode || '';
  if (!PIN_RE.test(pincode) || mobile.length !== 10) {
    log.info('referral deferred — awaiting valid pincode/mobile', { applicationId, hasPincode: !!pincode, mobileLen: mobile.length });
    return prisma.partnerReferral.update({
      where: { id: ref.id },
      data: { status: 'pending_data', lastError: 'awaiting valid pincode/mobile' },
    });
  }

  const payload = {
    clientReferralId: ref.clientReferralId,
    referralType: 'INDIVIDUAL',
    sector: 'PERSONAL_LOANS',
    individualDetails: {
      firstName: name.firstName,
      ...(name.middleName ? { middleName: name.middleName } : {}),
      lastName: name.lastName,
      mobile,
      email,
    },
    addressDetails: [
      { addressType: 'RESIDENTIAL_CURRENT', pincode },
    ],
  };

  const res = await httpJson(`${cfg.baseUrl}/referral`, authHeaders(cfg), payload);
  if (!res.ok) {
    log.warn('create referral failed', { applicationId, status: res.status, error: res.error });
    return prisma.partnerReferral.update({
      where: { id: ref.id },
      data: { status: 'failed', lastError: res.error || `HTTP ${res.status}`, rawCreate: res.body ?? undefined },
    });
  }

  const ymplReferralId: string | null = res.body?.ymplReferralId ?? res.body?.data?.ymplReferralId ?? null;
  log.info('referral created', { applicationId, ymplReferralId });
  return prisma.partnerReferral.update({
    where: { id: ref.id },
    data: { status: 'referred', ymplReferralId, lastError: null, rawCreate: res.body ?? undefined },
  });
}

/**
 * Ensure a referral exists, then mint a fresh auth token and persist its
 * redirect URL. Returns the redirect URL (or null on any failure). This is the
 * authoritative on-tap path (tokens are short-lived, so we always re-mint).
 */
export async function ensureRedirectUrl(applicationId: string, userId: string): Promise<{ redirectUrl: string | null; status: string }> {
  const cfg = yubiConfig();
  if (!cfg.enabled) return { redirectUrl: null, status: 'disabled' };

  const ref = await ensureReferral(applicationId, userId);
  if (!ref?.clientReferralId) return { redirectUrl: null, status: 'failed' };
  // Not registered with YMPL yet (deferred for missing pincode, or create
  // failed) — don't call /auth/token, it would 404. Surface the pending state.
  if (!ref.ymplReferralId) return { redirectUrl: null, status: ref.status || 'pending_data' };

  const res = await httpJson(`${cfg.baseUrl}/auth/token`, authHeaders(cfg), {
    clientReferralId: ref.clientReferralId,
    returnRedirectionUrl: cfg.returnRedirectionUrl,
  });
  if (!res.ok) {
    log.warn('auth token failed', { applicationId, status: res.status, error: res.error });
    await prisma.partnerReferral.update({
      where: { id: ref.id },
      data: { status: 'failed', lastError: res.error || `HTTP ${res.status}`, rawAuth: res.body ?? undefined },
    }).catch(() => {});
    return { redirectUrl: null, status: 'failed' };
  }

  const redirectUrl = extractRedirectUrl(res.body);
  if (!redirectUrl) {
    log.warn('auth token had no redirect url', { applicationId });
    await prisma.partnerReferral.update({
      where: { id: ref.id },
      data: { status: 'failed', lastError: 'no redirect url in response', rawAuth: res.body ?? undefined },
    }).catch(() => {});
    return { redirectUrl: null, status: 'failed' };
  }

  log.info('auth token minted', { applicationId });
  await prisma.partnerReferral.update({
    where: { id: ref.id },
    data: { status: 'token_issued', redirectUrl, returnRedirectionUrl: cfg.returnRedirectionUrl, lastError: null, rawAuth: res.body ?? undefined },
  }).catch(() => {});
  return { redirectUrl, status: 'token_issued' };
}

/** Fire-and-forget: register the referral in parallel with the Aurix flow. */
export function kickoffReferral(applicationId: string, userId: string): void {
  if (!yubiEnabled()) return;
  ensureReferral(applicationId, userId).catch(e => log.warn('kickoff referral error', { applicationId, error: String(e?.message ?? e) }));
}

/** Fire-and-forget: pre-warm the auth token in parallel with Aurix offers. */
export function kickoffRedirect(applicationId: string, userId: string): void {
  if (!yubiEnabled()) return;
  ensureRedirectUrl(applicationId, userId).catch(e => log.warn('kickoff redirect error', { applicationId, error: String(e?.message ?? e) }));
}

/**
 * Get Status (POST /api/v1/referral/status) — returns the referral's journey
 * stage (NEW_LEAD, …) and any journeys. Best-effort; persists `lastStatus`.
 */
export async function getReferralStatus(applicationId: string, userId: string): Promise<{ journeyStatus: string | null; raw: unknown }> {
  const cfg = yubiConfig();
  const ref = await prisma.partnerReferral.findFirst({ where: { applicationId, userId, provider: 'ympl' } });
  if (!cfg.enabled || !ref?.clientReferralId) return { journeyStatus: ref?.lastStatus ?? null, raw: null };
  const res = await httpJson(`${cfg.baseUrl}/referral/status`, authHeaders(cfg), { clientReferralId: ref.clientReferralId });
  const journeyStatus: string | null = res.ok ? (res.body?.journeyStatus ?? null) : null;
  if (journeyStatus) {
    await prisma.partnerReferral.update({ where: { id: ref.id }, data: { lastStatus: journeyStatus } }).catch(() => {});
  }
  return { journeyStatus, raw: res.body };
}

/**
 * Mark the referral as "applied" — called when the applicant taps Proceed on
 * YMPL's offers page (detected in the in-app WebView). Stamps appliedAt (once),
 * records the lender they proceeded with, and refreshes the status. This is what
 * surfaces the referral as an application in My Loans.
 */
export async function markReferralApplied(applicationId: string, userId: string, lender?: string | null) {
  const ref = await prisma.partnerReferral.findFirst({ where: { applicationId, userId, provider: 'ympl' } });
  if (!ref) return null;
  const updated = await prisma.partnerReferral.update({
    where: { id: ref.id },
    data: {
      appliedAt: ref.appliedAt ?? new Date(), // stamp once; don't move the first-applied time
      ...(lender ? { appliedLender: lender } : {}),
    },
  });
  // Refresh journeyStatus in the background (don't block the response).
  getReferralStatus(applicationId, userId).catch(() => {});
  return updated;
}
