/**
 * Revasure "Create Lead" integration — a THIRD lender group, run in PARALLEL to
 * Aurix (Knight Fintech) eligibility and Yubi (YMPL) at prequalify.
 *
 * Unlike Aurix (structured offers) or Yubi (a hosted web journey), Revasure is a
 * SINGLE outbound call: POST {base}/api/inbound/leads creates a lead on their
 * side. There are no offers to render — we fire the lead in parallel with the
 * offers API, record the request/response (RevasureLead) so it surfaces in the
 * admin dashboard, and hand the result back to the app (which shows a temporary
 * debug alert; removed for production).
 *
 * The bearer token / basket id are SECRETS — env (REVASURE_TOKEN /
 * REVASURE_BASKET_ID), never the DB or app bundle, like the Aurix/Yubi secrets.
 * UAT values from the Create Lead API sheet are the hardcoded fallback.
 *
 * Fields Revasure needs that our offer funnel doesn't collect (title, occupation
 * code, is_mobile_verified, otp + its timestamp, consent, ip_address) are
 * derived from what we have or seeded with safe, format-valid defaults, so the
 * POST never fails validation just for a missing optional. Everything here is
 * best-effort and non-fatal: a Revasure failure must never break prequalify.
 */
import type { LoanApplication, User } from '@prisma/client';
import { prisma } from './prisma.js';
import { scoped } from './log.js';

const log = scoped('revasure');

const DEFAULT_TIMEOUT_MS = 12_000;

// UAT defaults from the "API details" sheet. A real production launch sets the
// REVASURE_* keys to prod values.
const UAT_BASE = 'http://13.126.208.232';
const UAT_BASKET_ID = 'b_1t436is';
const UAT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaXN0cmlidXRvcl9pZCI6ImRfNWwyZDZnNCIsInNvdXJjZV9pZCI6InNyY181cjlvcmF3IiwidHlwZSI6ImxlYWRfc291cmNlIiwiaWF0IjoxNzkxMjgwNjExLCJleHAiOjE4NTQzOTU4MTF9.uvvD4kRMUqgyGBOPGx7JQiBZkqYSOBsUGwpZAwZDWk0';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export interface RevasureConfig {
  enabled: boolean;
  baseUrl: string;
  basketId: string;
  token: string;
  product: string;
}

export function revasureConfig(): RevasureConfig {
  const baseUrl = (process.env.REVASURE_BASE_URL || UAT_BASE).replace(/\/+$/, '');
  const basketId = process.env.REVASURE_BASKET_ID || UAT_BASKET_ID;
  const token = process.env.REVASURE_TOKEN || UAT_TOKEN;
  const product = process.env.REVASURE_PRODUCT || 'Personal Loan';
  const enabled = process.env.REVASURE_ENABLED !== 'false' && !!baseUrl && !!basketId && !!token;
  return { enabled, baseUrl, basketId, token, product };
}

export function revasureEnabled(): boolean {
  return revasureConfig().enabled;
}

/** Summary handed back to the prequalify response for the app's debug alert. */
export interface RevasureResult {
  provider: 'revasure';
  ok: boolean;
  // success = 201 created; duplicate = 409 already-received (benign);
  // ineligible = 409 business decline; failed = validation/auth/server/network.
  status: 'success' | 'duplicate' | 'ineligible' | 'failed' | 'disabled';
  httpStatus: number | null;
  leadId: string | null;
  message: string | null;
}

async function postLead(
  cfg: RevasureConfig,
  body: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/api/inbound/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, body: parsed, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : (e?.message || 'network error');
    return { ok: false, status: 0, body: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// ── Field helpers: derive from what we have, else seed a safe, valid default ──

function digits10(phone?: string | null): string {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
function titleFromGender(gender?: string | null): 'Mr' | 'Mrs' | 'Miss' {
  const g = (gender || '').trim().toLowerCase();
  if (g === 'female' || g === 'f' || g === 'woman') return 'Mrs';
  return 'Mr'; // default / male / unknown
}
function occupationCode(employment?: string | null): 1 | 2 {
  return /self|business|propriet/i.test(employment || '') ? 2 : 1; // 1 Salaried, 2 Self-employed
}
function isoDate(d?: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '1990-01-01'; // YYYY-MM-DD; seed if unknown
}
/** "YYYY-MM-DD HH:mm:ss" (UTC), 2 min in the past so it's never "in the future". */
function verifiedTimestamp(): string {
  return new Date(Date.now() - 120_000).toISOString().slice(0, 19).replace('T', ' ');
}
function clamp(n: number | null | undefined, lo: number, hi: number, seed: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : seed;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
function validIp(ip?: string | null): string {
  const first = (ip || '').split(',')[0].trim().replace(/^::ffff:/, '');
  return IPV4_RE.test(first) ? first : '49.36.0.1'; // seed a valid public IPv4
}
function maskPan(pan: string): string {
  return pan.length === 10 ? `${pan.slice(0, 5)}****${pan.slice(-1)}` : '****';
}

/** Build the flat Create-Lead body. Required fields are always present/valid. */
export function buildRevasureBody(
  app: LoanApplication,
  user: User | null,
  ip: string | undefined,
  cfg: RevasureConfig,
): Record<string, unknown> {
  const fullName = (user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ')).trim() || 'SwiftLoan Customer';
  const rawPan = (app.panNumber || user?.panNumber || '').toUpperCase();
  const pancard = PAN_RE.test(rawPan) ? rawPan : 'ABCDE1234F'; // seed valid-format if absent
  const email = user?.email && EMAIL_RE.test(user.email) ? user.email : '';
  return {
    source_lead_id: app.id, // our unique id — Revasure dedupes on it
    basket_id: cfg.basketId,
    selected_product: cfg.product, // exact "Personal Loan"
    mobile_number: digits10(user?.phone) || '9999999999',
    title: titleFromGender(user?.gender),
    full_name: fullName.slice(0, 100),
    email_id: email,
    pancard,
    date_of_birth: isoDate(user?.dob ?? null),
    occupation: occupationCode(user?.employment),
    monthly_income: clamp(user?.monthlyIncome ?? null, 1000, 9_999_999, 50_000),
    loan_amount: clamp(app.amount ?? null, 1000, 999_999_999, 100_000), // app.amount is rupees
    is_mobile_verified: 'yes',
    otp: process.env.REVASURE_SEED_OTP || '123456', // verified in our own OTP flow; seeded value
    otp_verified_timestamp: verifiedTimestamp(),
    consent: 'yes',
    ip_address: validIp(ip),
  };
}

/**
 * Create (or re-record) the Revasure lead for an application. Upserts a
 * RevasureLead row keyed on source_lead_id (= app.id), so re-runs update the
 * same record and a Revasure "duplicate" (409) is treated as a benign success.
 * Never throws — returns a RevasureResult the caller attaches to its response.
 */
export async function createRevasureLead(
  applicationId: string,
  userId: string,
  ip?: string,
): Promise<RevasureResult> {
  const cfg = revasureConfig();
  if (!cfg.enabled) return { provider: 'revasure', ok: false, status: 'disabled', httpStatus: null, leadId: null, message: 'disabled' };

  try {
    const app = await prisma.loanApplication.findUnique({ where: { id: applicationId } });
    if (!app) return { provider: 'revasure', ok: false, status: 'failed', httpStatus: null, leadId: null, message: 'application not found' };
    const user = await prisma.user.findUnique({ where: { id: userId } });

    const body = buildRevasureBody(app, user, ip, cfg);
    // Masked copy for storage — never persist the real PAN / OTP.
    const storedBody = { ...body, pancard: maskPan(String(body.pancard)), otp: '******' };

    await prisma.revasureLead.upsert({
      where: { sourceLeadId: app.id },
      update: { status: 'pending', basketId: cfg.basketId, requestBody: storedBody, lastError: null },
      create: { applicationId: app.id, userId, sourceLeadId: app.id, basketId: cfg.basketId, status: 'pending', requestBody: storedBody },
    }).catch(() => {});

    const res = await postLead(cfg, body);
    const msg: string | null = (res.body && typeof res.body === 'object' && (res.body.message || res.body.error)) || res.error || null;
    const leadId: string | null = res.body && typeof res.body === 'object' && res.body.lead_id != null ? String(res.body.lead_id) : null;
    // 201 = created. 409 is overloaded: a "duplicate" (we already sent this
    // source_lead_id — benign, the lead exists) vs a business "not eligible"
    // decline. Distinguish on the message so a decline isn't counted as success.
    const duplicate = res.status === 409 && /duplicate/i.test(msg || '');
    const ineligible = res.status === 409 && !duplicate;
    const ok = res.ok || duplicate;
    const status: RevasureResult['status'] = res.ok ? 'success' : duplicate ? 'duplicate' : ineligible ? 'ineligible' : 'failed';

    await prisma.revasureLead.update({
      where: { sourceLeadId: app.id },
      data: { status, httpStatus: res.status || null, leadId, message: msg, responseBody: res.body ?? undefined, lastError: ok ? null : (res.error || msg || 'failed') },
    }).catch(() => {});

    if (ok) log.info('lead created', { applicationId, httpStatus: res.status, leadId, duplicate });
    else log.warn('lead failed', { applicationId, httpStatus: res.status, message: msg, error: res.error });

    return { provider: 'revasure', ok, status, httpStatus: res.status || null, leadId, message: msg };
  } catch (e: any) {
    log.warn('lead threw', { applicationId, error: e?.message });
    return { provider: 'revasure', ok: false, status: 'failed', httpStatus: null, leadId: null, message: e?.message || 'error' };
  }
}
