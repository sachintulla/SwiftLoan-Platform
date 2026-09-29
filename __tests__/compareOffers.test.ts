import { emi, computeRow, compareOffers, defaultTenure, formatApproval } from '../src/utils/compareOffers';

const OFFERS = [
  { id: 'idfc', lenderName: 'IDFC FIRST', amount: 300000, apr: 14.5, processingFeeAmount: 1499, gstOnProcessingFee: 270 },
  { id: 'prefr', lenderName: 'PREFR', amount: 300000, apr: 16.75, processingFeeAmount: 999, gstOnProcessingFee: 180 },
  { id: 'unity', lenderName: 'Unity SFB', amount: 300000, apr: 18, processingFeeAmount: 1799, gstOnProcessingFee: 324 },
  { id: 'mv', lenderName: 'Moneyview', amount: 250000, apr: 0 }, // rate on approval
];

describe('emi()', () => {
  it('matches the standard amortisation formula', () => {
    // ₹3,00,000 @ 14.5% for 24 months ≈ ₹14,475 (bank calculators agree)
    expect(Math.round(emi(300000, 14.5, 24))).toBe(14475);
  });
  it('handles 0% and bad inputs', () => {
    expect(emi(120000, 0, 12)).toBe(10000);
    expect(emi(0, 14, 12)).toBe(0);
    expect(emi(100000, 14, 0)).toBe(0);
  });
});

describe('computeRow()', () => {
  it('derives interest, fees incl. GST, cost and total repay', () => {
    const r = computeRow(OFFERS[0], 24);
    expect(r.onApproval).toBe(false);
    expect(r.fees).toBe(1769);
    expect(Math.round(r.totalInterest!)).toBe(Math.round(r.emi! * 24 - 300000));
    expect(r.costOfBorrowing).toBeCloseTo(r.totalInterest! + 1769, 6);
    expect(r.totalRepay).toBeCloseTo(300000 + r.costOfBorrowing!, 6);
  });
  it('no rate → rate on approval, nothing computed', () => {
    const r = computeRow(OFFERS[3], 24);
    expect(r).toMatchObject({ onApproval: true, rate: null, emi: null, totalRepay: null });
  });
  it('longer tenure → lower EMI, more interest', () => {
    const a = computeRow(OFFERS[0], 12), b = computeRow(OFFERS[0], 48);
    expect(b.emi!).toBeLessThan(a.emi!);
    expect(b.totalInterest!).toBeGreaterThan(a.totalInterest!);
  });
});

describe('compareOffers()', () => {
  it('ranks priced offers by the chosen basis; on-approval offers last, never "best"', () => {
    const res = compareOffers(OFFERS, { tenure: 24, rankBy: 'cost' });
    expect(res.best?.id).toBe('idfc');
    expect(res.rows.map(r => r.id)).toEqual(['idfc', 'prefr', 'unity', 'mv']);
    expect(res.winners).toMatchObject({ rate: 'idfc', interest: 'idfc', emi: 'idfc' });
    expect(res.bestSavesVsWorst).toBeGreaterThan(0);
  });

  it('cost ranking is per ₹1L, so a smaller loan does not win just by being smaller', () => {
    const offers = [
      { id: 'big', lenderName: 'Big', amount: 500000, apr: 13 },
      { id: 'small', lenderName: 'Small', amount: 100000, apr: 20 },
    ];
    // Small has far lower absolute cost but is much more expensive per rupee.
    const res = compareOffers(offers, { tenure: 24, rankBy: 'cost' });
    expect(res.best?.id).toBe('big');
  });

  it('EMI ranking can differ from cost ranking', () => {
    const offers = [
      { id: 'lowRateBigFee', lenderName: 'A', amount: 300000, apr: 14, processingFeeAmount: 20000 },
      { id: 'highRateNoFee', lenderName: 'B', amount: 300000, apr: 15, processingFeeAmount: 0 },
    ];
    expect(compareOffers(offers, { tenure: 12, rankBy: 'emi' }).best?.id).toBe('lowRateBigFee');
    expect(compareOffers(offers, { tenure: 12, rankBy: 'cost' }).best?.id).toBe('highRateNoFee');
  });

  it('max EMI and min amount filters hide offers and report how many', () => {
    const res = compareOffers(OFFERS, { tenure: 24, rankBy: 'emi', maxEmi: 14600, minAmount: 300000 });
    expect(res.rows.map(r => r.id)).toEqual(['idfc']); // PREFR/Unity EMI > 14.6k; Moneyview < 3L
    expect(res.hiddenCount).toBe(3);
  });

  it('can exclude rate-on-approval offers', () => {
    const res = compareOffers(OFFERS, { tenure: 24, rankBy: 'cost', includeOnApproval: false });
    expect(res.rows.find(r => r.id === 'mv')).toBeUndefined();
    expect(res.hiddenCount).toBe(1);
  });

  it('empty / all-on-approval inputs are safe', () => {
    expect(compareOffers([], { tenure: 24, rankBy: 'cost' })).toMatchObject({ rows: [], best: null, bestSavesVsWorst: null });
    const res = compareOffers([OFFERS[3]], { tenure: 24, rankBy: 'cost' });
    expect(res.best).toBeNull();
    expect(res.rows).toHaveLength(1);
  });

  it('ties keep the lender order (stable)', () => {
    const offers = [
      { id: 'a', lenderName: 'A', amount: 200000, apr: 15 },
      { id: 'b', lenderName: 'B', amount: 200000, apr: 15 },
    ];
    expect(compareOffers(offers, { tenure: 24, rankBy: 'rate' }).rows.map(r => r.id)).toEqual(['a', 'b']);
  });
});

describe('defaultTenure()', () => {
  it('uses the lender tenure when it is one of the options, else 24', () => {
    expect(defaultTenure(36)).toBe(36);
    expect(defaultTenure(18)).toBe(24);
    expect(defaultTenure(null)).toBe(24);
  });
});

describe('fee and approval ranking', () => {
  const offers = [
    { id: 'a', lenderName: 'A', amount: 300000, apr: 14.5, processingFeeAmount: 6999, approvalHrs: 48 },
    { id: 'b', lenderName: 'B', amount: 300000, apr: 16.5, processingFeeAmount: 499, approvalHrs: 6 },
    { id: 'c', lenderName: 'C', amount: 300000, apr: 17, processingFeeAmount: 1299, approvalHrs: 1 },
    { id: 'd', lenderName: 'D', amount: 300000, apr: 15.5, processingFeeAmount: 1999 }, // approval unknown
  ];
  it('lowest processing fee (incl. GST) wins "fee"', () => {
    const r = compareOffers(offers, { tenure: 24, rankBy: 'fee' });
    expect(r.best?.id).toBe('b');
    expect(r.winners.fee).toBe('b');
  });
  it('quickest known approval wins "approval"; unknown ranks last and never wins', () => {
    const r = compareOffers(offers, { tenure: 24, rankBy: 'approval' });
    expect(r.rows.map(x => x.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(r.winners.approval).toBe('c');
  });
  it('no approval data → no approval winner', () => {
    const r = compareOffers(offers.map(({ approvalHrs, ...o }) => o), { tenure: 24, rankBy: 'approval' });
    expect(r.winners.approval).toBeNull();
  });
  it('formats approval times', () => {
    expect(formatApproval(1)).toBe('Instant');
    expect(formatApproval(6)).toBe('~6 hrs');
    expect(formatApproval(48)).toBe('~2 days');
    expect(formatApproval(null)).toBe('—');
  });
});
