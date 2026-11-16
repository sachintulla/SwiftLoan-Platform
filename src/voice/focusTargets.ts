/**
 * Pure parsing for the agent's "point at what I'm talking about" highlight on the
 * offers / compare screens (see agentFocus.ts + the `highlight` tool in tools.ts).
 *
 * The voice agent names either a lender ("show them the HDFC offer") or a metric
 * ("the lowest EMI", "the processing fee", "the best interest rate"); this turns
 * that free text into a lender match and/or a metric key, so the screen can scroll
 * to and emphasise the right tile / number. No React, no side effects — unit-tested.
 */

/** The comparison metrics a number can be emphasised on (mirrors METRICS in compare.tsx). */
export type MetricKey = 'emi' | 'rate' | 'amount' | 'tenure' | 'interest' | 'fee' | 'repay';

export interface FocusQuery {
  /** the lender whose tile/column to scroll to, if one was named */
  lender?: string;
  /** the metric number to emphasise, if one was named */
  metric?: MetricKey;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

// Phrase → metric. Order matters: more specific phrases first ("interest rate"
// is the rate, "total interest" is the interest amount).
const METRIC_PHRASES: Array<[RegExp, MetricKey]> = [
  [/\b(interest rate|rate of interest|apr|roi|rate|percent|percentage)\b/, 'rate'],
  [/\b(monthly|emi|instal?ment|monthly payment|per month)\b/, 'emi'],
  [/\b(total interest|interest amount|interest paid|overall interest|least interest|interest cost)\b/, 'interest'],
  [/\b(processing fee|proces?ing|fee|fees|charges|upfront)\b/, 'fee'],
  [/\b(total repay|total repayment|total cost|overall cost|cheapest|you repay|pay back|payback)\b/, 'repay'],
  [/\b(eligible amount|loan amount|amount|principal)\b/, 'amount'],
  [/\b(tenure|duration|period|months|term)\b/, 'tenure'],
];

// "interest" alone (no "rate") means the total interest amount, not the rate.
// Handled after the table so "interest rate" still wins as 'rate'.
function metricFrom(q: string): MetricKey | undefined {
  for (const [re, key] of METRIC_PHRASES) if (re.test(q)) return key;
  if (/\binterest\b/.test(q)) return 'interest';
  return undefined;
}

/**
 * Finds the lender named in `query` among `lenders` (the on-screen lender names).
 * Case/spacing-insensitive, matches either way round (query inside a name or a
 * name inside the query), longest match wins so "HDFC Bank" beats "HDFC".
 */
// Words that appear in many lender names and so don't identify one on their own.
const LENDER_STOPWORDS = new Set(['bank', 'finance', 'financial', 'finserv', 'capital', 'limited', 'ltd', 'india', 'services', 'loans', 'loan', 'nbfc', 'the']);

export function matchLender(query: string, lenders: readonly string[]): string | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const qTokens = new Set(q.split(' ').filter(Boolean));
  let best: string | undefined;
  let bestScore = 0;
  for (const name of lenders) {
    const n = norm(name);
    if (n.length < 2) continue;
    let score = 0;
    // whole-name containment (either direction) is the strongest signal
    if (q.includes(n) || n.includes(q)) score = Math.max(score, n.length + 100);
    // otherwise a distinctive name-word appearing as a query word (e.g. "hdfc")
    for (const w of n.split(' ')) {
      if (w.length >= 3 && !LENDER_STOPWORDS.has(w) && qTokens.has(w)) score = Math.max(score, w.length + 10);
    }
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

/** Parse a free-text highlight target into a lender match and/or a metric. */
export function parseFocusQuery(query: string, lenders: readonly string[] = []): FocusQuery {
  const q = norm(query);
  return {
    lender: matchLender(query, lenders),
    metric: metricFrom(q),
  };
}
