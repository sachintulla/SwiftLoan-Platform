import { claimInstall, setTokens, trackEvent } from '../src/api/client';

// Regression: a fresh install has no session, and trackPost() used to drop every call without one except
// the old /track/install, so the first-launch /attribution/claim was never sent. No install was ever
// attributed and the "continue where you left off" pop-up could never appear. Other activity tracking
// must still be dropped while signed out.
describe('claimInstall without a session', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; setTokens(null); });

  it('sends the claim to /attribution/claim even though nobody is signed in', async () => {
    setTokens(null);
    const fetchMock = jest.fn().mockResolvedValue({ json: async () => ({ success: true, data: { matched: true, method: 'clipboard', download_id: 'd1', source: 'campaign', referral: null, resume: { token: 'AB12CD34', first_name: 'Priya', phone: '9876543210', last_step: 'pan_done' } } }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const claim = await claimInstall('ios', { clipboard: 'swiftloan-ref:TSTSIM00001', osVersion: '17.5' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/attribution\/claim$/);
    expect((init as RequestInit).headers).not.toHaveProperty('authorization');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ platform: 'ios', clipboard: 'swiftloan-ref:TSTSIM00001', install_referrer: null });
    expect(claim?.resume?.last_step).toBe('pan_done');
  });

  it('still drops ordinary activity tracking while signed out', async () => {
    setTokens(null);
    const fetchMock = jest.fn().mockResolvedValue({ json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    trackEvent('funnel', 'something', 'home');
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null (so the claim is retried next launch) when the server answers with a failure', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: false }) }) as unknown as typeof fetch;
    expect(await claimInstall('android', {})).toBeNull();
  });
});
