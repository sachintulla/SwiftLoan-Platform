/**
 * Filters for the admin list pages (Loan Pipeline, Revasure, Yubi, Customers).
 *
 * One where-builder per list, used by the list endpoint, the CSV export and the
 * "start a campaign from this list" action. Because all three call the same
 * function with the same query, "the file follows the filters on screen" is true
 * by construction rather than by keeping three copies in step.
 *
 * Everything except `findUserIdsBySearch` is pure (no database), so it is unit
 * tested directly.
 */
import type { ApplicationStatus, JourneyStage, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { STAGE_ORDER, TERMINAL_STAGES } from './journey.js';
import { normalisePhone } from './dialer.js';

type Query = Record<string, unknown>;

/** Export cap. A full table dump would time out and hold too much in memory. */
export const EXPORT_LIMIT = 10_000;

/** Every ApplicationStatus the Loan Pipeline lets an operator filter by (same list as the dashboard funnel). */
export const APP_STATUSES = [
  'draft', 'pan_pending', 'prequalifying', 'offers_ready', 'handoff',
  'under_review', 'approved', 'rejected', 'disbursed', 'closed',
] as const;

export const LENDER_RESULTS = ['any', 'approved', 'disbursed', 'rejected', 'in_progress'] as const;
export type LenderResult = (typeof LENDER_RESULTS)[number];

/** Stages a customer can be filtered by: the funnel plus the two exits. */
export const CUSTOMER_STAGES: string[] = [...STAGE_ORDER, 'rejected', 'lost'];

/* ─────────────────────────── small parsers ─────────────────────────── */

/** A query value as a trimmed string, or undefined. Repeated params (arrays) take the first value. */
export function qStr(v: unknown, max = 200): string | undefined {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().slice(0, max);
  return s || undefined;
}

/** Free-text search term, or undefined when blank. */
export function searchTerm(q: Query): string | undefined {
  return qStr(q.search, 100);
}

/** ?from=&to= (ISO instants) as a Prisma date filter. An unparseable date is ignored, never an error. */
export function dateRange(q: Query): { gte?: Date; lte?: Date } | undefined {
  const r: { gte?: Date; lte?: Date } = {};
  const f = qStr(q.from);
  const t = qStr(q.to);
  const from = f ? new Date(f) : null;
  const to = t ? new Date(t) : null;
  if (from && !Number.isNaN(from.getTime())) r.gte = from;
  if (to && !Number.isNaN(to.getTime())) r.lte = to;
  return Object.keys(r).length ? r : undefined;
}

/* ─────────────────────────── Loan Pipeline ─────────────────────────── */

/** Offers that count as a lender application. */
const APPLIED = { applied: true } as const;
const REJECTED_STATES = ['rejected', 'failed'] as ApplicationStatus[];
const SETTLED_STATES = ['approved', 'disbursed', 'rejected', 'failed'] as ApplicationStatus[];

/**
 * Per-lender result, expressed over the applications' applied offers.
 * `rejected` includes `failed`, and `in_progress` is everything that has not
 * reached approved, disbursed or rejected, the same split the pipeline's
 * "3 lenders - 1 Rejected" summary uses.
 */
export function lenderResultWhere(result: string | undefined): Prisma.LoanApplicationWhereInput | undefined {
  switch (result) {
    case 'any':
      return { offers: { some: APPLIED } };
    case 'approved':
      return { offers: { some: { ...APPLIED, lenderStatus: 'approved' } } };
    case 'disbursed':
      return { offers: { some: { ...APPLIED, lenderStatus: 'disbursed' } } };
    case 'rejected':
      return { offers: { some: { ...APPLIED, lenderStatus: { in: REJECTED_STATES } } } };
    case 'in_progress':
      return {
        offers: {
          some: {
            ...APPLIED,
            // NOT IN skips NULL rows in SQL, and an applied offer with no status yet is still in progress.
            OR: [{ lenderStatus: null }, { lenderStatus: { notIn: SETTLED_STATES } }],
          },
        },
      };
    default:
      return undefined;
  }
}

/**
 * GET /api/admin/loans filters: status, search (reference, name, mobile),
 * lenderResult and a created-on date range. An unknown status, lender result or
 * date is ignored rather than rejected, as the page has always behaved.
 */
export function buildLoanWhere(q: Query): Prisma.LoanApplicationWhereInput {
  const where: Prisma.LoanApplicationWhereInput = {};
  const status = qStr(q.status);
  if (status && (APP_STATUSES as readonly string[]).includes(status)) where.status = status as ApplicationStatus;

  const search = searchTerm(q);
  if (search) {
    where.OR = [
      { ref: { contains: search, mode: 'insensitive' } },
      { user: { fullName: { contains: search, mode: 'insensitive' } } },
      { user: { phone: { contains: search } } },
    ];
  }

  const lender = lenderResultWhere(qStr(q.lenderResult));
  if (lender) where.AND = [lender];

  const range = dateRange(q);
  if (range) where.createdAt = range;
  return where;
}

export interface LenderOffer { lenderStatus?: string | null }

/** Compact per-lender summary for a pipeline row, e.g. "3 lenders . 1 Active, 1 Rejected". Matches the page wording. */
export function loanLenderSummary(offers: LenderOffer[] | null | undefined): string {
  const applied = offers ?? [];
  if (applied.length === 0) return '-';
  const approved = applied.filter((o) => o.lenderStatus === 'approved').length;
  const disbursed = applied.filter((o) => o.lenderStatus === 'disbursed').length;
  const rejected = applied.filter((o) => o.lenderStatus === 'rejected' || o.lenderStatus === 'failed').length;
  const parts: string[] = [];
  if (disbursed) parts.push(`${disbursed} Active`);
  if (approved) parts.push(`${approved} Approved`);
  if (rejected) parts.push(`${rejected} Rejected`);
  const pending = applied.length - approved - disbursed - rejected;
  if (pending) parts.push(`${pending} in progress`);
  return `${applied.length} lender${applied.length === 1 ? '' : 's'}${parts.length ? ' - ' + parts.join(', ') : ''}`;
}

/* ─────────────────────────── Revasure / Yubi ─────────────────────────── */

/** Users whose name or mobile contains the search term, capped so a short fragment like "98" cannot return the whole table. */
const USER_LOOKUP_CAP = 2000;

/**
 * Revasure and Yubi rows hold only a userId (no relation), so a search by customer
 * name or mobile has to be resolved to user ids first. Returns undefined when
 * there is no search, so callers can tell "no search" from "search matched nobody".
 */
export async function findUserIdsBySearch(search: string | undefined): Promise<string[] | undefined> {
  if (!search) return undefined;
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { fullName: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ],
    },
    select: { id: true },
    take: USER_LOOKUP_CAP,
  });
  return users.map((u) => u.id);
}

/** Who a Revasure or Yubi row belongs to. `id` is the Customer id (for the /customers link), null when the user has no customer row yet. */
export interface PersonRef { id: string | null; name: string | null; phone: string | null }

/**
 * Name, mobile and customer id for a set of user ids, in a fixed number of
 * queries per 1,000 users. Revasure and Yubi rows hold a plain userId with no relation.
 */
export async function personsByUserId(userIds: (string | null | undefined)[]): Promise<Map<string, PersonRef>> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  const out = new Map<string, PersonRef>();
  for (let i = 0; i < ids.length; i += 1000) {
    const slice = ids.slice(i, i + 1000);
    const [users, customers] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: slice } }, select: { id: true, fullName: true, firstName: true, phone: true } }),
      prisma.customer.findMany({ where: { userId: { in: slice } }, select: { id: true, userId: true, name: true, phone: true } }),
    ]);
    const customerByUser = new Map(customers.map((c) => [c.userId as string, c]));
    for (const u of users) {
      const c = customerByUser.get(u.id);
      out.set(u.id, {
        id: c?.id ?? null,
        name: u.fullName || u.firstName || c?.name || null,
        phone: u.phone || c?.phone || null,
      });
    }
  }
  return out;
}

/**
 * GET /api/admin/revasure filters: status, search, and an updated-on date range.
 * `matchedUserIds` is the result of `findUserIdsBySearch(searchTerm(q))`: the
 * source lead id or Revasure lead id may match the term directly, or the lead may
 * belong to a customer whose name or mobile does.
 */
export function buildRevasureWhere(q: Query, matchedUserIds?: string[]): Prisma.RevasureLeadWhereInput {
  const where: Prisma.RevasureLeadWhereInput = {};
  const status = qStr(q.status);
  if (status) where.status = status;

  const search = searchTerm(q);
  if (search) {
    const or: Prisma.RevasureLeadWhereInput[] = [
      { sourceLeadId: { contains: search, mode: 'insensitive' } },
      { leadId: { contains: search, mode: 'insensitive' } },
    ];
    if (matchedUserIds?.length) or.push({ userId: { in: matchedUserIds } });
    where.OR = or;
  }

  const range = dateRange(q);
  if (range) where.updatedAt = range;
  return where;
}

/**
 * GET /api/admin/yubi filters: applied (default on: only referrals the customer
 * proceeded with), status, search (customer name or mobile), and an applied-on
 * date range.
 */
export function buildYubiWhere(q: Query, matchedUserIds?: string[]): Prisma.PartnerReferralWhereInput {
  const where: Prisma.PartnerReferralWhereInput = {};
  const applied = qStr(q.applied);
  const appliedOnly = applied !== '0' && applied !== 'false';
  const range = dateRange(q);

  if (appliedOnly || range) where.appliedAt = { ...(appliedOnly ? { not: null } : {}), ...(range ?? {}) };

  const status = qStr(q.status);
  if (status) where.lastStatus = status;

  const search = searchTerm(q);
  if (search) where.userId = { in: matchedUserIds ?? [] };
  return where;
}

/* ─────────────────────────── Customers export ─────────────────────────── */

/**
 * The customers list's filters, for the CSV export: stage (funnel plus rejected
 * and lost; anything else ignored), source, campaign, search (name, mobile,
 * email), joined-on date range, and "inactive for N minutes".
 */
export function buildCustomerExportWhere(q: Query): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};
  const stage = qStr(q.stage);
  if (stage && CUSTOMER_STAGES.includes(stage)) where.currentStage = stage as JourneyStage;
  const source = qStr(q.source);
  if (source) where.firstSource = source;
  const campaignId = qStr(q.campaignId);
  if (campaignId) where.campaignId = campaignId;

  const range = dateRange(q);
  if (range) where.createdAt = range;

  const search = searchTerm(q);
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const stalled = parseInt(qStr(q.stalledMinutes) ?? '', 10);
  if (Number.isFinite(stalled) && stalled > 0) {
    // Same rule as the list: no website or app activity in the last N minutes, finished journeys excluded.
    const cutoff = new Date(Date.now() - stalled * 60_000);
    where.events = { none: { channel: { in: ['website', 'app'] }, occurredAt: { gte: cutoff } } };
    where.AND = [{ currentStage: { notIn: TERMINAL_STAGES } }];
  }
  return where;
}

/* ─────────────────────────── redaction ─────────────────────────── */

/** Keys that can carry identity documents or secrets. Matched anywhere in the key name, any case. */
export const SENSITIVE_KEY = /pan|aadhaar|aadhar|otp|password|token/i;

/**
 * Copy of a stored request or response body with every sensitive key dropped, at
 * any depth. The Revasure library masks PAN and OTP before it stores a body; this
 * is a second guard for the support view. The pattern is deliberately broad, so a
 * key such as "company" (it contains "pan") is dropped too.
 */
export function redactRevasurePayload(json: unknown, depth = 0): unknown {
  if (depth > 25) return null;
  if (Array.isArray(json)) return json.map((v) => redactRevasurePayload(v, depth + 1));
  if (json && typeof json === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = redactRevasurePayload(v, depth + 1);
    }
    return out;
  }
  return json;
}

/* ─────────────────────────── CSV shapes ─────────────────────────── */

/**
 * Export columns. Never PAN, Aadhaar, OTP, a token, or a stored request or
 * response body. A test asserts these lists against FORBIDDEN_EXPORT_COLUMN.
 */
export const LOAN_CSV_HEADERS = ['ref', 'name', 'phone', 'loanType', 'amountRupees', 'status', 'lenderSummary', 'appliedAt'];
export const REVASURE_CSV_HEADERS = ['sourceLeadId', 'revasureLeadId', 'customerName', 'phone', 'status', 'httpStatus', 'message', 'updatedAt'];
export const YUBI_CSV_HEADERS = ['customerName', 'phone', 'appliedLender', 'status', 'appliedAt'];

export const FORBIDDEN_EXPORT_COLUMN = /pan|aadhaar|aadhar|otp|password|token|requestBody|responseBody|secret/i;

export function loanCsvRow(a: {
  ref: string; loanType: string; amount: number; status: string; createdAt: Date;
  user?: { fullName?: string | null; phone?: string | null } | null;
  offers?: LenderOffer[] | null;
}): unknown[] {
  return [a.ref, a.user?.fullName, a.user?.phone, a.loanType, a.amount, a.status, loanLenderSummary(a.offers), a.createdAt];
}

export function revasureCsvRow(r: {
  sourceLeadId: string; leadId: string | null; status: string; httpStatus: number | null;
  message: string | null; lastError: string | null; updatedAt: Date;
}, who: { name?: string | null; phone?: string | null } | null): unknown[] {
  const message = (r.message || r.lastError || '').slice(0, 300);
  return [r.sourceLeadId, r.leadId, who?.name, who?.phone, r.status, r.httpStatus, message, r.updatedAt];
}

export function yubiCsvRow(r: {
  appliedLender: string | null; lastStatus: string | null; status: string; appliedAt: Date | null;
}, who: { name?: string | null; phone?: string | null } | null): unknown[] {
  return [who?.name, who?.phone, r.appliedLender, r.lastStatus || r.status, r.appliedAt];
}

/* ─────────────────────────── list names ─────────────────────────── */

export type ListKind = 'loans' | 'revasure' | 'yubi';
export const LIST_KINDS: ListKind[] = ['loans', 'revasure', 'yubi'];

export const LIST_LABELS: Record<ListKind, string> = {
  loans: 'Loan Pipeline',
  revasure: 'Revasure Leads',
  yubi: 'Yubi Referrals',
};

/** Filter keys each list understands. Anything else a client sends is dropped before it reaches a builder or an audit row. */
export const LIST_FILTER_KEYS: Record<ListKind, string[]> = {
  loans: ['status', 'search', 'lenderResult', 'from', 'to'],
  revasure: ['status', 'search', 'from', 'to'],
  yubi: ['applied', 'status', 'search', 'from', 'to'],
};

export function pickFilters(kind: ListKind, raw: Query): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of LIST_FILTER_KEYS[kind]) {
    const v = qStr(raw[key], key === 'search' ? 100 : 64);
    if (v) out[key] = v;
  }
  return out;
}

/* ─────────────────────────── campaign contacts ─────────────────────────── */

/** Most contacts one "start a campaign from this list" action will create. */
export const CAMPAIGN_FROM_LIST_CAP = 5_000;

/** A list row, reduced to what becomes a campaign contact. `phone` is as stored; it is normalised by planContacts. */
export interface ContactCandidate {
  name: string | null;
  phone: unknown;
  product: string | null;
  /** In paise, the unit CampaignContact.amount uses. */
  amountPaise: number | null;
  /** The row's status in the list it came from. */
  status: string;
}

export interface PlannedContact extends Omit<ContactCandidate, 'phone'> { phone: string }

/**
 * Turn list rows into unique, dialable contacts. The first row for a number wins,
 * so a customer with several applications is added once, with their newest.
 * Rows with no usable 10-digit mobile are counted, not added.
 */
export function planContacts(candidates: ContactCandidate[]): {
  contacts: PlannedContact[]; withPhone: number; noPhone: number; duplicates: number;
} {
  const seen = new Set<string>();
  const contacts: PlannedContact[] = [];
  let noPhone = 0;
  let duplicates = 0;
  for (const c of candidates) {
    const phone = normalisePhone(c.phone);
    if (!phone) { noPhone++; continue; }
    if (seen.has(phone)) { duplicates++; continue; }
    seen.add(phone);
    contacts.push({ ...c, phone });
  }
  return { contacts, withPhone: candidates.length - noPhone, noPhone, duplicates };
}

/** Rupees to paise, or null when it would not fit the Int column or is not a positive amount. */
export function rupeesToPaise(rupees: number | null | undefined): number | null {
  if (rupees == null || !Number.isFinite(rupees) || rupees <= 0) return null;
  const paise = Math.round(rupees * 100);
  return paise > 2_147_483_647 ? null : paise;
}

/** Plain-words version of a filter set, stored on the draft campaign's note so its origin is clear later. */
export function describeFilterSet(filters: Record<string, string>): string {
  const parts = Object.entries(filters).map(([k, v]) => (k === 'search' ? `search "${v}"` : `${k} ${v}`));
  return parts.length ? parts.join(', ') : 'no filters';
}
