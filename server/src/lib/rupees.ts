/**
 * Amounts are whole rupees everywhere in SwiftLoan: the database, the API, the screens and what the voice
 * agent says. There is no other unit, so there is nothing to convert here, only to format.
 */

/** 1040000 → "₹10,40,000" (Indian digit grouping). Empty string for a missing amount. */
export function rupeesDigits(amount: number | null | undefined): string {
  if (amount == null) return '';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** 1040000 → "10.4 lakh rupees". The spoken form, since an agent reads this aloud. Null for a missing amount. */
export function rupeesInWords(amount: number | null | undefined): string | null {
  if (amount == null) return null;
  const r = Math.round(amount);
  if (r >= 10_000_000) return `${+(r / 10_000_000).toFixed(2)} crore rupees`;
  if (r >= 100_000) return `${+(r / 100_000).toFixed(2)} lakh rupees`;
  return `${r.toLocaleString('en-IN')} rupees`;
}
