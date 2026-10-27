/**
 * Filters for the admin Calls page: one place that turns the query string into
 * a Prisma `where`, so the on-screen list, the stat strip and the CSV export all
 * follow exactly the same rules. Pure (no database) except `followUpIds`.
 *
 * Query parameters understood (all optional, anything invalid is ignored rather
 * than rejected, so a stale bookmark never 500s):
 *   status      one status, or several separated by commas (queued, dialing,
 *               in_progress, completed, failed, no_answer, busy, cancelled)
 *   outcome     one call outcome
 *   purpose     why the call was placed: a callContext.reason value, or
 *               `campaign` for any call that belongs to a campaign
 *   campaignId  one campaign
 *   search      digits search the phone number, anything else searches the
 *               customer's name
 *   from, to    ISO instants, applied to when the call was queued
 *   answered    1 or 0
 *   followUp    1 = only calls that still need a follow-up (see followUpIds)
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export const CALL_STATUSES = ['queued', 'dialing', 'in_progress', 'completed', 'failed', 'no_answer', 'busy', 'cancelled'] as const;
export const CALL_OUTCOMES = [
  'interested', 'not_interested', 'callback_requested', 'wrong_number',
  'voicemail', 'unreachable', 'do_not_call', 'installed_app', 'other',
] as const;

export type CallStatusValue = (typeof CALL_STATUSES)[number];
export type CallOutcomeValue = (typeof CALL_OUTCOMES)[number];

/** The channels that are real phone calls. The same table also holds website, app and admin conversations. */
export const PHONE_CHANNELS = ['phone_outbound', 'phone_inbound'];

/**
 * Every `callContext.reason` value the server writes today. A call without a
 * reason and with a campaignId is a campaign call (the campaign runner sends no
 * reason), so `campaign` is a filter value of its own.
 */
export const CALL_PURPOSES = [
  'app_dropoff_followup',
  'daily_status_update',
  'website_lead_followup',
  'immediate_callback_optin',
  'manual_dashboard_call',
  'upshot_journey',
] as const;

/** How far back "needs a follow-up" looks. */
export const FOLLOW_UP_DAYS = 14;

/** Fields the list needs. Deliberately no rawPayload, transcript, callContext or recordingUrl: they are large and the list never shows them. */
export const CALL_LIST_SELECT = {
  id: true,
  phone: true,
  status: true,
  outcome: true,
  outcomeSource: true,
  answered: true,
  durationSec: true,
  summary: true,
  callbackAt: true,
  queuedAt: true,
  startedAt: true,
  endedAt: true,
  campaignId: true,
  customer: { select: { id: true, name: true, phone: true } },
} as const satisfies Prisma.CallAttemptSelect;

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function validDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface BuildCallWhereOptions {
  /** Result of `followUpIds()`. Needed only when `followUp=1`; kept out of here so this function stays pure. */
  followUpIds?: string[];
}

export function buildCallWhere(q: Record<string, unknown>, opts: BuildCallWhereOptions = {}): Prisma.CallAttemptWhereInput {
  const and: Prisma.CallAttemptWhereInput[] = [];

  // This table now also holds non-call conversations (website widget, in-app,
  // admin) since the CallAttempt/Conversation merge; the calls page is calls only.
  const where: Prisma.CallAttemptWhereInput = { channel: { in: PHONE_CHANNELS } };

  const statuses = str(q.status)
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is CallStatusValue => (CALL_STATUSES as readonly string[]).includes(s));
  if (statuses.length === 1) where.status = statuses[0];
  else if (statuses.length > 1) where.status = { in: [...new Set(statuses)] };

  const outcome = str(q.outcome);
  if ((CALL_OUTCOMES as readonly string[]).includes(outcome)) where.outcome = outcome as CallOutcomeValue;

  const purpose = str(q.purpose);
  if (purpose === 'campaign') {
    // Approximation worth knowing: a manual call attached to a campaign also has
    // a campaignId, so it counts here as well as under "Called by an admin".
    where.campaignId = { not: null };
  } else if ((CALL_PURPOSES as readonly string[]).includes(purpose)) {
    // callContext is a JSON column; the reason lives at $.reason.
    and.push({ callContext: { path: ['reason'], equals: purpose } });
  }

  const campaignId = str(q.campaignId);
  if (campaignId) where.campaignId = campaignId;

  const search = str(q.search);
  if (search) {
    const digits = search.replace(/\D/g, '');
    // Only digits, spaces and phone punctuation: a number. Anything with a
    // letter in it is a name, even if it also has digits.
    if (digits && /^[\d\s+\-()]+$/.test(search)) {
      where.phone = { contains: digits };
    } else {
      where.customer = { is: { name: { contains: search, mode: 'insensitive' } } };
    }
  }

  const from = validDate(q.from);
  const to = validDate(q.to);
  if (from || to) where.queuedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

  const answered = str(q.answered);
  if (answered === '1') where.answered = true;
  else if (answered === '0') where.answered = false;

  if (str(q.followUp) === '1') where.id = { in: opts.followUpIds ?? [] };

  if (and.length) where.AND = and;
  return where;
}

/** The filters worth recording in the audit trail of an export (only the ones that were actually set). */
export function activeCallFilters(q: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['status', 'outcome', 'purpose', 'campaignId', 'search', 'from', 'to', 'answered', 'followUp']) {
    const v = str(q[k]);
    if (v) out[k] = v;
  }
  return out;
}

/**
 * "Needs a follow-up" = a call where the customer asked for a callback
 * (outcome callback_requested) or sounded interested (outcome interested), in
 * the last `sinceDays` days, and there has been NO LATER phone call to the same
 * customer. Once anyone rings them again (an agent, a campaign, an automatic
 * call) they drop off the list, whatever the second call's outcome was.
 *
 * Calls with no customer are never listed: without a customer we cannot tell
 * whether anyone followed up. Chat conversations are not calls, so they neither
 * count as a follow-up nor appear here. Capped at 2,000 ids.
 */
export async function followUpIds(sinceDays: number = FOLLOW_UP_DAYS, now: Date = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - sinceDays * 86_400_000);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT a.id
    FROM "CallAttempt" a
    WHERE a.channel IN ('phone_outbound', 'phone_inbound')
      AND a."customerId" IS NOT NULL
      AND a.outcome IN ('callback_requested'::"CallOutcome", 'interested'::"CallOutcome")
      AND COALESCE(a."queuedAt", a."startedAt") >= ${since}
      AND NOT EXISTS (
        SELECT 1 FROM "CallAttempt" b
        WHERE b."customerId" = a."customerId"
          AND b.id <> a.id
          AND b.channel IN ('phone_outbound', 'phone_inbound')
          AND COALESCE(b."queuedAt", b."startedAt") > COALESCE(a."queuedAt", a."startedAt")
      )
    ORDER BY COALESCE(a."queuedAt", a."startedAt") DESC
    LIMIT 2000
  `);
  return rows.map((r) => r.id);
}

/** callContext.reason for a set of calls, in one query (the list select leaves callContext out). */
export async function purposesFor(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!ids.length) return out;
  const rows = await prisma.$queryRaw<Array<{ id: string; purpose: string | null }>>(Prisma.sql`
    SELECT id, "callContext"->>'reason' AS purpose FROM "CallAttempt" WHERE id = ANY(${ids}::text[])
  `);
  for (const r of rows) out.set(r.id, r.purpose);
  return out;
}

/** What the list sends for one call. No rawPayload, transcript, callContext or recordingUrl. */
export function toCallListItem(
  row: {
    id: string; phone: string; status: string | null; outcome: string | null; outcomeSource: string | null;
    answered: boolean | null; durationSec: number | null; summary: string | null; callbackAt: Date | null;
    queuedAt: Date | null; startedAt: Date | null; endedAt: Date | null; campaignId: string | null;
    customer: { id: string; name: string | null; phone: string } | null;
  },
  reason: string | null | undefined,
) {
  const summary = row.summary ? (row.summary.length > 300 ? `${row.summary.slice(0, 299)}…` : row.summary) : null;
  return {
    id: row.id,
    phone: row.phone,
    status: row.status,
    outcome: row.outcome,
    outcomeSource: row.outcomeSource,
    answered: row.answered,
    durationSec: row.durationSec,
    summary,
    // A campaign call carries no reason; show it as a campaign call.
    purpose: reason || (row.campaignId ? 'campaign' : null),
    callbackAt: row.callbackAt,
    queuedAt: row.queuedAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    campaignId: row.campaignId,
    customer: row.customer,
  };
}

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** Today in India (the whole team and every customer is on IST), as UTC instants: midnight to now. */
export function istTodayRange(now: Date = new Date()): { from: Date; to: Date } {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const istMidnight = istMs - (((istMs % 86_400_000) + 86_400_000) % 86_400_000);
  return { from: new Date(istMidnight - IST_OFFSET_MS), to: now };
}

/** The range an overview request asks for; invalid or missing values fall back to today in IST. */
export function overviewRange(q: Record<string, unknown>, now: Date = new Date()): { from: Date; to: Date } {
  const today = istTodayRange(now);
  const from = validDate(q.from) ?? today.from;
  const to = validDate(q.to) ?? today.to;
  return from.getTime() <= to.getTime() ? { from, to } : { from: to, to: from };
}
