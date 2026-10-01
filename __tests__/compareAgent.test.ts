import { compareOffers, summariseCompareForAgent } from '../src/utils/compareOffers';

// UC-C1: everything on the Compare Offers screen reaches the voice agent as data.
const offers = [
  { id: 'a', lenderName: 'IDFC', amount: 300000, apr: 12, processingFeeAmount: 1000, gstOnProcessingFee: 180, approvalHrs: 2 },
  { id: 'b', lenderName: 'Prefr', amount: 200000, apr: 20, processingFeeAmount: 2000, gstOnProcessingFee: 360, approvalHrs: 30 },
  { id: 'c', lenderName: 'MoneyView', amount: 150000, apr: null, approvalHrs: null },
];
const RANKS = ['Lowest total cost', 'Lowest monthly EMI', 'Lowest processing fee', 'Quick approval'];

describe('UC-C1 compare screen -> voice agent', () => {
  const result = compareOffers(offers, { tenure: 24, rankBy: 'cost' });
  const s = summariseCompareForAgent({ result, tenure: 24, rankLabel: RANKS[0], rankOptions: RANKS, selectedId: result.best!.id, pickedId: null });

  it('reports the header figures, tenure and ranking in force, and the available options', () => {
    expect(s.status).toBe('ready');
    expect(s.offers_matched).toBe(3);
    expect(s.loan_amount_up_to).toBe(300000);
    expect(s.tenure_months).toBe(24);
    expect(s.tenure_options_months).toEqual([12, 24, 36, 48, 60]);
    expect(s.ranked_by).toBe('Lowest total cost');
    expect(s.rank_options).toEqual(RANKS);
  });
  it('lists every lender with every matrix row, incl. rate-on-approval ones', () => {
    expect(s.lenders.map(l => l.lender)).toEqual(['IDFC', 'Prefr', 'MoneyView']);
    const idfc: any = s.lenders[0];
    expect(idfc.monthly_emi).toBeGreaterThan(0);
    expect(idfc.interest_rate_percent).toBe(12);
    expect(idfc.total_you_repay).toBeGreaterThan(idfc.eligible_amount);
    expect(idfc.processing_fee_incl_gst).toBe(1180);
    expect(idfc.approval_time).toBe('Instant');
    const mv: any = s.lenders[2];
    expect(mv.rate_confirmed_only_on_approval).toBe(true);
    expect(mv.monthly_emi).toBeUndefined();
  });
  it('says which lender is recommended / selected and what it wins', () => {
    expect(s.best_overall).toMatchObject({ lender: 'IDFC', wins_on: 'Lowest total cost' });
    expect(s.selected_lender).toBe('IDFC');
    expect((s.lenders[0] as any).recommended).toBe(true);
    expect((s.lenders[0] as any).best_in).toEqual(expect.arrayContaining(['lowest interest rate', 'cheapest overall', 'fastest approval']));
    // Prefr asks for a smaller loan, so its EMI is the lowest even though its rate is higher.
    expect((s.lenders[1] as any).best_in).toEqual(['lowest monthly EMI']);
  });
  it('flags a manual pick that differs from the recommendation', () => {
    const picked = summariseCompareForAgent({ result, tenure: 24, rankLabel: RANKS[0], rankOptions: RANKS, selectedId: 'b', pickedId: 'b' });
    expect(picked.selected_lender).toBe('Prefr');
    expect(picked.user_chose_instead_of_recommended).toBe(true);
  });
  it('handles no ranked offers (all rate-on-approval)', () => {
    const r = compareOffers([offers[2]], { tenure: 24, rankBy: 'cost' });
    const e = summariseCompareForAgent({ result: r, tenure: 24, rankLabel: RANKS[0], rankOptions: RANKS, selectedId: null, pickedId: null });
    expect((e.best_overall as any).none).toMatch(/after approval/);
  });
});
