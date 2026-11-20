import { describe, expect, it } from 'vitest';
import { emiFor, emiRow } from '@/lib/emi';

describe('EMI maths (reducing balance)', () => {
  it('matches the standard worked value: ₹1,00,000 at 12% for 12 months ≈ ₹8,885', () => {
    expect(Math.round(emiFor(100000, 12, 12))).toBe(8885);
  });
  it('the example on the page: ₹5,00,000 at 11.5%', () => {
    const r = emiRow(500000, 11.5, 36);
    expect(Math.round(r.emi)).toBe(16488);
    expect(Math.round(r.totalRepayment)).toBe(Math.round(r.emi * 36));
    expect(r.totalInterest).toBeGreaterThan(0);
  });
  it('a longer tenure lowers the EMI and raises the total interest', () => {
    const a = emiRow(500000, 11.5, 24), b = emiRow(500000, 11.5, 60);
    expect(b.emi).toBeLessThan(a.emi);
    expect(b.totalInterest).toBeGreaterThan(a.totalInterest);
  });
  it('0% interest and empty input', () => {
    expect(emiFor(120000, 0, 12)).toBe(10000);
    expect(emiFor(0, 12, 12)).toBe(0);
  });
});
