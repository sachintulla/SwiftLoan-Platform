/**
 * Pure rules for the Dashboard graphs (GET /api/admin/dashboard/graphs). No database here, so they are unit tested.
 *
 * Every figure counts PEOPLE once (not applications), and nothing claims an approval or a disbursal: lenders do not
 * report those back.
 */
import { METRIC_STATUSES } from './peopleMetrics.js';
import { yubiOutcome, yubiStatusLabel } from './yubiStatus.js';

/** The steps of "How far people get", in order. */
export const FUNNEL_STEPS = [
  { key: 'signedUp', label: 'Signed up', hint: 'Created an account with a mobile number' },
  { key: 'verified', label: 'Verified the number', hint: 'Entered the OTP' },
  { key: 'checked', label: 'Checked eligibility', hint: 'Filled their details and asked for offers' },
  { key: 'gotOffers', label: 'Got at least one offer', hint: 'A lender returned an offer' },
  { key: 'applied', label: 'Applied to a lender', hint: 'Tapped Apply on an offer' },
] as const;
export type FunnelKey = (typeof FUNNEL_STEPS)[number]['key'];

export interface FunnelRow {
  key: FunnelKey; label: string; hint: string; count: number;
  /** % of the first step. */
  pctOfFirst: number;
  /** % of the step before; null for the first step. */
  pctOfPrev: number | null;
  /** People lost since the step before; null for the first step. */
  dropped: number | null;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/**
 * Funnel rows from raw counts. A later step can never show more people than the one before it: the counts come from
 * separate conditions, so each is capped at the previous step.
 */
export function funnelRows(counts: Record<FunnelKey, number>): FunnelRow[] {
  const rows: FunnelRow[] = [];
  let prev: number | null = null;
  const first = Math.max(0, counts.signedUp || 0);
  for (const s of FUNNEL_STEPS) {
    const raw = Math.max(0, counts[s.key] || 0);
    const count: number = prev == null ? raw : Math.min(raw, prev);
    rows.push({
      ...s, count,
      pctOfFirst: pct(count, first),
      pctOfPrev: prev == null ? null : pct(count, prev),
      dropped: prev == null ? null : prev - count,
    });
    prev = count;
  }
  return rows;
}

/** What happened to a person who started an application, from the status of their LATEST application. */
export const OUTCOMES = [
  { key: 'noOffers', label: 'No lender offered a loan', tone: 'red' },
  { key: 'offersWaiting', label: 'Offers ready, not applied yet', tone: 'amber' },
  { key: 'withLender', label: 'Applied, now with a lender', tone: 'green' },
  { key: 'unfinished', label: 'Stopped before finishing details', tone: 'grey' },
  { key: 'failed', label: 'Technical failure', tone: 'slate' },
] as const;
export type OutcomeKey = (typeof OUTCOMES)[number]['key'];

export function outcomeOfStatus(status: string): OutcomeKey {
  switch (status) {
    case 'rejected': return 'noOffers';
    case 'offers_ready': return 'offersWaiting';
    case 'handoff': case 'under_review': case 'approved': case 'disbursed': case 'closed': return 'withLender';
    case 'failed': return 'failed';
    default: return 'unfinished'; // draft, pan_pending, prequalifying, anything new
  }
}

export function outcomeRows(byStatus: { status: string; count: number }[]) {
  const totals = Object.fromEntries(OUTCOMES.map((o) => [o.key, 0])) as Record<OutcomeKey, number>;
  for (const r of byStatus) totals[outcomeOfStatus(r.status)] += Math.max(0, r.count || 0);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return { total, rows: OUTCOMES.map((o) => ({ ...o, count: totals[o.key], pct: pct(totals[o.key], total) })) };
}

/** Loan amount asked for, in whole rupees. `max` is exclusive; null = no upper limit. */
export const AMOUNT_BANDS = [
  { key: 'under50k', label: 'Under ₹50,000', max: 50_000 },
  { key: '50kTo2L', label: '₹50,000 to ₹2 lakh', max: 200_000 },
  { key: '2LTo5L', label: '₹2 lakh to ₹5 lakh', max: 500_000 },
  { key: '5LPlus', label: '₹5 lakh and above', max: null },
] as const;

export function amountBandOf(rupees: number): (typeof AMOUNT_BANDS)[number]['key'] {
  for (const b of AMOUNT_BANDS) if (b.max == null || rupees < b.max) return b.key;
  return '5LPlus';
}

export function amountRows(byBand: { band: string; count: number }[]) {
  const map = new Map(byBand.map((b) => [b.band, Math.max(0, b.count || 0)]));
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return { total, rows: AMOUNT_BANDS.map((b) => ({ key: b.key, label: b.label, count: map.get(b.key) ?? 0, pct: pct(map.get(b.key) ?? 0, total) })) };
}

/** How many days the daily graphs may cover. */
export function clampDays(raw: unknown): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? Math.min(90, Math.max(7, n)) : 14;
}

/* ───────────── "People per day" graph: registered, applied, got offers, rejected ───────────── */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** Most days one graph may cover (a custom range longer than this is cut to its last days). */
export const DAILY_MAX_DAYS = 366;

const addDays = (ymd: string, n: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * The India days a request covers, as YYYY-MM-DD (both ends included).
 *   - `from` and `to` given (custom dates): that range, swapped if reversed, never past today, at most DAILY_MAX_DAYS.
 *   - otherwise `days` (7 / 30 / 90 …): that many days ending today. Anything unreadable means 7.
 */
export function dailyWindow(q: { days?: unknown; from?: unknown; to?: unknown }, today: string): { from: string; to: string; days: number } {
  const f = typeof q.from === 'string' && YMD.test(q.from) ? q.from : null;
  const t = typeof q.to === 'string' && YMD.test(q.to) ? q.to : null;
  if (f && t) {
    let from = f <= t ? f : t;
    let to = f <= t ? t : f;
    if (to > today) to = today;
    if (from > to) from = to;
    if (dayDiff(from, to) + 1 > DAILY_MAX_DAYS) from = addDays(to, -(DAILY_MAX_DAYS - 1));
    return { from, to, days: dayDiff(from, to) + 1 };
  }
  const n = parseInt(String(q.days ?? ''), 10);
  const days = Number.isFinite(n) ? Math.min(DAILY_MAX_DAYS, Math.max(1, n)) : 7;
  return { from: addDays(today, -(days - 1)), to: today, days };
}

export interface PeopleDay { day: string; registered: number; applied: number; gotOffers: number; rejected: number }

/** Totals for the range, and each stage as a share of the people who applied (registered has no share). */
export function peopleTotals(rows: PeopleDay[]) {
  const sum = (k: keyof Omit<PeopleDay, 'day'>) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const registered = sum('registered'); const applied = sum('applied'); const gotOffers = sum('gotOffers'); const rejected = sum('rejected');
  return { registered, applied, gotOffers, rejected, gotOffersPct: pct(gotOffers, applied), rejectedPct: pct(rejected, applied) };
}

/**
 * Totals for the boxes above the graph. `registered` is the days added up (an account is created once); the other three
 * are PEOPLE counted once over the whole range (the route reads them that way), with offers / no offers as a share of them.
 */
export function peopleRangeTotals(registered: number, people: { applied: number; gotOffers: number; rejected: number }) {
  const applied = Math.max(0, people.applied || 0);
  const gotOffers = Math.min(applied, Math.max(0, people.gotOffers || 0));
  const rejected = Math.min(applied - gotOffers, Math.max(0, people.rejected || 0));
  return { registered: Math.max(0, registered || 0), applied, gotOffers, rejected, gotOffersPct: pct(gotOffers, applied), rejectedPct: pct(rejected, applied) };
}

/* ───────────── Lender status graphs: Aurix, Yubi and Revasure ───────────── */

export interface PieSlice { key: string; label: string; count: number; pct: number }

/** Revasure's answer to a lead we sent, in plain words. An unknown status is shown as it came. */
const REVASURE_LABELS: Record<string, string> = {
  success: 'Accepted',
  ineligible: 'Not eligible',
  low_income: 'Not eligible: low income',
  duplicate: 'Already registered',
  failed: 'Could not send',
  pending: 'Waiting for an answer',
};

/**
 * Where a Yubi referral stands, in plain words. `status` is ours (did the hand-off work), `lastStatus` is the latest
 * word from Yubi. No word from Yubi yet = the customer was sent there and nothing has come back.
 */
export function yubiSliceOf(status: string | null, lastStatus: string | null): { key: string; label: string } {
  if (status === 'failed') return { key: 'failed', label: 'Could not send' };
  const code = (lastStatus ?? '').toUpperCase();
  if (!code) return { key: 'sent', label: 'Waiting for Yubi' };
  // Sanctioned, signing and ready-to-pay-out all mean the lender said yes: one "Approved" slice (lib/yubiStatus.ts).
  const outcome = yubiOutcome(code);
  if (outcome === 'approved') return { key: 'approved', label: 'Approved' };
  if (code === 'READY_FOR_UNDERWRITING') return { key: 'new_application', label: 'Application started' };
  return { key: code.toLowerCase(), label: yubiStatusLabel(code) };
}

/**
 * Aurix is the lender network behind the eligibility check and the lenders people apply with. Its numbers are PEOPLE,
 * once each, by their real status (lib/customerStatus.ts), grouped by the shared rules (lib/peopleMetrics.ts), so this
 * chart shows the same numbers as the Dashboard cards and the Customers page. It used to count applications by their
 * stored status: one person with five tries was five "no offers", and a tap on Apply looked like a lender application.
 * People who never asked for offers (no application, or still filling details) are not counted.
 */
const AURIX_PEOPLE: { key: string; label: string; statuses: readonly string[] }[] = [
  { key: 'no_offers', label: 'No offers', statuses: ['no_offers'] },
  { key: 'offers_ready', label: 'Offers ready, not applied', statuses: ['offers_ready'] },
  { key: 'tapped', label: 'Tapped Apply, not confirmed', statuses: METRIC_STATUSES.tappedApply },
  { key: 'under_review', label: 'In review with the lender', statuses: ['under_review'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'disbursed', label: 'Disbursed', statuses: ['disbursed'] },
  { key: 'lender_rejected', label: 'Rejected by the lender', statuses: ['lender_rejected'] },
  { key: 'failed', label: 'Offers check failed', statuses: ['offers_failed'] },
  { key: 'checking', label: 'Checking now', statuses: ['checking_offers'] },
];

/** Slices biggest first, each with its share of the whole. Empty slices are left out. */
function toSlices(rows: { key: string; label: string; count: number }[]): { total: number; slices: PieSlice[] } {
  const merged = new Map<string, { key: string; label: string; count: number }>();
  for (const r of rows) {
    const n = Math.max(0, r.count || 0);
    const hit = merged.get(r.key);
    if (hit) hit.count += n; else merged.set(r.key, { ...r, count: n });
  }
  const list = [...merged.values()].filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const total = list.reduce((s, r) => s + r.count, 0);
  return { total, slices: list.map((s) => ({ ...s, pct: total > 0 ? Math.round((s.count / total) * 1000) / 10 : 0 })) };
}

/** Aurix slices from how many people are in each customer status (the `counts` of customerIdsByStatus). */
export function aurixPeopleSlices(counts: Record<string, number>) {
  return toSlices(AURIX_PEOPLE.map((g) => ({ key: g.key, label: g.label, count: g.statuses.reduce((n, k) => n + Math.max(0, counts[k] || 0), 0) })));
}

export function revasureSlices(rows: { status: string; count: number }[]) {
  return toSlices(rows.map((r) => ({ key: r.status, label: REVASURE_LABELS[r.status] ?? r.status, count: r.count })));
}

export function yubiSlices(rows: { status: string | null; lastStatus: string | null; count: number }[]) {
  return toSlices(rows.map((r) => ({ ...yubiSliceOf(r.status, r.lastStatus), count: r.count })));
}

/* ───────────── One chart for the three lenders: a row per status, a count per lender ───────────── */

/**
 * Aurix, Yubi and Revasure each use their own status words. For ONE chart they are read as statuses that mean the same
 * thing for all three, in the words of lib/peopleMetrics.ts. "Sent" is everything handed to the lender; the others say
 * what happened to it. Something still waiting for the lender's first word (Yubi "sent, no update yet", Aurix
 * "checking now") is counted in Sent only, so the rows do not always add up to Sent.
 *
 * Words that must not be mixed (owner, 2026-11-27):
 *   No offers  = the lender looked and offered nothing, or did not take the person (not eligible, already registered).
 *   Rejected   = a lender turned down an APPLICATION the customer made. Nothing else.
 *   Lead accepted = the lender took the lead we sent; nobody has applied for anything yet. Never "applied".
 *   Tapped Apply  = opened the lender's page; no application confirmed.
 */
export const LENDER_STATUSES = [
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Lead accepted' },
  { key: 'offers', label: 'Offers ready' },
  { key: 'tapped', label: 'Tapped Apply' },
  { key: 'progress', label: 'Applied / in progress' },
  { key: 'approved', label: 'Approved' },
  { key: 'disbursed', label: 'Disbursed' },
  { key: 'noOffers', label: 'No offers' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'failed', label: 'Failed' },
] as const;
export type LenderStatusKey = (typeof LENDER_STATUSES)[number]['key'];
export type LenderName = 'aurix' | 'yubi' | 'revasure';
export const LENDER_NAMES: LenderName[] = ['aurix', 'yubi', 'revasure'];

const STATUS_OF: Record<LenderName, Record<string, Exclude<LenderStatusKey, 'sent'>>> = {
  // Keys are the slice keys produced by aurixPeopleSlices / yubiSlices / revasureSlices. A key that is missing here
  // (waiting for the lender's first word, or a code we have never seen) is counted in Sent only.
  aurix: { no_offers: 'noOffers', offers_ready: 'offers', tapped: 'tapped', under_review: 'progress', approved: 'approved', disbursed: 'disbursed', lender_rejected: 'rejected', failed: 'failed' },
  yubi: { failed: 'failed', new_lead: 'accepted', new_application: 'progress', approved: 'approved', disbursed: 'disbursed', offer_generated: 'offers', lead_rejected: 'noOffers', no_offers: 'noOffers', application_rejected: 'rejected' },
  revasure: { success: 'accepted', ineligible: 'noOffers', low_income: 'noOffers', duplicate: 'noOffers', failed: 'failed' },
};

/** The status row a lender's own status belongs to, or null when it is only "sent" so far. */
export function lenderStatusOf(lender: LenderName, sliceKey: string): Exclude<LenderStatusKey, 'sent'> | null {
  return STATUS_OF[lender][sliceKey] ?? null;
}

export interface LenderStatusRow {
  key: LenderStatusKey; label: string;
  aurix: number; yubi: number; revasure: number; total: number;
  /** The lender's own words behind each number. */
  detail: Record<LenderName, { label: string; count: number }[]>;
}

/** The chart: one row per status, each with the three lenders' counts. */
export function lenderStatusRows(parts: Record<LenderName, { total: number; slices: PieSlice[] }>): LenderStatusRow[] {
  const rows = new Map<LenderStatusKey, LenderStatusRow>(LENDER_STATUSES.map((st) => [st.key, {
    key: st.key, label: st.label, aurix: 0, yubi: 0, revasure: 0, total: 0, detail: { aurix: [], yubi: [], revasure: [] },
  }]));
  for (const lender of LENDER_NAMES) {
    const part = parts[lender];
    const sent = rows.get('sent')!;
    sent[lender] = part.total;
    for (const s of part.slices) {
      const k = lenderStatusOf(lender, s.key);
      if (!k) { sent.detail[lender].push({ label: s.label, count: s.count }); continue; } // still waiting: named under Sent
      const row = rows.get(k)!;
      row[lender] += s.count;
      row.detail[lender].push({ label: s.label, count: s.count });
    }
  }
  return [...rows.values()].map((r) => ({ ...r, total: r.aurix + r.yubi + r.revasure }));
}

/* ───────────── Overall outcome across the three lenders (the pie beside the lender chart) ───────────── */

export const OVERALL_OUTCOMES = [
  { key: 'gotOffers', label: 'Got offers' },
  { key: 'noOffers', label: 'No offers' },
  { key: 'rejected', label: 'Rejected' },
] as const;
export type OverallKey = (typeof OVERALL_OUTCOMES)[number]['key'];

/**
 * Which overall outcome a lender's status counts as, or null when it is neither (still waiting, a lead that was only
 * accepted, a technical failure). Same words as the chart beside it:
 *   Got offers = a lender made an offer (whether or not the customer has applied since).
 *   No offers  = the lender looked and offered nothing, or did not take the person.
 *   Rejected   = a lender turned down an application the customer made.
 * Each Aurix person is in exactly one: someone a lender rejected is "Rejected", not also "Got offers".
 */
const OVERALL_OF: Record<LenderName, Record<string, OverallKey>> = {
  aurix: { offers_ready: 'gotOffers', tapped: 'gotOffers', under_review: 'gotOffers', approved: 'gotOffers', disbursed: 'gotOffers', no_offers: 'noOffers', lender_rejected: 'rejected' },
  yubi: { offer_generated: 'gotOffers', new_application: 'gotOffers', approved: 'gotOffers', disbursed: 'gotOffers', no_offers: 'noOffers', lead_rejected: 'noOffers', application_rejected: 'rejected' },
  revasure: { ineligible: 'noOffers', low_income: 'noOffers', duplicate: 'noOffers' },
};
export function overallOutcomeOf(lender: LenderName, sliceKey: string): OverallKey | null {
  return OVERALL_OF[lender][sliceKey] ?? null;
}

/** The pie: three slices with their share of the three together, and each lender's part of every slice. */
export function overallOutcomes(parts: Record<LenderName, { total: number; slices: PieSlice[] }>) {
  const acc = new Map(OVERALL_OUTCOMES.map((o) => [o.key, { key: o.key as OverallKey, label: o.label as string, count: 0, byLender: { aurix: 0, yubi: 0, revasure: 0 } as Record<LenderName, number> }]));
  for (const lender of LENDER_NAMES) {
    for (const s of parts[lender].slices) {
      const k = overallOutcomeOf(lender, s.key);
      if (!k) continue;
      const row = acc.get(k)!;
      row.count += s.count;
      row.byLender[lender] += s.count;
    }
  }
  const rows = [...acc.values()];
  const total = rows.reduce((s, r) => s + r.count, 0);
  return { total, slices: rows.map((r) => ({ ...r, pct: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0 })) };
}
