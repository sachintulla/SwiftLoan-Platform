import { createHash } from 'node:crypto';

/**
 * Decides when prequalify must call the lender (Aurix) again.
 *
 * Rule: fetch offers again ONLY when the applicant changes the details the lender
 * sees (or the stored offers have gone stale). The same details → the same
 * offers, so we reuse what we already have instead of paying for another call.
 * "Details" = exactly the profile + application fields the eligible_offers
 * request is built from (see buildEligibleOffersPayload in lenderOffers.ts).
 */

/** Fields of the user that feed the lender request. */
const USER_FIELDS = [
  'firstName', 'lastName', 'fullName', 'phone', 'alternateMobile', 'email', 'alternateEmail',
  'dob', 'gender', 'maritalStatus', 'qualification', 'employment', 'company', 'companyEmail',
  'businessEmail', 'professionalType', 'monthlyIncome', 'salaryMode', 'monthlyObligations',
  'loanPurpose', 'addressLine1', 'addressLine2', 'landmark', 'district', 'city', 'state', 'pincode',
  'panNumber',
] as const;

/** Fields of the application that feed it. */
const APP_FIELDS = ['loanType', 'amount', 'tenureMonths', 'purpose', 'employment', 'monthlyIncome', 'residenceType', 'panNumber'] as const;

type Bag = Record<string, unknown> | null | undefined;

function norm(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v.trim();
  return v;
}

/** Stable fingerprint of what the lender would be asked. Same details → same string. */
export function offersInputSignature(user: Bag, app: Bag): string {
  const pick = (src: Bag, keys: readonly string[]) => keys.map((k) => [k, norm(src?.[k])] as const);
  const canonical = JSON.stringify({ u: pick(user, USER_FIELDS), a: pick(app, APP_FIELDS) });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * How long stored offers stay reusable. Default 24 h — the offers screen tells the
 * applicant "offers are valid for 24 hours". OFFERS_REUSE_HOURS=<n> changes it;
 * 0 means they never expire (reuse for as long as the details are unchanged).
 */
export function reuseWindowMs(raw: string | undefined = process.env.OFFERS_REUSE_HOURS): number | null {
  if (raw === undefined || raw.trim() === '') return 24 * 3_600_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 24 * 3_600_000;
  return n === 0 ? null : n * 3_600_000; // null = never expires
}

export interface ReuseCandidate {
  id: string;
  offersSignature: string | null;
  offersFetchedAt: Date | null;
}

/**
 * Pick the application whose stored offers can be reused for `currentId`.
 * Prefers the application itself, otherwise the user's most recent other
 * application fetched with identical details. Returns null → call the lender.
 */
export function pickReusable(
  candidates: ReuseCandidate[],
  currentId: string,
  signature: string,
  now: number,
  windowMs: number | null,
): ReuseCandidate | null {
  const fresh = candidates.filter(
    (c) =>
      c.offersSignature === signature &&
      !!c.offersFetchedAt &&
      (windowMs === null || now - c.offersFetchedAt.getTime() <= windowMs),
  );
  if (fresh.length === 0) return null;
  const self = fresh.find((c) => c.id === currentId);
  if (self) return self;
  return [...fresh].sort((a, b) => b.offersFetchedAt!.getTime() - a.offersFetchedAt!.getTime())[0];
}
