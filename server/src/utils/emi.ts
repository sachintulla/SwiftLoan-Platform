// Amortised EMI (mirrors the app's fareCalc mid-point).
export function emi(principal: number, months: number, annualRatePct: number): number {
  const r = annualRatePct / 12 / 100;
  const e = r === 0 ? principal / months : (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(e);
}
