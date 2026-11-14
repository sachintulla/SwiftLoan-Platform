import { describe, expect, it } from 'vitest';
import { FALLBACK_POPUP_MS, shouldContinueToAltOffers } from './offersFallback';

describe('no-offers fallback → Yubi', () => {
  it('continues to Yubi when no offers came back and Yubi is on', () => {
    expect(shouldContinueToAltOffers({ offerCount: 0, altOffersEnabled: true, applicationId: 'app1' })).toBe(true);
  });

  it('never interrupts real offers', () => {
    expect(shouldContinueToAltOffers({ offerCount: 1, altOffersEnabled: true, applicationId: 'app1' })).toBe(false);
  });

  it('goes to the offers page when Yubi is off or there is no application', () => {
    expect(shouldContinueToAltOffers({ offerCount: 0, altOffersEnabled: false, applicationId: 'app1' })).toBe(false);
    expect(shouldContinueToAltOffers({ offerCount: 0, altOffersEnabled: true, applicationId: null })).toBe(false);
  });

  it('pop-up stays about 3 seconds', () => {
    expect(FALLBACK_POPUP_MS).toBe(3000);
  });
});
