/**
 * Details fetched from the mobile number at login (Digitap "Mobile to Prefill", lib/digitap.ts).
 *
 * Flow:
 *   1. OTP REQUESTED (app or website) → `startMobilePrefill(user)` runs in the background: one lookup per
 *      number, saved in `MobilePrefill` (details encrypted). Nothing else happens yet: the number is not
 *      proven, so the account's profile is NOT filled and no client or agent is told anything.
 *      OTP ACCEPTED → `finishMobilePrefillAtLogin(user)`: the saved details are copied into the EMPTY columns
 *      of `User` (so the form pre-fill and the voice agent's basic details are ready at once). If no lookup
 *      was made at the request (switched on since, or it failed), one is started now.
 *   2. The user starts an application → `usePrefillForApplication(userId)`: when a PAN came back, step 1
 *      (PAN) is skipped — no Aurix PAN call — and step 2 opens with the details filled in.
 *   3. Nothing found / an error / switched off → the application starts at step 1, exactly as before.
 *
 * Rules:
 *   • The PAN is stored encrypted (`User.panEnc`) and only ever returned masked.
 *   • `User.panOnFile` is NOT set at login: that flag means "step 1 is done" to the drop-off messages, the
 *     website reminders and the app resume. It is set when the user actually starts the application (step 2).
 *   • Only empty `User` columns are filled; what the user typed or a PAN check returned is never overwritten.
 *   • The score lives in `User.creditScore`, which is omitted from every query by default (lib/prisma.ts).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { timing } from './timings.js';
import { scoped } from './log.js';
import { encryptJson, decryptJson, encryptPan, PII_KEY_VERSION } from './pii.js';
import { panFromHolder, loadPan, userPanData } from './storedPan.js';
import { callDigitapMobilePrefill, digitapConfig, type DigitapDetails } from './digitap.js';
import type { PanPrefill } from './panVerification.js';

const log = scoped('mobile-prefill');

/** A "nothing found" answer is asked again only after this long (a fresh bureau report may exist by then). */
const NOT_FOUND_RETRY_MS = 7 * 24 * 60 * 60_000;
/** A failed attempt is not repeated on every login. */
const ERROR_RETRY_MS = 10 * 60_000;
/** How long "start application" waits for a lookup that is still running (login was a moment ago). */
const INFLIGHT_WAIT_MS = 8_000;
// Same bounds the profile API enforces for a typed monthly income (modules/users.routes.ts).
const INCOME_MIN = 5_000;
const INCOME_MAX = 999_999_999;

interface StoredData {
  details: DigitapDetails;
  raw: unknown;
}

export const mobilePrefillEnabled = () => timing.bool('prefill.digitapEnabled') && !!digitapConfig();

/** XXXXXX234A — the only form of the PAN a client ever sees. */
export const maskPanForDisplay = (pan: string) => `XXXXXX${pan.slice(6)}`;

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

export interface ExistingUserFields {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  dob: Date | null;
  gender: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  alternateMobile: string | null;
  employment: string | null;
  monthlyIncome: number | null;
  hasPan: boolean;
}

/**
 * What to write on the User row: only columns that are empty today. `emailFree` = no other account uses the
 * email (User.email is unique). The score is the one field that always follows the latest answer.
 */
export function userPatchFromDetails(d: DigitapDetails, u: ExistingUserFields, emailFree: boolean): Prisma.UserUpdateInput {
  const patch: Prisma.UserUpdateInput = {};
  const hasName = !!(u.firstName || u.lastName || u.fullName);
  if (!hasName && d.firstName) {
    patch.firstName = d.firstName;
    if (d.lastName) patch.lastName = d.lastName;
    if (d.fullName) patch.fullName = d.fullName;
  }
  if (!u.dob && d.dob) patch.dob = new Date(`${d.dob}T00:00:00.000Z`);
  if (!u.gender && d.gender) patch.gender = d.gender;
  if (!u.email && d.email && emailFree) patch.email = d.email;
  // The address goes in as one block: never mix our street with their city.
  const hasAddress = !!(u.addressLine1 || u.addressLine2 || u.city || u.state || u.pincode);
  if (!hasAddress) {
    if (d.addressLine1) patch.addressLine1 = d.addressLine1;
    if (d.addressLine2) patch.addressLine2 = d.addressLine2;
    if (d.city) patch.city = d.city;
    if (d.state) patch.state = d.state;
    if (d.pincode) patch.pincode = d.pincode;
  }
  if (!u.alternateMobile && d.alternateMobile) patch.alternateMobile = d.alternateMobile;
  if (!u.employment && d.employment) patch.employment = d.employment;
  if (u.monthlyIncome == null && d.incomeMax != null && d.incomeMax >= INCOME_MIN && d.incomeMax <= INCOME_MAX) patch.monthlyIncome = d.incomeMax;
  if (!u.hasPan && d.pan) patch.panEnc = encryptPan(d.pan); // panOnFile stays false until the application starts
  if (d.creditScore != null) patch.creditScore = d.creditScore;
  return patch;
}

/** The step-2 pre-fill, in the same shape the PAN check returns (so both clients reuse their existing code). */
export function prefillFromDetails(d: DigitapDetails): PanPrefill {
  const p: PanPrefill = {
    fullName: d.fullName,
    firstName: d.firstName,
    middleName: d.middleName,
    lastName: d.lastName,
    dob: d.dob,
    gender: d.gender,
    email: d.email,
    addressLine1: d.addressLine1,
    addressLine2: d.addressLine2,
    city: d.city,
    state: d.state,
    pincode: d.pincode,
  };
  for (const k of Object.keys(p) as (keyof PanPrefill)[]) if (p[k] === undefined) delete p[k];
  return p;
}

/** Should a login trigger a (new) lookup, given the row we already hold? */
export function shouldFetch(row: { status: string; fetchedAt: Date } | null, now = Date.now()): boolean {
  if (!row) return true;
  if (row.status === 'found') return false; // paid for once; never again
  const age = now - row.fetchedAt.getTime();
  return row.status === 'not_found' ? age >= NOT_FOUND_RETRY_MS : age >= ERROR_RETRY_MS;
}

// ── Login: fetch + save ──────────────────────────────────────────────────────

const inflight = new Map<string, Promise<void>>();

/**
 * Starts the lookup for this number. Returns at once; it runs in the background and can never slow down or
 * fail the request. Safe to call every time: a number already looked up is not looked up again.
 *
 * Called when an OTP is REQUESTED with `fillProfile` off (the default): the answer is only saved in
 * `MobilePrefill`. The profile is filled when the OTP is accepted (`finishMobilePrefillAtLogin`).
 */
export function startMobilePrefill(user: { id: string; phone: string }, opts: { fillProfile?: boolean } = {}): void {
  try {
    if (!mobilePrefillEnabled() || inflight.has(user.id)) return;
    const run = fetchAndSave(user.id, user.phone, opts.fillProfile === true)
      .catch((e) => log.error('mobile prefill failed', { userId: user.id, error: String(e?.message ?? e) }))
      .finally(() => inflight.delete(user.id));
    inflight.set(user.id, run);
  } catch (e: any) {
    log.error('mobile prefill not started', { userId: user.id, error: String(e?.message ?? e) });
  }
}

/** Resolves when the lookup started for this user (if any) has finished. For jobs and tests; a login never waits on it. */
export const mobilePrefillSettled = (userId: string): Promise<void> => inflight.get(userId) ?? Promise.resolve();

async function fetchAndSave(userId: string, phone: string, fillProfile: boolean): Promise<void> {
  const cfg = digitapConfig();
  if (!cfg) return;
  const existing = await prisma.mobilePrefill.findUnique({ where: { userId }, select: { status: true, fetchedAt: true } });
  if (!shouldFetch(existing)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, fullName: true },
  });
  if (!user) return;

  const { outcome, raw, nameSource } = await callDigitapMobilePrefill(cfg, {
    phone, firstName: user.firstName, lastName: user.lastName, fullName: user.fullName,
  });

  const now = new Date();
  const base = { provider: 'digitap', requestId: outcome.requestId, nameSource, fetchedAt: now, keyVersion: PII_KEY_VERSION };
  if (outcome.status !== 'found') {
    const reason = (outcome.status === 'not_found' ? outcome.reason : outcome.message).slice(0, 200);
    await prisma.mobilePrefill.upsert({
      where: { userId },
      create: { userId, ...base, status: outcome.status, reason, attempts: 1 },
      update: { ...base, status: outcome.status, reason, attempts: { increment: 1 } },
    });
    return;
  }

  const d = outcome.details;
  const data: StoredData = { details: d, raw };
  await prisma.mobilePrefill.upsert({
    where: { userId },
    create: { userId, ...base, status: 'found', reason: null, dataEnc: encryptJson(data), hasPan: !!d.pan, attempts: 1 },
    update: { ...base, status: 'found', reason: null, dataEnc: encryptJson(data), hasPan: !!d.pan, attempts: { increment: 1 } },
  });

  log.info('mobile prefill saved', { userId, hasPan: !!d.pan, fillProfile });
  if (fillProfile) await applyPrefillToUser(userId, d);
}

const USER_FILL_SELECT = {
  id: true, firstName: true, lastName: true, fullName: true, dob: true, gender: true, email: true,
  addressLine1: true, addressLine2: true, city: true, state: true, pincode: true,
  alternateMobile: true, employment: true, monthlyIncome: true, panEnc: true, panNumber: true,
} as const;

/**
 * Copy the fetched details into the EMPTY columns of the User row. Idempotent (a filled column is never
 * touched again), so it is safe to run on every login. Only ever called for a number proven by OTP.
 */
async function applyPrefillToUser(userId: string, known?: DigitapDetails): Promise<string[]> {
  const d = known ?? (await readDetails(userId));
  if (!d) return [];
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_FILL_SELECT });
  if (!user) return [];
  const emailFree = d.email ? !(await prisma.user.findFirst({ where: { email: d.email, NOT: { id: userId } }, select: { id: true } })) : false;
  const patch = userPatchFromDetails(d, { ...user, hasPan: !!panFromHolder(user) }, emailFree);
  if (!Object.keys(patch).length) return [];
  await prisma.user.update({ where: { id: userId }, data: patch }).catch(async (e) => {
    // A unique-email race is the one realistic conflict: write the rest without it.
    log.warn('user fill from mobile prefill failed; retrying without email', { userId, error: String(e?.message ?? e) });
    const { email: _email, ...rest } = patch;
    if (Object.keys(rest).length) await prisma.user.update({ where: { id: userId }, data: rest });
  });
  const filled = Object.keys(patch).filter((k) => k !== 'panEnc' && k !== 'creditScore');
  if (filled.length) log.info('profile filled from mobile prefill', { userId, filled });
  return filled;
}

/** How long a login waits for a lookup that is still running (it was started when the OTP was requested). */
const LOGIN_WAIT_MS = 2_000;

/**
 * Called when an OTP is ACCEPTED (the number is now proven). Fills the profile from the details fetched at
 * the OTP request, so they are there before the app loads the account's context. Waits at most
 * `LOGIN_WAIT_MS` for a lookup still in flight; never throws, never fails the login.
 */
export async function finishMobilePrefillAtLogin(user: { id: string; phone: string }): Promise<void> {
  try {
    if (!mobilePrefillEnabled()) return;
    const running = inflight.get(user.id);
    if (running) await Promise.race([running, new Promise((r) => setTimeout(r, LOGIN_WAIT_MS))]);
    const row = await prisma.mobilePrefill.findUnique({ where: { userId: user.id }, select: { status: true, fetchedAt: true } });
    if (row?.status === 'found') {
      await applyPrefillToUser(user.id);
      return;
    }
    // Nothing usable yet: a lookup still running will fill the profile when it lands; otherwise start one
    // now if this number is due one (never looked up, or the last attempt can be retried).
    if (inflight.has(user.id)) {
      void inflight.get(user.id)!.then(() => applyPrefillToUser(user.id)).catch(() => {});
    } else if (shouldFetch(row)) {
      startMobilePrefill(user, { fillProfile: true });
    }
  } catch (e: any) {
    log.error('mobile prefill not finished at login', { userId: user.id, error: String(e?.message ?? e) });
  }
}

// ── Starting an application ──────────────────────────────────────────────────

export type PrefillForApplication =
  | { found: false }
  | { found: true; maskedPan: string; prefill: PanPrefill };

/** The stored details for a number we have an answer for, or null. */
async function readDetails(userId: string): Promise<DigitapDetails | null> {
  const row = await prisma.mobilePrefill.findUnique({ where: { userId }, select: { status: true, dataEnc: true } });
  if (!row || row.status !== 'found' || !row.dataEnc) return null;
  try {
    return decryptJson<StoredData>(row.dataEnc).details ?? null;
  } catch (e: any) {
    log.error('could not decrypt mobile prefill (wrong or rotated key?)', { userId, error: String(e?.message ?? e) });
    return null;
  }
}

/**
 * The details to start an application with, or `{found:false}` (→ the normal PAN step).
 *
 * `attach: true` (the user is actually starting the application): the fetched PAN becomes the user's PAN on
 * file, so the application can pick it up server-side (`usePanOnFile`) — the PAN itself never leaves the server.
 * A user who already has a DIFFERENT PAN on file is never switched silently: they get the normal PAN step.
 */
export async function usePrefillForApplication(userId: string, opts: { attach: boolean }): Promise<PrefillForApplication> {
  if (!mobilePrefillEnabled()) return { found: false };
  const running = inflight.get(userId);
  if (running) await Promise.race([running, new Promise((r) => setTimeout(r, INFLIGHT_WAIT_MS))]);

  const d = await readDetails(userId);
  if (!d?.pan) return { found: false };

  const onFile = await loadPan(userId);
  if (onFile && onFile !== d.pan) return { found: false };

  if (opts.attach) {
    const flags = await prisma.user.findUnique({ where: { id: userId }, select: { panOnFile: true } });
    if (!onFile || !flags?.panOnFile) await prisma.user.update({ where: { id: userId }, data: userPanData(d.pan) });
    await prisma.mobilePrefill.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    log.info('application started from mobile prefill (PAN step skipped)', { userId });
  }
  return { found: true, maskedPan: maskPanForDisplay(d.pan), prefill: prefillFromDetails(d) };
}
