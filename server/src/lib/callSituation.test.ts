import { describe, it, expect } from 'vitest';
import { describeSituation, pickBestOffer } from './callSituation.js';

describe('describeSituation (what the voice agent is told is true now)', () => {
  it('offers, none applied: count and the best offer, in one sentence and as separate values', () => {
    const s = describeSituation({ status: 'offers_not_applied', offerCount: 3, best: { lender: 'KreditBee', amount: 200000, emi: 9800, tenureMonths: 24 } })!;
    expect(s.call_situation).toBe('They got 3 loan offers and have not applied yet. The best one is ₹2,00,000 from KreditBee, EMI about ₹9,800 a month for 24 months.');
    expect(s.offer_count).toBe('3');
    expect(s.best_offer_lender).toBe('KreditBee');
    expect(s.best_offer_amount).toBe('₹2,00,000');
    expect(s.best_offer_amount_words).toBe('2 lakh rupees');
    expect(s.best_offer_tenure_months).toBe('24');
    expect(s.lead_stage).toBe('Offers ready, not applied');
  });
  it('one offer reads singular', () => {
    expect(describeSituation({ status: 'offers_not_applied', offerCount: 1, best: { lender: 'L', amount: 50000, emi: 4500, tenureMonths: 12 } })!.call_situation)
      .toMatch(/^They got 1 loan offer and/);
  });
  it('no offers says so plainly, with no offer values (never the lender\'s "duplicate")', () => {
    const s = describeSituation({ status: 'rejected', offerCount: 0, best: null })!;
    expect(s.call_situation).toBe('They checked for loan offers and none were found for them yet.');
    expect(s.offer_count).toBe('');
    expect(JSON.stringify(s)).not.toMatch(/duplicate/i);
  });
  it('each earlier step names only that step', () => {
    expect(describeSituation({ status: 'otp_verified', offerCount: 0, best: null })!.call_situation).toMatch(/not verified their PAN/);
    expect(describeSituation({ status: 'pan_verified', offerCount: 0, best: null })!.call_situation).toMatch(/not filled in their basic details/);
    expect(describeSituation({ status: 'application_filled', offerCount: 0, best: null })!.call_situation).toMatch(/offers have not been shown/);
    expect(describeSituation({ status: 'failed', offerCount: 0, best: null })!.call_situation).toMatch(/technical problem on our side/);
    expect(describeSituation({ status: 'applied', offerCount: 2, best: null, appliedLender: 'KreditBee' })!.call_situation).toMatch(/applied for a loan with KreditBee/);
  });
  it('no description for someone not signed in or already past the lender decision', () => {
    expect(describeSituation({ status: null, offerCount: 0, best: null })).toBeNull();
    expect(describeSituation({ status: 'finished', offerCount: 0, best: null })).toBeNull();
  });
});

describe('pickBestOffer', () => {
  it('highest amount wins; a tie goes to the lower EMI', () => {
    expect(pickBestOffer([
      { lender: 'A', amount: 100000, emi: 5000, tenureMonths: 24 },
      { lender: 'B', amount: 200000, emi: 9800, tenureMonths: 24 },
      { lender: 'C', amount: 200000, emi: 9000, tenureMonths: 30 },
    ])?.lender).toBe('C');
    expect(pickBestOffer([])).toBeNull();
  });
});
