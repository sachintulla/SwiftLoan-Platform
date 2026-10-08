/**
 * Offer comparison — pure maths, no UI. Lenders only send the eligible
 * amount, the interest rate and the processing fee (+ GST); EMI, interest and
 * total cost are computed here, for whichever tenure the user picks.
 *
 * KEEP IN SYNC with website-next/src/lib/compareOffers.ts (same logic; the two
 * codebases can't import from each other). Tests: __tests__/compareOffers.test.ts.
 *
 * Amounts are rupees (app convention for Offer.amount / fees).
 */

export type RankBy = 'cost' | 'emi' | 'rate' | 'interest' | 'fee' | 'approval';

export const TENURES = [12, 24, 36, 48, 60] as const;

export const RANK_LABELS: Record<RankBy, string> = {
  cost: 'Lowest total cost',
  emi: 'Lowest EMI',
  rate: 'Lowest interest rate',
  interest: 'Least interest',
  fee: 'Lowest processing fee',
  approval: 'Quick approval',
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
  /** Typical hours to an approval decision, when the lender/catalog provides it. */
  approvalHrs?: number | null;
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
  /** Typical hours to approval; null = unknown (never "wins", ranks last for 'approval'). */
  approvalHrs: number | null;
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
  const approvalHrs = o.approvalHrs != null && o.approvalHrs >= 0 ? o.approvalHrs : null;
  const base = { id: o.id, lenderName: o.lenderName, logoUrl: o.logoUrl ?? null, amount: o.amount, tenure, fees, approvalHrs };
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
    case 'fee': return r.fees;
    case 'approval': return r.approvalHrs ?? Number.POSITIVE_INFINITY;
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
  winners: { emi: string | null; rate: string | null; interest: string | null; cost: string | null; fee: string | null; approval: string | null };
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
      fee: minBy(priced, r => r.fees)?.id ?? null,
      approval: minBy(priced.filter(r => r.approvalHrs != null), r => r.approvalHrs!)?.id ?? null,
    },
    bestSavesVsWorst: best && worst && best.costOfBorrowing != null && worst.costOfBorrowing != null
      ? Math.max(0, worst.costOfBorrowing - best.costOfBorrowing)
      : null,
  };
}

/** "Instant" / "~6 hrs" / "~2 days" for an approval time; "—" when unknown. */
export function formatApproval(hrs: number | null | undefined): string {
  if (hrs == null) return '—';
  if (hrs <= 3) return 'Instant';
  if (hrs <= 24) return `~${Math.round(hrs)} hrs`;
  return `~${Math.round(hrs / 24)} days`;
}

/** A sensible starting tenure: the lender's own if it's one of ours, else 24. */
export function defaultTenure(preferred?: number | null): number {
  return preferred && (TENURES as readonly number[]).includes(preferred) ? preferred : 24;
}

const WIN_PHRASE: Record<keyof CompareResult['winners'], string> = {
  emi: 'lowest monthly EMI',
  rate: 'lowest interest rate',
  fee: 'lowest processing fee',
  interest: 'least total interest',
  cost: 'cheapest overall',
  approval: 'fastest approval',
};

/**
 * Everything the Compare screen shows, as plain data for the voice agent: the
 * header figures, the tenure / ranking in force, every lender column with every row
 * of the matrix (so nothing depends on the agent scraping a horizontally scrolling
 * grid), which lender wins which row, what is recommended and what is selected.
 * Money is whole rupees.
 */
export function summariseCompareForAgent(args: {
  result: CompareResult;
  tenure: number;
  rankLabel: string;
  rankOptions: string[];
  selectedId: string | null;
  pickedId: string | null;
}) {
  const { result, tenure, rankLabel, rankOptions, selectedId, pickedId } = args;
  const rows = result.rows;
  const pricedCount = rows.filter(r => !r.onApproval).length;
  const r0 = (n: number | null) => (n == null ? null : Math.round(n));
  const best = result.best;
  const selected = rows.find(r => r.id === selectedId) ?? null;
  return {
    status: rows.length ? 'ready' : 'empty',
    loan_amount_up_to: Math.max(0, ...rows.map(r => r.amount)),
    offers_matched: rows.length,
    tenure_months: tenure,
    tenure_options_months: [...TENURES],
    ranked_by: rankLabel,
    rank_options: rankOptions,
    best_overall: best
      ? {
          lender: best.lenderName,
          wins_on: rankLabel,
          monthly_emi: r0(best.emi),
          interest_rate_percent: best.rate,
          total_you_repay: r0(best.totalRepay),
          approval_time: formatApproval(best.approvalHrs),
        }
      : rows.length
        ? { none: 'These lenders confirm their rate only after approval, so they cannot be ranked yet.' }
        : null,
    selected_lender: selected?.lenderName ?? null,
    user_chose_instead_of_recommended: !!(pickedId && best && selected && selected.id !== best.id),
    lenders: rows.map(r => ({
      lender: r.lenderName,
      selected: r.id === selectedId,
      recommended: r.id === best?.id,
      rate_confirmed_only_on_approval: r.onApproval,
      ...(r.onApproval
        ? {}
        : {
            monthly_emi: r0(r.emi),
            interest_rate_percent: r.rate,
            total_interest: r0(r.totalInterest),
            total_you_repay: r0(r.totalRepay),
          }),
      processing_fee_incl_gst: r0(r.fees),
      eligible_amount: r0(r.amount),
      tenure_months: r.tenure,
      approval_time: formatApproval(r.approvalHrs),
      best_in:
        pricedCount > 1 && !r.onApproval
          ? (Object.keys(result.winners) as Array<keyof CompareResult['winners']>)
              .filter(k => result.winners[k] === r.id)
              .map(k => WIN_PHRASE[k])
          : [],
    })),
    note: 'EMIs are indicative; final terms are set by the lender.',
  };
}
