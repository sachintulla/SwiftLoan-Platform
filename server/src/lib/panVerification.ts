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
 * The full raw response is kept (encrypted) and every cached read is re-mapped
 * from it, so a mapping change applies to PANs already paid for — no re-call.
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
  email?: string;
  /** Aurix's already-masked Aadhaar (e.g. 12XXXXXXXX34) — only ever the masked form. */
  maskedAadhaar?: string;
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

// ── Response mapping ──

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

/**
 * Map a pan_comprehensive response. Confirmed live shape (UAT, Sep 2026):
 *
 *   { Meta: { Success, Message },
 *     Data: { PanNumber, Success, Error, Status, Message, ErrorResponse,
 *             Data: { FullName, FullNameSplit[], DateOfBirth "DD-MM-YYYY",
 *                     Gender "M"|"F", Category, AadhaarLinked, EmailId,
 *                     AddressLine1, AddressLine2, City, State, PinCode, … } } }
 *
 * Lookups are case-insensitive with a few aliases so a minor Aurix rename
 * degrades to a missing pre-fill field, not a crash.
 */
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
  const outer = root?.Data ?? {};
  // Person details sit one level down (Data.Data); fall back to Data itself.
  const d = outer?.Data && typeof outer.Data === 'object' && !Array.isArray(outer.Data) ? outer.Data : outer;
  const pick = (...keys: string[]) => {
    const lower = new Map(Object.keys(d ?? {}).map((k) => [k.toLowerCase(), k]));
    for (const k of keys) {
      const hit = lower.get(k.toLowerCase());
      if (hit !== undefined && d[hit] !== null && d[hit] !== '') return d[hit];
    }
    return undefined;
  };

  // Both envelopes must agree: Meta.Success and the inner Data.Success/Error.
  const success = meta?.Success === true && outer?.Success !== false && outer?.Error !== true;
  const failureText = str(outer?.ErrorResponse?.Message ?? outer?.ErrorResponse) ?? (outer?.Success === false ? str(outer?.Message) : undefined);

  // Only an explicit negative overrides success — never an unrecognised word.
  const status = str(pick('PanStatus', 'PanStatusDescription'))?.toLowerCase();
  const explicit = pick('Verified', 'IsValid', 'IsVerified');
  const negativeStatus = !!status && /invalid|deactivat|not ?found|fake|deleted|inoperative|no record/.test(status);
  const verified = success && explicit !== false && !negativeStatus;

  const split: string[] = Array.isArray(d?.FullNameSplit) ? d.FullNameSplit.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const full = str(pick('FullName', 'Name', 'NameOnCard')) || (split.length ? split.join(' ') : undefined);
  const words = split.length ? split : full ? full.split(/\s+/) : [];
  const email = str(pick('EmailId', 'Email'));
  // Pass the masked Aadhaar on only if it really is masked (≤ 4 visible
  // digits) — never forward a full Aadhaar number, whatever Aurix sends.
  const masked = str(pick('MaskedAadhaar'))?.replace(/\s+/g, '');
  const maskedAadhaar = masked && /^[0-9X*]{12}$/i.test(masked) && (masked.match(/\d/g) ?? []).length <= 4 ? masked.toUpperCase() : undefined;

  return {
    success,
    message: success ? str(meta?.Message) : failureText ?? str(meta?.Message),
    verified,
    category: str(pick('Category', 'PanType', 'TypeOfHolder')) ?? null,
    aadhaarLinked: toBool(pick('AadhaarLinked', 'AadhaarSeedingStatus', 'IsAadhaarLinked')),
    prefill: {
      fullName: full,
      firstName: str(pick('FirstName')) ?? words[0],
      middleName: str(pick('MiddleName')) ?? (words.length > 2 ? words.slice(1, -1).join(' ') : undefined),
      lastName: str(pick('LastName')) ?? (words.length > 1 ? words[words.length - 1] : undefined),
      dob: toIsoDate(pick('DateOfBirth', 'Dob', 'DOB')),
      gender: toGender(pick('Gender', 'Sex')),
      email: email && /^\S+@\S+\.\S+$/.test(email) ? email : undefined,
      maskedAadhaar,
      addressLine1: str(pick('AddressLine1', 'Line1')),
      addressLine2: str(pick('AddressLine2', 'Line2')),
      city: str(pick('City', 'Town')),
      district: str(pick('District')),
      state: str(pick('State')),
      pincode: str(pick('PinCode', 'Pincode', 'PostalCode')),
    },
  };
}

// ── Lookup / verify ──────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<PanVerifyResult>>();

type PanRecordRow = { id: string; status: string; verified: boolean; category: string | null; aadhaarLinked: boolean | null; verifiedAt: Date | null; dataEnc: string | null; createdAt: Date };

/**
 * Re-derive a cached record from its stored raw Aurix response with the
 * CURRENT mapping, and persist any change. Mapping fixes therefore apply to
 * PANs already paid for — no second Aurix call.
 */
async function remapFromRaw<T extends PanRecordRow>(rec: T): Promise<T> {
  if (!rec.dataEnc) return rec;
  const data = decryptJson<PanRecordData>(rec.dataEnc);
  if (!data.raw) return rec;
  const m = mapPanResponse(data.raw);
  const verified = m.success && m.verified;
  const prefill = verified ? m.prefill : {};
  const changed =
    verified !== rec.verified || m.category !== rec.category || m.aadhaarLinked !== rec.aadhaarLinked ||
    JSON.stringify(prefill) !== JSON.stringify(data.prefill ?? {});
  if (!changed) return rec;
  const fields = {
    status: verified ? 'verified' : 'invalid',
    verified,
    category: m.category,
    aadhaarLinked: m.aadhaarLinked,
    verifiedAt: verified ? rec.verifiedAt ?? rec.createdAt : null,
    dataEnc: encryptJson({ ...data, prefill }),
    ...(verified ? { expiresAt: null } : {}),
  };
  log.info('pan record remapped from stored response', { panRecordId: rec.id, verified });
  return (await prisma.panRecord.update({ where: { id: rec.id }, data: fields })) as unknown as T;
}

/**
 * Why a PAN wasn't verified, in Aurix's own words when it gave any — its
 * Meta.Message on a failed lookup, or the PAN status text on a "successful"
 * lookup of an invalid PAN. Generic text only when Aurix said nothing usable.
 */
function failureMessage(raw: unknown): string {
  const m = raw ? mapPanResponse(raw) : null;
  const root = (raw as any)?.Result ?? raw;
  const inner = root?.Data?.Data ?? root?.Data ?? {};
  const statusText = str(inner?.PanStatusDescription ?? inner?.PanStatus);
  if (m && !m.success && m.message) return m.message;
  if (statusText) return `PAN status: ${statusText}`;
  return 'We couldn’t verify this PAN. Please check the number and try again.';
}

function fromRecord(rec: { status: string; verified: boolean; category: string | null; aadhaarLinked: boolean | null; verifiedAt: Date | null; dataEnc: string | null }, source: PanVerifyResult['source']): PanVerifyResult {
  const data = rec.dataEnc ? decryptJson<PanRecordData>(rec.dataEnc) : null;
  return {
    status: rec.status === 'verified' ? 'verified' : 'invalid',
    verified: rec.verified,
    category: rec.category,
    aadhaarLinked: rec.aadhaarLinked,
    verifiedAt: rec.verifiedAt?.toISOString() ?? null,
    prefill: rec.status === 'verified' ? data?.prefill ?? {} : {},
    message: rec.status === 'verified' ? undefined : failureMessage(data?.raw),
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

  const found = await prisma.panRecord.findUnique({ where: { panHash: hash } });
  const cached = found ? await remapFromRaw(found) : null;
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

  let res: Awaited<ReturnType<typeof callAurixPanComprehensive>>;
  try {
    res = await callAurixPanComprehensive(user, pan);
  } catch (e: any) {
    // Token generation / config failure — same user-facing outcome as a
    // transport error, and likewise not cached.
    log.error('pan_comprehensive not attempted', { userId: user.id, error: String(e?.message ?? e) });
    throw new HttpError(502, 'We couldn’t verify your PAN right now. Please try again in a moment.');
  }
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
  try {
    const found = await prisma.panRecord.findUnique({ where: { panHash: panHash(pan) } });
    const rec = found ? await remapFromRaw(found) : null;
    if (!rec || rec.status !== 'verified') return null;
    return { verified: rec.verified, category: rec.category, aadhaarLinked: rec.aadhaarLinked, verifiedAt: rec.verifiedAt };
  } catch (e: any) {
    // Never let the PAN cache break offers — fall back to the assumed DTO.
    log.warn('pan record lookup failed; eligible_offers uses assumed PAN DTO', { error: String(e?.message ?? e) });
    return null;
  }
}
