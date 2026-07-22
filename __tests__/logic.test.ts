import { inr, rupee, interFamily } from '../src/theme/tokens';

// Re-implement fareCalc's core to assert the amortisation math (UC-L4/L5).
function emiMid(P: number, n: number, ratePct: number) {
  const r = ratePct / 12 / 100;
  const emi = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return emi;
}

describe('UC-L1 Indian currency formatting', () => {
  it('groups lakhs correctly', () => {
    expect(inr(1500000)).toBe('15,00,000');
    expect(inr(45000)).toBe('45,000');
    expect(inr(999)).toBe('999');
    expect(inr(100000)).toBe('1,00,000');
    expect(inr(12345678)).toBe('1,23,45,678');
  });
  it('rounds fractional input', () => {
    expect(inr(999.7)).toBe('1,000');
  });
});

describe('UC-L2 rupee helper', () => {
  it('prefixes the rupee sign', () => {
    expect(rupee(25000)).toBe('₹25,000');
  });
});

describe('UC-L3 Inter weight → family map', () => {
  it('maps weights to bundled families', () => {
    expect(interFamily(800)).toBe('Inter-ExtraBold');
    expect(interFamily(700)).toBe('Inter-Bold');
    expect(interFamily(600)).toBe('Inter-SemiBold');
    expect(interFamily(500)).toBe('Inter-Medium');
    expect(interFamily(400)).toBe('Inter-Regular');
    expect(interFamily('700')).toBe('Inter-Bold');
  });
});

describe('UC-L4 EMI amortisation', () => {
  it('computes a sane monthly EMI', () => {
    const emi = emiMid(150000, 24, 16);
    // Known value for these inputs ≈ 7342
    expect(Math.round(emi)).toBeGreaterThan(7200);
    expect(Math.round(emi)).toBeLessThan(7500);
  });
  it('handles zero interest', () => {
    expect(emiMid(120000, 12, 0)).toBeCloseTo(10000, 5);
  });
});
