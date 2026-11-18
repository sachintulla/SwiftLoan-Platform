/**
 * Digitap "Mobile to Prefill" (API doc v1.4): a verified mobile number in, the person's details out
 * (name, date of birth, gender, PAN, email, addresses, score, and — when Digitap has enabled the
 * options on our client ID — alternate mobile numbers and employment details).
 *
 * This file is the provider side only: configuration, the request, and the mapping of the answer into
 * our own shape. It never touches the database (see lib/mobilePrefill.ts for that).
 *
 * Off unless DIGITAP_BASE_URL + DIGITAP_CLIENT_ID + DIGITAP_CLIENT_SECRET are all set AND the admin
 * switch `prefill.digitapEnabled` (env DIGITAP_ENABLED) is on.
 *
 * Billing: only a `result_code` 101 is charged. A 503 "source error" must not be retried.
 */
import { randomUUID } from 'node:crypto';
import { recordApiLog } from './apiLog.js';
import { scoped } from './log.js';

const log = scoped('digitap');

/** Digitap's demo host. A test-names list (DIGITAP_TEST_NAMES) is honoured ONLY against this host. */
export const DIGITAP_UAT_HOST = 'svcdemo.digitap.work';
const PATH = '/mobile_prefill/request';
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

type Env = Record<string, string | undefined>;

export interface DigitapConfig {
  url: string;
  isUat: boolean;
  clientId: string;
  clientSecret: string;
  /** "First Last" pairs for sandbox testing; always empty outside the UAT host. */
  testNames: { first: string; last: string }[];
  nameFallback: 0 | 1;
  timeoutMs: number;
}

/** The connection settings, or null when the integration is not configured (then nothing is ever called). */
export function digitapConfig(env: Env = process.env): DigitapConfig | null {
  const base = (env.DIGITAP_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const clientId = (env.DIGITAP_CLIENT_ID ?? '').trim();
  const clientSecret = (env.DIGITAP_CLIENT_SECRET ?? '').trim();
  if (!base || !clientId || !clientSecret) return null;
  let host = '';
  try {
    const u = new URL(base);
    host = u.hostname.toLowerCase();
    // Credentials + personal data: never over plain http (a local test double on this machine is the one exception).
    if (u.protocol !== 'https:' && host !== '127.0.0.1' && host !== 'localhost') return null;
  } catch {
    return null;
  }
  const isUat = host === DIGITAP_UAT_HOST;
  const url = base.endsWith(PATH) ? base : `${base}${PATH}`;
  const timeout = Number(env.DIGITAP_TIMEOUT_MS);
  return {
    url,
    isUat,
    clientId,
    clientSecret,
    testNames: isUat ? parseTestNames(env.DIGITAP_TEST_NAMES) : [],
    nameFallback: String(env.DIGITAP_NAME_FALLBACK ?? '').trim() === '1' ? 1 : 0,
    timeoutMs: Number.isFinite(timeout) && timeout >= 1000 ? Math.min(timeout, 30_000) : 10_000,
  };
}

/** "Asha Rao, Vikram Singh Rathore" → [{first:'Asha',last:'Rao'},{first:'Vikram',last:'Singh Rathore'}]. Entries without two words are dropped. */
export function parseTestNames(raw: string | undefined): { first: string; last: string }[] {
  return String(raw ?? '')
    .split(/[,\n;]/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter((s) => /^[A-Za-z][A-Za-z .'-]*$/.test(s))
    .map((s) => {
      const [first, ...rest] = s.split(' ');
      return { first: first!, last: rest.join(' ') };
    })
    .filter((n) => n.first && n.last);
}

export interface NameChoice {
  first: string;
  last: string;
  source: 'profile' | 'test_list';
}

/**
 * The name sent with the lookup:
 *   1. the person's own name from our records, when we have a first AND last name;
 *   2. on the UAT host only, a random entry of the test-names list;
 *   3. otherwise none — the request then asks Digitap's own name lookup (`name_lookup: 1`).
 */
export function chooseName(
  cfg: Pick<DigitapConfig, 'isUat' | 'testNames'>,
  known: { firstName?: string | null; lastName?: string | null; fullName?: string | null },
  random: () => number = Math.random,
): NameChoice | null {
  const clean = (v?: string | null) => String(v ?? '').trim().replace(/\s+/g, ' ');
  let first = clean(known.firstName);
  let last = clean(known.lastName);
  if (!first || !last) {
    const words = clean(known.fullName).split(' ').filter(Boolean);
    if (words.length > 1) {
      first = words[0]!;
      last = words.slice(1).join(' ');
    }
  }
  if (first && last) return { first, last, source: 'profile' };
  if (cfg.isUat && cfg.testNames.length) {
    const pick = cfg.testNames[Math.min(cfg.testNames.length - 1, Math.floor(random() * cfg.testNames.length))]!;
    return { first: pick.first, last: pick.last, source: 'test_list' };
  }
  return null;
}

/** The extras we ask for. `official_documents` and `alternate_emails` are deliberately never requested. */
export const DIGITAP_OPTIONS = ['alternate_mobile_numbers', 'additional_details'] as const;

export interface DigitapRequestBody {
  client_ref_num: string;
  mobile_no: string;
  name_lookup: 0 | 1;
  first_name?: string;
  last_name?: string;
  name_fallback?: 0 | 1;
  options?: string[];
}

/** Build the request body. `phone` is our stored number; only its last 10 digits are sent. */
export function buildDigitapRequest(p: {
  phone: string;
  name: NameChoice | null;
  nameFallback: 0 | 1;
  withOptions: boolean;
  clientRefNum?: string;
}): DigitapRequestBody {
  const body: DigitapRequestBody = {
    // Max 45 chars, [a-zA-Z0-9_-] only: "sl_" + a 32-char id.
    client_ref_num: p.clientRefNum ?? `sl_${randomUUID().replace(/-/g, '')}`,
    mobile_no: p.phone.replace(/\D/g, '').slice(-10),
    name_lookup: p.name ? 0 : 1,
  };
  if (p.name) {
    body.first_name = p.name.first;
    body.last_name = p.name.last;
    body.name_fallback = p.nameFallback;
  }
  if (p.withOptions) body.options = [...DIGITAP_OPTIONS];
  return body;
}

// ── Response mapping ─────────────────────────────────────────────────────────

/** What we keep of a Digitap answer. Everything optional: Digitap may omit any field. */
export interface DigitapDetails {
  pan?: string;
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dob?: string; // YYYY-MM-DD
  /** As Digitap returned it. For display, work the age out from `dob` so it never goes stale. */
  age?: number;
  gender?: 'male' | 'female' | 'other';
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  /** Most recently reported alternate number (10 digits), never the login number itself. */
  alternateMobile?: string;
  /** Digitap's words, e.g. "SALARIED". */
  occupation?: string;
  /** Our own employment type, when the occupation maps onto one. */
  employment?: 'salaried' | 'self_employed' | 'business_owner' | 'student' | 'retired';
  /** Exactly as Digitap sent it, e.g. "4,00,001 - 6,00,000". Monthly or yearly is NOT stated by the API doc. */
  incomeRange?: string;
  /** The highest number in `incomeRange` (whole rupees). */
  incomeMax?: number;
  creditScore?: number;
}

export type DigitapOutcome =
  | { status: 'found'; requestId: string | null; details: DigitapDetails }
  | { status: 'not_found'; requestId: string | null; reason: 'no_record' | 'name_not_found' | 'no_usable_data' }
  | { status: 'error'; requestId: string | null; httpStatus: number; message: string; retryable: boolean; optionsNotEnabled: boolean };

const text = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s && s.toLowerCase() !== 'null' ? s : undefined;
};

/** "19-09-2001" / "19/09/2001" / "2001-09-19" → "2001-09-19". Anything else: undefined. */
export function toIsoDate(v: unknown): string | undefined {
  const s = text(v);
  if (!s) return undefined;
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const [y, m, d] = dmy ? [+dmy[3]!, +dmy[2]!, +dmy[1]!] : ymd ? [+ymd[1]!, +ymd[2]!, +ymd[3]!] : [0, 0, 0];
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCFullYear() < 1900 || date.getTime() > Date.now()) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const dateKey = (v: unknown) => toIsoDate(v) ?? '';

function toGender(v: unknown): DigitapDetails['gender'] {
  const s = text(v)?.toLowerCase();
  if (!s) return undefined;
  if (s === 'm' || s === 'male') return 'male';
  if (s === 'f' || s === 'female') return 'female';
  return 'other';
}

/** "SALARIED" → salaried, and the other obvious ones. An unrecognised word maps to nothing (the user picks). */
export function toEmployment(v: unknown): DigitapDetails['employment'] {
  const s = text(v)?.toLowerCase().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  if (/^salaried/.test(s)) return 'salaried';
  if (/self ?employed|professional/.test(s)) return 'self_employed';
  if (/business/.test(s)) return 'business_owner';
  if (/student/.test(s)) return 'student';
  if (/retired|pension/.test(s)) return 'retired';
  return undefined;
}

/** "4,00,001 - 6,00,000" → 600000; "Above 10,00,000" → 1000000. Undefined when there is no number. */
export function incomeRangeMax(v: unknown): number | undefined {
  const s = text(v);
  if (!s) return undefined;
  const nums = (s.match(/\d[\d,]*/g) ?? [])
    .map((n) => Number(n.replace(/,/g, '')))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return nums.length ? Math.max(...nums) : undefined;
}

function toScore(v: unknown): number | undefined {
  const n = Number(text(v));
  // Bureau scores run 300–900; anything else ("-1", "NH", 0) is "no score", not a score.
  return Number.isInteger(n) && n >= 300 && n <= 900 ? n : undefined;
}

function splitName(full: string | undefined): Pick<DigitapDetails, 'fullName' | 'firstName' | 'middleName' | 'lastName'> {
  const words = (full ?? '').split(' ').filter(Boolean);
  if (!words.length) return {};
  return {
    fullName: words.join(' '),
    firstName: words[0],
    middleName: words.length > 2 ? words.slice(1, -1).join(' ') : undefined,
    lastName: words.length > 1 ? words[words.length - 1] : undefined,
  };
}

/** The most recently reported address; one with a PIN code wins a tie. */
function latestAddress(list: unknown): Pick<DigitapDetails, 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'pincode'> {
  if (!Array.isArray(list)) return {};
  const rows = list.filter((a) => a && typeof a === 'object') as Record<string, unknown>[];
  if (!rows.length) return {};
  const pin = (a: Record<string, unknown>) => (/^\d{6}$/.test(text(a.postal_code) ?? '') ? text(a.postal_code) : undefined);
  const best = [...rows].sort((a, b) => dateKey(b.reported_date).localeCompare(dateKey(a.reported_date)) || Number(!!pin(b)) - Number(!!pin(a)))[0]!;
  const second = [text(best.second_line_of_address), text(best.third_line_of_address)].filter(Boolean).join(', ');
  return {
    addressLine1: text(best.first_line_of_address),
    addressLine2: second || undefined,
    city: text(best.city),
    state: text(best.state),
    pincode: pin(best),
  };
}

/** The most recently reported alternate number that is a valid Indian mobile and not the login number. */
function latestAlternateMobile(result: Record<string, unknown>, ownPhone: string): string | undefined {
  const own = ownPhone.replace(/\D/g, '').slice(-10);
  const ten = (v: unknown) => {
    const d = String(v ?? '').replace(/\D/g, '').slice(-10);
    return /^[6-9]\d{9}$/.test(d) && d !== own ? d : undefined;
  };
  const dated = (result.additional_details as any)?.alternate_mobile_numbers;
  if (Array.isArray(dated)) {
    const sorted = dated
      .filter((r) => r && typeof r === 'object' && ten(r.mobile_number))
      .sort((a, b) => dateKey(b.reported_date).localeCompare(dateKey(a.reported_date)));
    if (sorted.length) return ten(sorted[0].mobile_number);
  }
  const plain = result.alternate_mobile_numbers;
  if (Array.isArray(plain)) for (const n of plain) if (ten(n)) return ten(n);
  return undefined;
}

/** Map a parsed Digitap answer (any HTTP status) into our outcome. Never throws. */
export function mapDigitapResponse(httpStatus: number, body: any, ownPhone = ''): DigitapOutcome {
  const requestId = text(body?.request_id) ?? null;
  const code = Number(body?.result_code);
  const message = text(body?.message) ?? (httpStatus ? `HTTP ${httpStatus}` : 'no response');

  if (httpStatus === 200 && code === 102) return { status: 'not_found', requestId, reason: 'no_record' };
  if (httpStatus === 200 && code === 103) return { status: 'not_found', requestId, reason: 'name_not_found' };
  if (httpStatus !== 200 || code !== 101 || !body?.result || typeof body.result !== 'object') {
    return {
      status: 'error',
      requestId,
      httpStatus,
      message,
      // The doc: a 503 "source error" must not be retried. A timeout (status 0), 429 or other 5xx may be.
      retryable: httpStatus === 0 || httpStatus === 429 || (httpStatus >= 500 && httpStatus !== 503),
      optionsNotEnabled: httpStatus === 403 && /not enabled/i.test(message),
    };
  }

  const r = body.result as Record<string, unknown>;
  const panRaw = text(r.pan)?.toUpperCase().replace(/\s+/g, '');
  const email = text(r.email)?.toLowerCase();
  const ageNum = Number(text(r.age));
  const employmentDetails = ((r.additional_details as any)?.employment_details ?? {}) as Record<string, unknown>;
  const incomeRange = text(employmentDetails.income_range);
  const occupation = text(employmentDetails.occupation);

  const details: DigitapDetails = {
    pan: panRaw && PAN_RE.test(panRaw) ? panRaw : undefined,
    ...splitName(text(r.name)),
    dob: toIsoDate(r.dob),
    age: Number.isInteger(ageNum) && ageNum > 0 && ageNum < 120 ? ageNum : undefined,
    gender: toGender(r.gender),
    email: email && /^\S+@\S+\.\S+$/.test(email) ? email : undefined,
    ...latestAddress(r.address),
    alternateMobile: latestAlternateMobile(r, ownPhone),
    occupation,
    employment: toEmployment(occupation),
    incomeRange,
    incomeMax: incomeRangeMax(incomeRange),
    creditScore: toScore(r.score),
  };
  for (const k of Object.keys(details) as (keyof DigitapDetails)[]) if (details[k] === undefined) delete details[k];
  if (!Object.keys(details).length) return { status: 'not_found', requestId, reason: 'no_usable_data' };
  return { status: 'found', requestId, details };
}

/**
 * The copy of Digitap's answer we keep (encrypted). Other identity documents (voter ID, passport, driving
 * licence …) and alternate emails are dropped: we do not need them, so we do not hold them.
 */
export function rawForStorage(body: any): unknown {
  if (!body || typeof body !== 'object' || !body.result || typeof body.result !== 'object') return body ?? null;
  const { official_documents: _docs, alternate_emails: _emails, ...result } = body.result as Record<string, unknown>;
  const extra = result.additional_details;
  if (extra && typeof extra === 'object') {
    const { alternate_emails: _e, ...rest } = extra as Record<string, unknown>;
    result.additional_details = rest;
  }
  return { ...body, result };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function post(cfg: DigitapConfig, body: DigitapRequestBody): Promise<{ status: number; body: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const startedAt = Date.now();
  let out: { status: number; body: any; error?: string };
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* non-JSON (gateway page) */ }
    out = { status: res.status, body: parsed, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    out = { status: 0, body: null, error: e?.name === 'AbortError' ? `timed out after ${cfg.timeoutMs}ms` : String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
  // UAT only, always on there (no switch): the complete request and the complete answer, so a test call can be read
  // in the server log on the dev box. Keyed on the UAT host, so it can never happen against production, where the
  // answer holds real customers' PAN, address and score. The client secret (Authorization header) is never printed.
  if (cfg.isUat) {
    console.log(`[digitap-req] POST ${cfg.url} ${JSON.stringify(body)}`);
    console.log(`[digitap-res] HTTP ${out.status || 'no response'} in ${Date.now() - startedAt}ms${out.error ? ` (${out.error})` : ''} ${JSON.stringify(out.body)}`);
  }
  // Internal /logs page: the envelope only. The person's details (and the number/name we sent) are never logged.
  recordApiLog({
    direction: 'outbound', source: 'swiftloan-api', target: 'digitap', method: 'POST', url: cfg.url,
    status: out.status || null, durationMs: Date.now() - startedAt,
    requestBody: { client_ref_num: body.client_ref_num, name_lookup: body.name_lookup, name_fallback: body.name_fallback ?? null, options: body.options ?? [] },
    responseBody: out.body && typeof out.body === 'object'
      ? { http_response_code: out.body.http_response_code, result_code: out.body.result_code, message: out.body.message, request_id: out.body.request_id }
      : null,
    error: out.error ?? null,
  });
  return out;
}

export interface DigitapCallResult {
  outcome: DigitapOutcome;
  /** For storage (already stripped of documents / alternate emails); null when there was no usable body. */
  raw: unknown;
  nameSource: 'profile' | 'test_list' | 'name_lookup';
  usedOptions: boolean;
}

/**
 * One lookup for one verified mobile number. Asks for the extras first; if Digitap answers that an option
 * is not enabled for our client ID (403), asks once more without them so the basic details still arrive.
 */
export async function callDigitapMobilePrefill(
  cfg: DigitapConfig,
  p: { phone: string; firstName?: string | null; lastName?: string | null; fullName?: string | null },
): Promise<DigitapCallResult> {
  const name = chooseName(cfg, p);
  const nameSource = name ? name.source : 'name_lookup';
  let usedOptions = true;
  let res = await post(cfg, buildDigitapRequest({ phone: p.phone, name, nameFallback: cfg.nameFallback, withOptions: true }));
  let outcome = mapDigitapResponse(res.status, res.body, p.phone);
  if (outcome.status === 'error' && outcome.optionsNotEnabled) {
    log.warn('digitap options not enabled for this client; retrying without them', { message: outcome.message });
    usedOptions = false;
    res = await post(cfg, buildDigitapRequest({ phone: p.phone, name, nameFallback: cfg.nameFallback, withOptions: false }));
    outcome = mapDigitapResponse(res.status, res.body, p.phone);
  }
  log.info('mobile prefill answered', {
    status: outcome.status, httpStatus: res.status, nameSource, usedOptions, uat: cfg.isUat,
    ...(outcome.status === 'error' ? { message: outcome.message } : {}),
    ...(outcome.status === 'not_found' ? { reason: outcome.reason } : {}),
  });
  return { outcome, raw: outcome.status === 'found' ? rawForStorage(res.body) : null, nameSource, usedOptions };
}
