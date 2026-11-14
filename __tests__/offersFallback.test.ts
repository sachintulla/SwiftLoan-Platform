import { FALLBACK_POPUP_MS, noOffersReason, shouldContinueToAltOffers } from '../src/utils/offersFallback';

describe('no-offers fallback → Yubi', () => {
  it('continues to Yubi when no offers came back and Yubi is on', () => {
    expect(shouldContinueToAltOffers({ offerCount: 0, altOffersEnabled: true, applicationId: 'app1' })).toBe(true);
  });

  it('never interrupts real offers', () => {
    expect(shouldContinueToAltOffers({ offerCount: 2, altOffersEnabled: true, applicationId: 'app1' })).toBe(false);
  });

  it('falls back to the empty state when Yubi is off', () => {
    expect(shouldContinueToAltOffers({ offerCount: 0, altOffersEnabled: false, applicationId: 'app1' })).toBe(false);
  });

  it('needs an application to refer', () => {
    expect(shouldContinueToAltOffers({ offerCount: 0, altOffersEnabled: true, applicationId: null })).toBe(false);
    expect(shouldContinueToAltOffers({ offerCount: 0, altOffersEnabled: true, applicationId: '' })).toBe(false);
  });

  it('keeps every failure reason, and nothing else', () => {
    for (const r of ['not_eligible', 'duplicate', 'technical', 'network'] as const) expect(noOffersReason(r)).toBe(r);
    expect(noOffersReason(null)).toBe('none');
    expect(noOffersReason('Lender said: Unknown error.')).toBe('none');
  });

  it('pop-up stays about 3 seconds', () => {
    expect(FALLBACK_POPUP_MS).toBe(3000);
  });
});
