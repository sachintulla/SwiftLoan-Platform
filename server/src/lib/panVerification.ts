/**
 * PAN verification + pre-fill, backed by Aurix PAN Comprehensive (a PAID call).
 *
 * Rule: a PAN is paid for at most once. Every lookup goes to the PanRecord
 * table first (keyed by an HMAC of the PAN — see lib/pii.ts); Aurix is only
 * called for a PAN we have never seen, or whose negative ("invalid") result
 * has expired. Personal details are stored AES-256-GCM encrypted.
 *
 * Extra guards on the paid call:
 *   • PAN format is validated before anything else (typos never reach Aurix)
 *   • concurrent requests for the same PAN share one in-flight call
 *   • per-user cap on NEW (uncached) PAN lookups per 24h (PAN_DAILY_LIMIT)
 *   • "PAN not found/invalid" is negative-cached for 24h
 *
 * Cross-account use (PAN verified by account A, entered by account B) is
 * governed by PAN_SHARED_POLICY: 'allow' (default — answer from the DB, no
 * Aurix call, logged) or 'block' (409).
 *
 * NOTE: the pan_comprehensive response shape is mapped defensively
 * (`mapPanResponse`) pending Aurix's sample response. The full raw response is
 * kept (encrypted), so the mapping can be corrected later WITHOUT re-paying.
 */
import type { User } from '@prisma/client';
import { prisma } from './prisma.js';
import { callAurixPanComprehensive } from './lenderOffers.js';
import { panHash, normalisePan, encryptJson, decryptJson, PII_KEY_VERSION } from './pii.js';
import { HttpError } from '../middleware/error.js';
import { scoped } from './log.js';

const log = scoped('pan');

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PAN_HOLDER_CODES = 'ABCFGHJLPT';
const NEGATIVE_TTL_MS = 24 * 60 * 60_000;
const dailyLimit = () => parseInt(process.env.PAN_DAILY_LIMIT || '5', 10);
const sharedPolicy = () => (process.env.PAN_SHARED_POLICY === 'block' ? 'block' : 'allow');

export function isValidPanFormat(pan: string): boolean {
  const p = normalisePan(pan);
  return PAN_RE.test(p) && PAN_HOLDER_CODES.includes(p[3]);
}

/** What step 2 (basic details) is pre-filled with. All optional — Aurix may omit any. */
export interface PanPrefill {
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dob?: string; // YYYY-MM-DD
  gender?: 'male' | 'female' | 'other';
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
}

interface PanRecordData {
  pan: string;
  prefill: PanPrefill;
  raw: unknown;
}

export interface PanVerifyResult {
  status: 'verified' | 'invalid';
  verified: boolean;
  category: string | null;
  aadhaarLinked: boolean | null;
  verifiedAt: string | null;
  prefill: PanPrefill;
  message?: string;
  /** 'cache' = answered from our DB (free); 'aurix' = paid call made just now. */
  source: 'cache' | 'aurix';
}

export interface PanVerificationForOffers {
  verified: boolean;
  category: string | null;
  aadhaarLinked: boolean | null;
  verifiedAt: Date | null;
}

// ── Response mapping (defensive until Aurix's sample response is confirmed) ──

/** Case-insensitive first match of any key, searched one level of nesting deep. */
function find(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined;
  const lower = new Map(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const k of keys) {
    const hit = lower.get(k.toLowerCase());
    if (hit !== undefined && obj[hit] !== null && obj[hit] !== '') return obj[hit];
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = find(v, keys);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

const str = (v: any) => (v === undefined || v === null ? undefined : String(v).trim() || undefined);

function toBool(v: any): boolean | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 'y', 'yes', 'linked', 'seeded', '1'].includes(s)) return true;
  if (['false', 'n', 'no', 'not linked', 'not seeded', '0'].includes(s)) return false;
  return null;
}

function toIsoDate(v: any): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const dmy = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/); // DD/MM/YYYY or DD-MM-YYYY
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function toGender(v: any): PanPrefill['gender'] {
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  if (s === 'm' || s === 'male') return 'male';
  if (s === 'f' || s === 'female') return 'female';
  return 'other';
}

export function mapPanResponse(body: any): {
  success: boolean;
  message?: string;
  verified: boolean;
  category: string | null;
  aadhaarLinked: boolean | null;
  prefill: PanPrefill;
} {
  const root = body?.Result ?? body;
  const meta = root?.Meta ?? {};
  const data = root?.Data ?? {};
  const success = meta?.Success === true;

  const status = str(find(data, ['PanStatus', 'Status', 'PanStatusDescription']))?.toLowerCase();
  const explicit = toBool(find(data, ['Verified', 'IsValid', 'IsVerified', 'Valid']));
  const verified = success && (explicit ?? (status ? /valid|active|existing|^e$/.test(status) && !/invalid/.test(status) : true));

  const first = str(find(data, ['FirstName', 'FName']));
  const middle = str(find(data, ['MiddleName', 'MName']));
  const last = str(find(data, ['LastName', 'LName', 'Surname']));
  const full = str(find(data, ['FullName', 'Name', 'NameOnCard', 'RegisteredName'])) ||
    [first, middle, last].filter(Boolean).join(' ') || undefined;
  const addr = find(data, ['Address', 'AddressDetails']) ?? data;

  return {
    success,
    message: str(meta?.Message),
    verified,
    category: str(find(data, ['Category', 'PanType', 'TypeOfHolder', 'HolderType'])) ?? null,
    aadhaarLinked: toBool(find(data, ['AadhaarLinked', 'AadhaarSeedingStatus', 'IsAadhaarLinked', 'AadhaarSeeded'])),
    prefill: {
      fullName: full,
      firstName: first ?? (full ? full.split(/\s+/)[0] : undefined),
      middleName: middle,
      lastName: last ?? (full && full.split(/\s+/).length > 1 ? full.split(/\s+/).slice(-1)[0] : undefined),
      dob: toIsoDate(find(data, ['Dob', 'DOB', 'DateOfBirth', 'BirthDate'])),
      gender: toGender(find(data, ['Gender', 'Sex'])),
      addressLine1: str(find(addr, ['AddressLine1', 'Line1', 'BuildingName', 'Address1'])),
      addressLine2: str(find(addr, ['AddressLine2', 'Line2', 'Locality', 'Address2'])),
      city: str(find(addr, ['City', 'Town'])),
      district: str(find(addr, ['District'])),
      state: str(find(addr, ['State'])),
      pincode: str(find(addr, ['Pincode', 'PinCode', 'Zip', 'PostalCode'])),
    },
  };
}

// ── Lookup / verify ──────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<PanVerifyResult>>();

function fromRecord(rec: { status: string; verified: boolean; category: string | null; aadhaarLinked: boolean | null; verifiedAt: Date | null; dataEnc: string | null }, source: PanVerifyResult['source']): PanVerifyResult {
  const data = rec.dataEnc ? decryptJson<PanRecordData>(rec.dataEnc) : null;
  return {
    status: rec.status === 'verified' ? 'verified' : 'invalid',
    verified: rec.verified,
    category: rec.category,
    aadhaarLinked: rec.aadhaarLinked,
    verifiedAt: rec.verifiedAt?.toISOString() ?? null,
    prefill: rec.status === 'verified' ? data?.prefill ?? {} : {},
    message: rec.status === 'verified' ? undefined : 'We couldn’t verify this PAN. Please check the number and try again.',
    source,
  };
}

/**
 * Verify a PAN for `user` and return pre-fill details. DB first; Aurix only
 * for a never-seen PAN (or an expired negative result).
 */
export async function verifyPan(user: User, rawPan: string): Promise<PanVerifyResult> {
  const pan = normalisePan(rawPan);
  if (!isValidPanFormat(pan)) throw new HttpError(400, 'Please enter a valid PAN (e.g. ABCPE1234F).');
  const hash = panHash(pan);

  const cached = await prisma.panRecord.findUnique({ where: { panHash: hash } });
  const fresh = cached && (cached.status === 'verified' || (cached.expiresAt && cached.expiresAt.getTime() > Date.now()));
  if (cached && fresh) {
    if (cached.ownerUserId && cached.ownerUserId !== user.id) {
      if (sharedPolicy() === 'block') throw new HttpError(409, 'This PAN is already registered with another account.');
      log.warn('pan reused across accounts (served from cache)', { panRecordId: cached.id, ownerUserId: cached.ownerUserId, userId: user.id });
    }
    await prisma.panRecord.update({ where: { id: cached.id }, data: { cacheHits: { increment: 1 } } }).catch(() => {});
    const result = fromRecord(cached, 'cache');
    if (result.verified) await attachPanToUser(user, pan);
    return result;
  }

  // Never seen (or negative result expired) → paid call, deduplicated.
  const pending = inflight.get(hash);
  if (pending) return pending;
  const p = callAndStore(user, pan, hash, cached?.id ?? null).finally(() => inflight.delete(hash));
  inflight.set(hash, p);
  return p;
}

async function callAndStore(user: User, pan: string, hash: string, existingId: string | null): Promise<PanVerifyResult> {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const used = await prisma.panRecord.count({ where: { ownerUserId: user.id, lastAurixCallAt: { gte: since } } });
  if (used >= dailyLimit()) {
    log.warn('daily PAN lookup limit reached', { userId: user.id, used });
    throw new HttpError(429, 'Too many PAN checks today. Please try again tomorrow.');
  }

  const res = await callAurixPanComprehensive(user, pan);
  if (!res.ok || !res.body) {
    // Transport/auth/5xx — NOT cached (not the PAN's fault), caller may retry.
    log.error('pan_comprehensive failed', { userId: user.id, httpStatus: res.status, error: res.error });
    throw new HttpError(502, 'We couldn’t verify your PAN right now. Please try again in a moment.');
  }

  const mapped = mapPanResponse(res.body);
  const verified = mapped.success && mapped.verified;
  const now = new Date();
  const data: PanRecordData = { pan, prefill: verified ? mapped.prefill : {}, raw: res.body };
  const fields = {
    status: verified ? 'verified' : 'invalid',
    verified,
    category: mapped.category,
    aadhaarLinked: mapped.aadhaarLinked,
    verifiedAt: verified ? now : null,
    dataEnc: encryptJson(data),
    keyVersion: PII_KEY_VERSION,
    ownerUserId: user.id,
    expiresAt: verified ? null : new Date(now.getTime() + NEGATIVE_TTL_MS),
    lastAurixCallAt: now,
  };
  const rec = existingId
    ? await prisma.panRecord.update({ where: { id: existingId }, data: fields })
    : await prisma.panRecord.create({ data: { panHash: hash, ...fields } });

  log.info('pan verified via aurix', { userId: user.id, panRecordId: rec.id, verified, aurixMessage: mapped.message });
  if (verified) await attachPanToUser(user, pan);
  const out = fromRecord(rec, 'aurix');
  if (!verified && mapped.message) out.message = mapped.message;
  return out;
}

/** Keep User.panNumber in step with the verified PAN (existing column the rest of the flow reads). */
async function attachPanToUser(user: User, pan: string) {
  if (user.panNumber === pan) return;
  await prisma.user.update({ where: { id: user.id }, data: { panNumber: pan } }).catch(e => {
    log.warn('could not attach PAN to user', { userId: user.id, error: String(e?.message ?? e) });
  });
}

/** eligible_offers' PanVerificationDTO source — DB only, never calls Aurix. */
export async function getPanVerificationForOffers(pan: string): Promise<PanVerificationForOffers | null> {
  if (!isValidPanFormat(pan)) return null;
  const rec = await prisma.panRecord.findUnique({ where: { panHash: panHash(pan) } });
  if (!rec || rec.status !== 'verified') return null;
  return { verified: rec.verified, category: rec.category, aadhaarLinked: rec.aadhaarLinked, verifiedAt: rec.verifiedAt };
}
