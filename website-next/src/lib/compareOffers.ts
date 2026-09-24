/**
 * Offer comparison — pure maths, no UI. Lenders only send the eligible
 * amount, the interest rate and the processing fee (+ GST); EMI, interest and
 * total cost are computed here, for whichever tenure the user picks.
 *
 * KEEP IN SYNC with src/utils/compareOffers.ts in the mobile app (same logic; the two
 * codebases can't import from each other). Tests live there: __tests__/compareOffers.test.ts.
 *
 * Amounts are rupees (app convention for Offer.amount / fees).
 */

export type RankBy = 'cost' | 'emi' | 'rate' | 'interest';

export const TENURES = [12, 24, 36, 48, 60] as const;

export const RANK_LABELS: Record<RankBy, string> = {
  cost: 'Lowest total cost',
  emi: 'Lowest EMI',
  rate: 'Lowest interest rate',
  interest: 'Least interest',
};

/** Minimal offer shape both the app's and the website's Offer satisfy. */
export interface CompareOfferInput {
  id: string;
  lenderName: string;
  amount: number;
  /** Annual interest rate, % — 0/null/missing means "confirmed on approval". */
  apr?: number | null;
  processingFeeAmount?: number | null;
  gstOnProcessingFee?: number | null;
  logoUrl?: string | null;
}

export interface CompareRow {
  id: string;
  lenderName: string;
  logoUrl: string | null;
  amount: number;
  tenure: number;
  /** Rate not yet known (lender confirms after approval) — shown, never ranked. */
  onApproval: boolean;
  rate: number | null;
  emi: number | null;
  totalInterest: number | null;
  /** Processing fee + GST on it. */
  fees: number;
  /** Interest + fees: what borrowing actually costs. */
  costOfBorrowing: number | null;
  /** Principal + interest + fees. */
  totalRepay: number | null;
  /** Cost of borrowing per ₹1 lakh — lets different loan amounts be compared fairly. */
  costPerLakh: number | null;
}

/** Standard reducing-balance EMI. */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = annualRatePct / 1200;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export function computeRow(o: CompareOfferInput, tenure: number): CompareRow {
  const fees = Math.max(0, (o.processingFeeAmount ?? 0) + (o.gstOnProcessingFee ?? 0));
  const rate = o.apr != null && o.apr > 0 ? o.apr : null;
  const base = { id: o.id, lenderName: o.lenderName, logoUrl: o.logoUrl ?? null, amount: o.amount, tenure, fees };
  if (rate == null || o.amount <= 0) {
    return { ...base, onApproval: true, rate: null, emi: null, totalInterest: null, costOfBorrowing: null, totalRepay: null, costPerLakh: null };
  }
  const monthly = emi(o.amount, rate, tenure);
  const totalInterest = monthly * tenure - o.amount;
  const costOfBorrowing = totalInterest + fees;
  return {
    ...base,
    onApproval: false,
    rate,
    emi: monthly,
    totalInterest,
    costOfBorrowing,
    totalRepay: o.amount + costOfBorrowing,
    costPerLakh: (costOfBorrowing / o.amount) * 100000,
  };
}

/** The number each ranking minimises. "Cost" is per ₹1L so a smaller loan doesn't "win" just by being smaller. */
function metric(r: CompareRow, by: RankBy): number {
  switch (by) {
    case 'emi': return r.emi!;
    case 'rate': return r.rate!;
    case 'interest': return r.totalInterest!;
    case 'cost':
    default: return r.costPerLakh!;
  }
}

export interface CompareFilters {
  tenure: number;
  rankBy: RankBy;
  /** Hide priced offers whose EMI is above this (null = no limit). */
  maxEmi?: number | null;
  /** Hide offers below this eligible amount (null = no minimum). */
  minAmount?: number | null;
  /** Show rate-on-approval offers (never ranked either way). */
  includeOnApproval?: boolean;
}

export interface CompareResult {
  /** Ranked priced offers (best first), then rate-on-approval offers. */
  rows: CompareRow[];
  /** Offers hidden by the EMI / amount filters. */
  hiddenCount: number;
  best: CompareRow | null;
  /** Per-metric winners among the shown priced offers (ids), for highlighting. */
  winners: { emi: string | null; rate: string | null; interest: string | null; cost: string | null };
  /** Savings of the best offer vs the most expensive shown one, by the active ranking's cost. */
  bestSavesVsWorst: number | null;
}

const minBy = (rows: CompareRow[], f: (r: CompareRow) => number) =>
  rows.length ? rows.reduce((a, b) => (f(b) < f(a) ? b : a)) : null;

export function compareOffers(offers: CompareOfferInput[], filters: CompareFilters): CompareResult {
  const all = offers.map(o => computeRow(o, filters.tenure));
  const passes = (r: CompareRow) =>
    (filters.minAmount == null || r.amount >= filters.minAmount) &&
    (filters.maxEmi == null || r.onApproval || (r.emi ?? 0) <= filters.maxEmi);
  const shown = all.filter(passes);
  const priced = shown.filter(r => !r.onApproval);
  const onApproval = filters.includeOnApproval === false ? [] : shown.filter(r => r.onApproval);

  // Stable sort: ties keep the lender's own order.
  const ranked = priced
    .map((r, i) => ({ r, i }))
    .sort((a, b) => metric(a.r, filters.rankBy) - metric(b.r, filters.rankBy) || a.i - b.i)
    .map(x => x.r);

  const best = ranked[0] ?? null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  return {
    rows: [...ranked, ...onApproval],
    hiddenCount: all.length - shown.length + (filters.includeOnApproval === false ? shown.filter(r => r.onApproval).length : 0),
    best,
    winners: {
      emi: minBy(priced, r => r.emi!)?.id ?? null,
      rate: minBy(priced, r => r.rate!)?.id ?? null,
      interest: minBy(priced, r => r.totalInterest!)?.id ?? null,
      cost: minBy(priced, r => r.costPerLakh!)?.id ?? null,
    },
    bestSavesVsWorst: best && worst && best.costOfBorrowing != null && worst.costOfBorrowing != null
      ? Math.max(0, worst.costOfBorrowing - best.costOfBorrowing)
      : null,
  };
}

/** A sensible starting tenure: the lender's own if it's one of ours, else 24. */
export function defaultTenure(preferred?: number | null): number {
  return preferred && (TENURES as readonly number[]).includes(preferred) ? preferred : 24;
}
