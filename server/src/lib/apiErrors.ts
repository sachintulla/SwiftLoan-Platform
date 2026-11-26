/**
 * Pure query rules for the admin "API & Webhook Errors" page.
 *
 * The page reads the existing ApiLog table (lib/apiLog.ts) — every inbound
 * request/response (webhook payloads included) and every outbound call to
 * Aurix / Yubi / Revasure — and shows only the ones that FAILED: an HTTP error
 * status (>= 400) or a recorded `error`. Kept pure so the filter logic is
 * covered by apiErrors.test.ts without a database.
 */
import type { Prisma } from '@prisma/client';

export type StatusClass = '4xx' | '5xx' | 'errored';
export const STATUS_CLASSES: StatusClass[] = ['4xx', '5xx', 'errored'];

export interface ApiErrorFilters {
  direction?: 'inbound' | 'outbound' | null;
  target?: string | null;
  statusClass?: StatusClass | null;
  /** Substring match on the URL. */
  q?: string | null;
  from?: Date | null;
  to?: Date | null;
  /** Also list routine refusals by our own API (see IS_NOISE). Off by default. */
  includeNoise?: boolean;
}

/** The base "this row is an error" condition: a 4xx/5xx status, or a captured error string. */
export const IS_ERROR: Prisma.ApiLogWhereInput = {
  OR: [{ status: { gte: 400 } }, { error: { not: null } }],
};

/**
 * Routine refusals by OUR OWN API: an expired or missing login (401) and the rate limit (429). They are most of the
 * rows (1,038 of 1,301 on 2026-11-23) and hide the failures someone must act on, so the page leaves them out unless
 * asked. Inbound only: a 401 or 429 that a LENDER sends us on an outbound call is a real failure and always shows.
 */
export const NOISE_STATUSES = [401, 429];
export const IS_NOISE: Prisma.ApiLogWhereInput = { direction: 'inbound', status: { in: NOISE_STATUSES } };
/** Written as an OR so rows with no status (the call never got one) are kept: `NOT status IN (...)` would drop them. */
export const NOT_NOISE: Prisma.ApiLogWhereInput = {
  OR: [{ direction: { not: 'inbound' } }, { status: null }, { status: { notIn: NOISE_STATUSES } }],
};

/** True for one row that is a routine refusal (same rule as IS_NOISE). */
export function isNoiseRow(row: { direction?: string | null; status: number | null }): boolean {
  return row.direction === 'inbound' && row.status != null && NOISE_STATUSES.includes(row.status);
}

/** The base condition for the page: every error, or every error that is not a routine refusal. */
export function baseErrorWhere(includeNoise: boolean): Prisma.ApiLogWhereInput {
  return includeNoise ? IS_ERROR : { AND: [IS_ERROR, NOT_NOISE] };
}

/** The extra condition a chosen status class adds (narrows IS_ERROR). */
export function statusClassWhere(sc: StatusClass): Prisma.ApiLogWhereInput {
  switch (sc) {
    case '4xx': return { status: { gte: 400, lt: 500 } };
    case '5xx': return { status: { gte: 500 } };
    // A row with no HTTP status (the call never got one) but a recorded error —
    // e.g. a network failure reaching the lender.
    case 'errored': return { status: null, error: { not: null } };
  }
}

/** Build the Prisma `where` for the error list from the admin's filters. */
export function buildApiErrorWhere(f: ApiErrorFilters): Prisma.ApiLogWhereInput {
  const and: Prisma.ApiLogWhereInput[] = [IS_ERROR];
  if (!f.includeNoise) and.push(NOT_NOISE);
  if (f.statusClass) and.push(statusClassWhere(f.statusClass));
  if (f.direction) and.push({ direction: f.direction });
  if (f.target) and.push({ target: f.target });
  if (f.q) and.push({ url: { contains: f.q, mode: 'insensitive' } });
  if (f.from || f.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = f.from;
    if (f.to) createdAt.lte = f.to;
    and.push({ createdAt });
  }
  return and.length === 1 ? and[0] : { AND: and };
}

/** The class a single row falls into, for the per-row badge. */
export function classifyRow(row: { status: number | null; error: string | null }): StatusClass | 'ok' {
  if (row.status != null && row.status >= 500) return '5xx';
  if (row.status != null && row.status >= 400) return '4xx';
  if (row.error) return 'errored';
  return 'ok';
}
