/**
 * Reducing-balance EMI, the standard formula banks and NBFCs use:
 *   EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1),  r = yearly rate ÷ 12 ÷ 100
 * Pure and shared, so the /emi-calculator page's example table is computed, never typed.
 */
export function emiFor(principal: number, yearlyRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = yearlyRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export interface EmiRow {
  months: number;
  emi: number;
  totalInterest: number;
  totalRepayment: number;
}

export function emiRow(principal: number, yearlyRatePct: number, months: number): EmiRow {
  const emi = emiFor(principal, yearlyRatePct, months);
  const totalRepayment = emi * months;
  return { months, emi, totalInterest: totalRepayment - principal, totalRepayment };
}

export const inrWhole = (n: number) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
