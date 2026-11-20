import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setTokens, isAuthed, getSessionId, getTokens, trackSessionStart, knownOfferInfo } from '../src/api/client';
import { saveOffersCache, loadOffersCache, savePrefillDraft, loadPrefillDraft, markIntroPitchHeard, loadIntroPitchHeard, loadTokens } from '../src/state/session';

// Regression (prod, 2026-11-20): deleting the account only reset the screens. The deleted
// account's tokens and tracking session id stayed on the phone, so the next person to sign in
// sent their activity under a session the server had already removed (foreign-key errors on
// every event). Logout and delete must leave the phone in the same clean state.
const ok = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

async function signInWithLeftovers(): Promise<void> {
  setTokens('access-1', 'refresh-1');
  globalThis.fetch = jest.fn().mockResolvedValue(ok({ data: { session_id: 'sess-1' } })) as unknown as typeof fetch;
  trackSessionStart({ platform: 'ios' });
  await new Promise<void>((r) => setImmediate(() => r()));
  expect(getSessionId()).toBe('sess-1');

  await saveOffersCache({ savedAt: Date.now(), applicationId: 'app-1', offers: [] } as never);
  await savePrefillDraft({ fullName: 'C S MURUGARAJ' });
  await markIntroPitchHeard();

  // the offers the app last saw for this account
  globalThis.fetch = jest.fn().mockResolvedValue(ok({ application: { id: 'app-1', offers: [{ id: 'offer-1', amount: 300000, lenderName: 'Lender A' }] } })) as unknown as typeof fetch;
  await api.getApplication('app-1');
  expect(knownOfferInfo('offer-1')).toEqual({ amount: 300000, partner: 'Lender A' });
}

async function expectPhoneIsClean(): Promise<void> {
  expect(isAuthed()).toBe(false);
  expect(getTokens()).toEqual({ accessToken: null, refreshToken: null });
  expect(getSessionId()).toBeNull();
  // let the fire-and-forget storage removals settle
  await new Promise<void>((r) => setImmediate(() => r()));
  expect(await loadTokens()).toBeNull();
  expect(await loadOffersCache()).toBeNull();
  expect(await loadPrefillDraft()).toBeNull();
  expect(await loadIntroPitchHeard()).toBe(false);
  expect(knownOfferInfo('offer-1')).toEqual({});
}

describe('what stays on the phone after the account is gone', () => {
  const realFetch = globalThis.fetch;
  beforeEach(async () => { await AsyncStorage.clear(); });
  afterEach(() => { globalThis.fetch = realFetch; setTokens(null, null); });

  it('delete account signs the phone out and clears everything kept for that account', async () => {
    await signInWithLeftovers();
    const fetchMock = jest.fn().mockResolvedValue(ok({ ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.deleteAccount();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/users\/me$/);
    expect((init as RequestInit).method).toBe('DELETE');
    await expectPhoneIsClean();
  });

  it('logout leaves the phone in the same clean state', async () => {
    await signInWithLeftovers();
    globalThis.fetch = jest.fn().mockResolvedValue(ok({ ok: true })) as unknown as typeof fetch;

    await api.logout();

    await expectPhoneIsClean();
  });

  it('a failed delete keeps the person signed in (nothing is cleared)', async () => {
    await signInWithLeftovers();
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({ error: 'boom' }) }) as unknown as typeof fetch;

    await expect(api.deleteAccount()).rejects.toBeTruthy();

    expect(isAuthed()).toBe(true);
    expect(getSessionId()).toBe('sess-1');
    expect(await loadPrefillDraft()).toEqual({ fullName: 'C S MURUGARAJ' });
  });
});
