import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./leads', () => ({ apiBase: () => 'http://api.test' }));
const authFetch = vi.fn();
vi.mock('./session', () => ({ authFetch: (...a: unknown[]) => authFetch(...a) }));

import { fetchAltOffersEnabled, markAltOfferApplied, requestAltOffer, resetAltOffersFeatureCache } from './altOffers';

beforeEach(() => {
  resetAltOffersFeatureCache();
  authFetch.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchAltOffersEnabled', () => {
  it('is true only when the server says altOffers: true', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { altOffers: true } }) });
    vi.stubGlobal('fetch', f);
    expect(await fetchAltOffersEnabled()).toBe(true);
    expect(f).toHaveBeenCalledWith('http://api.test/api/config/features');
  });
  it('is false when the flag is off', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { altOffers: false } }) }));
    expect(await fetchAltOffersEnabled()).toBe(false);
  });
  it.each([
    ['a non-2xx response', () => vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })],
    ['a network error', () => vi.fn().mockRejectedValue(new Error('down'))],
    ['an unparseable body', () => vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('bad'); } })],
  ])('fails closed on %s', async (_n, make) => {
    vi.stubGlobal('fetch', make());
    expect(await fetchAltOffersEnabled()).toBe(false);
  });
  it('asks the server once per page load', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { altOffers: true } }) });
    vi.stubGlobal('fetch', f);
    await Promise.all([fetchAltOffersEnabled(), fetchAltOffersEnabled()]);
    await fetchAltOffersEnabled();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('requestAltOffer / markAltOfferApplied', () => {
  it('POSTs the same /alt-offer endpoint the app uses and unwraps altOffer', async () => {
    authFetch.mockResolvedValue({ altOffer: { available: true, redirectUrl: 'https://partner/x', provider: 'ympl', status: 'token_issued' } });
    const r = await requestAltOffer('app-1');
    expect(authFetch).toHaveBeenCalledWith('/api/applications/app-1/alt-offer', { method: 'POST' });
    expect(r.redirectUrl).toBe('https://partner/x');
  });
  it('records applied, with and without a lender', async () => {
    authFetch.mockResolvedValue({ applied: true, appliedAt: 'now', lender: null });
    await markAltOfferApplied('app-1');
    expect(authFetch).toHaveBeenLastCalledWith('/api/applications/app-1/alt-offer/applied', { method: 'POST', body: '{}' });
    await markAltOfferApplied('app-1', 'Some Lender');
    expect(authFetch).toHaveBeenLastCalledWith('/api/applications/app-1/alt-offer/applied', { method: 'POST', body: '{"lender":"Some Lender"}' });
  });
});
