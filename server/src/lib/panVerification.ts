/**
 * PAN verification + pre-fill, backed by Aurix PAN Comprehensive (a PAID call).
 *
 * Rule: a PAN is paid for at most once — but ONLY a genuinely verified PAN
 * ever gets a PanRecord row (keyed by an HMAC of the PAN — see lib/pii.ts),
 * AES-256-GCM encrypted. A "not found" or a real Aurix error is never
 * written there: those are tracked on the User row instead (no PII — just
 * Aurix's status message), so a retry is always a fresh paid Aurix call,
 * never blocked by a stale cached negative result.
 *
 * Extra guards on the paid call:
 *   • PAN format is validated before anything else (typos never reach Aurix)
 *   • concurrent requests for the same PAN share one in-flight call
 *   • per-user cap on paid Aurix calls per 24h (PAN_DAILY_LIMIT) — tracked on
 *     User.panVerifyAttempts/panVerifyWindowStartAt, since a failed attempt
 *     leaves no PanRecord to count. Every call Aurix actually answered
 *     counts, success or failure — Aurix bills either way. A pure transport
 *     failure (Aurix never answered) does not count; caller may retry free.
 *
 * Cross-account use (PAN verified by account A, entered by account B) is
 * governed by PAN_SHARED_POLICY: 'allow' (default — answer from the DB, no
 * Aurix call, logged) or 'block' (409).
 *
 * The full raw response is kept (encrypted) and every cached read is re-mapped
 * from it, so a mapping change applies to PANs already paid for — no re-call.
 * Any legacy row from before this design (an "invalid" PanRecord, cached by
 * the old code) self-heals: the next lookup discards it and re-checks fresh.
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
const DAILY_WINDOW_MS = 24 * 60 * 60_000;
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
  /**
   * True only for an actual Aurix answer about this PAN (verified, or a
   * genuine "not found") — false for a technical/service error wearing a
   * 200 and Meta.Success:true. Confirmed live (UAT, Sep 2026): a real error
   * still reports Meta.Success:true, so that flag alone can't be trusted —
   * the tell is Meta.StatusCode ("200" vs "400") plus a populated
   * Data.ErrorResponse. Gates whether panVerification.ts caches anything.
   */
  hasRealData: boolean;
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

  // Meta.Success is true even on a real service error (confirmed live) — the
  // only reliable "this is an actual answer" signal is a clean 200 with no
  // ErrorResponse. Missing StatusCode (e.g. the { Result } wrapper's outer
  // shell, or a garbage body) is treated as NOT real data — fail safe.
  const hasRealData = str(meta?.StatusCode) === '200' && outer?.ErrorResponse == null;

  // Only an explicit negative overrides success — never an unrecognised word.
  const statusRaw = str(pick('PanStatus', 'PanStatusDescription'));
  const status = statusRaw?.toLowerCase();
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

  // A negative PAN status inside an otherwise-successful envelope deserves
  // its own message ("PAN status: Invalid") — Aurix's own Meta.Message would
  // just say "fetched successfully", which is true but misleading here.
  const message = !success
    ? failureText ?? str(meta?.Message)
    : negativeStatus && statusRaw ? `PAN status: ${statusRaw}` : str(meta?.Message);

  return {
    success,
    message,
    verified,
    hasRealData,
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
 *
 * A PanRecord only ever represents a genuinely verified PAN now, so any
 * record that re-maps to NOT verified (a legacy "invalid" row from before
 * this design, or the old bug that cached a service error as real data) is
 * discarded entirely — the next lookup re-checks with Aurix fresh.
 */
async function remapFromRaw<T extends PanRecordRow>(rec: T): Promise<T | null> {
  if (!rec.dataEnc) return rec;
  const data = decryptJson<PanRecordData>(rec.dataEnc);
  if (!data.raw) return rec;
  const m = mapPanResponse(data.raw);
  const verified = m.success && m.verified;
  if (!verified) {
    await prisma.panRecord.delete({ where: { id: rec.id } }).catch(() => {});
    log.warn('discarded pan record that is no longer a verified result', { panRecordId: rec.id });
    return null;
  }
  const changed =
    verified !== rec.verified || m.category !== rec.category || m.aadhaarLinked !== rec.aadhaarLinked ||
    JSON.stringify(m.prefill) !== JSON.stringify(data.prefill ?? {});
  if (!changed) return rec;
  const fields = {
    status: 'verified',
    verified,
    category: m.category,
    aadhaarLinked: m.aadhaarLinked,
    verifiedAt: rec.verifiedAt ?? rec.createdAt,
    dataEnc: encryptJson({ ...data, prefill: m.prefill }),
  };
  log.info('pan record remapped from stored response', { panRecordId: rec.id, verified });
  return (await prisma.panRecord.update({ where: { id: rec.id }, data: fields })) as unknown as T;
}

function fromRecord(rec: { category: string | null; aadhaarLinked: boolean | null; verifiedAt: Date | null; dataEnc: string | null }): PanVerifyResult {
  const data = rec.dataEnc ? decryptJson<PanRecordData>(rec.dataEnc) : null;
  return {
    status: 'verified',
    verified: true,
    category: rec.category,
    aadhaarLinked: rec.aadhaarLinked,
    verifiedAt: rec.verifiedAt?.toISOString() ?? null,
    prefill: data?.prefill ?? {},
    message: undefined,
    source: 'cache',
  };
}

/**
 * Verify a PAN for `user` and return pre-fill details. DB first (verified
 * PANs only); Aurix is called for anything else — never seen, or a PAN that
 * previously failed (not found / errored), since neither leaves a cache.
 */
export async function verifyPan(user: User, rawPan: string): Promise<PanVerifyResult> {
  const pan = normalisePan(rawPan);
  if (!isValidPanFormat(pan)) throw new HttpError(400, 'Please enter a valid PAN (e.g. ABCPE1234F).');
  const hash = panHash(pan);

  const found = await prisma.panRecord.findUnique({ where: { panHash: hash } });
  const cached = found ? await remapFromRaw(found) : null;
  if (cached) {
    if (cached.ownerUserId && cached.ownerUserId !== user.id) {
      if (sharedPolicy() === 'block') throw new HttpError(409, 'This PAN is already registered with another account.');
      log.warn('pan reused across accounts (served from cache)', { panRecordId: cached.id, ownerUserId: cached.ownerUserId, userId: user.id });
    }
    await prisma.panRecord.update({ where: { id: cached.id }, data: { cacheHits: { increment: 1 } } }).catch(() => {});
    const result = fromRecord(cached);
    await attachPanToUser(user, pan);
    return result;
  }

  // Never seen as verified → paid call, deduplicated. A prior failed attempt
  // (not_found/error) left nothing cached, so this always re-checks fresh.
  const pending = inflight.get(hash);
  if (pending) return pending;
  const p = callAndStore(user, pan, hash).finally(() => inflight.delete(hash));
  inflight.set(hash, p);
  return p;
}

/**
 * PAN_DAILY_LIMIT, tracked on the user row (a failed attempt leaves no
 * PanRecord to count from) — two phases, deliberately not one atomic step:
 *   • ensureUnderDailyLimit: gate BEFORE calling Aurix.
 *   • bumpDailyLimitUsage: increment only AFTER Aurix actually answered
 *     (success, not-found, or a real error). A pure transport failure — a
 *     timeout, a 5xx, a token-generation failure — never reached Aurix in
 *     any billable sense, so it must NOT count; the caller can retry free.
 */
function windowExpired(startedAt: Date | null | undefined): boolean {
  return !startedAt || Date.now() - startedAt.getTime() >= DAILY_WINDOW_MS;
}

async function ensureUnderDailyLimit(user: User): Promise<void> {
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { panVerifyAttempts: true, panVerifyWindowStartAt: true } });
  const used = windowExpired(fresh?.panVerifyWindowStartAt) ? 0 : fresh!.panVerifyAttempts;
  if (used >= dailyLimit()) {
    log.warn('daily PAN lookup limit reached', { userId: user.id, used });
    throw new HttpError(429, 'Too many PAN checks today. Please try again tomorrow.');
  }
}

async function bumpDailyLimitUsage(user: User): Promise<void> {
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { panVerifyAttempts: true, panVerifyWindowStartAt: true } });
  const expired = windowExpired(fresh?.panVerifyWindowStartAt);
  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { panVerifyAttempts: (expired ? 0 : fresh!.panVerifyAttempts) + 1, panVerifyWindowStartAt: expired ? now : fresh!.panVerifyWindowStartAt },
  });
}

/** Track a failed attempt (not found, or a real error) on the user row — never a PanRecord. */
async function recordFailedAttempt(user: User, status: 'not_found' | 'error', message: string | undefined): Promise<void> {
  await prisma.user.update({
    where: { id: user.id },
    data: { panVerifyLastStatus: status, panVerifyLastMessage: message ?? null, panVerifyLastAttemptAt: new Date() },
  }).catch(e => {
    log.warn('could not record failed pan attempt on user', { userId: user.id, error: String(e?.message ?? e) });
  });
}

async function callAndStore(user: User, pan: string, hash: string): Promise<PanVerifyResult> {
  await ensureUnderDailyLimit(user);

  let res: Awaited<ReturnType<typeof callAurixPanComprehensive>>;
  try {
    res = await callAurixPanComprehensive(user, pan);
  } catch (e: any) {
    // Token generation / config failure — Aurix was never actually reached,
    // so this doesn't count as a paid call; not tracked anywhere, free retry.
    log.error('pan_comprehensive not attempted', { userId: user.id, error: String(e?.message ?? e) });
    throw new HttpError(502, 'We couldn’t verify your PAN right now. Please try again in a moment.');
  }
  if (!res.ok || !res.body) {
    // Transport/auth/5xx — Aurix never answered either; same as above.
    log.error('pan_comprehensive failed', { userId: user.id, httpStatus: res.status, error: res.error });
    throw new HttpError(502, 'We couldn’t verify your PAN right now. Please try again in a moment.');
  }

  // Aurix answered — counts against the daily cap from here on, whatever
  // the outcome (verified, not-found, or a real service error).
  await bumpDailyLimitUsage(user);

  const mapped = mapPanResponse(res.body);
  const verified = mapped.hasRealData && mapped.success && mapped.verified;

  if (!verified) {
    // Genuine "not found" or a real service error — Aurix answered (so it
    // counted against the daily cap above), but nothing about this PAN is
    // real, verified data: never a PanRecord, never encrypted. Tracked on
    // the user row instead so the next attempt is always a fresh paid call.
    await recordFailedAttempt(user, mapped.hasRealData ? 'not_found' : 'error', mapped.message);
    if (!mapped.hasRealData) {
      log.error('pan_comprehensive returned an error envelope; not cached', { userId: user.id, aurixMessage: mapped.message });
      throw new HttpError(502, 'We couldn’t verify your PAN right now. Please try again in a moment.');
    }
    log.info('pan not found via aurix', { userId: user.id, aurixMessage: mapped.message });
    return {
      status: 'invalid', verified: false, category: null, aadhaarLinked: null, verifiedAt: null,
      prefill: {}, message: mapped.message ?? 'We couldn’t verify this PAN. Please check the number and try again.',
      source: 'aurix',
    };
  }

  const now = new Date();
  const data: PanRecordData = { pan, prefill: mapped.prefill, raw: res.body };
  const rec = await prisma.panRecord.create({
    data: {
      panHash: hash, status: 'verified', verified: true, category: mapped.category, aadhaarLinked: mapped.aadhaarLinked,
      verifiedAt: now, dataEnc: encryptJson(data), keyVersion: PII_KEY_VERSION, ownerUserId: user.id, lastAurixCallAt: now,
    },
  });

  log.info('pan verified via aurix', { userId: user.id, panRecordId: rec.id, aurixMessage: mapped.message });
  await attachPanToUser(user, pan);
  return { ...fromRecord(rec), source: 'aurix' };
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
