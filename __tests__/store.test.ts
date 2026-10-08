import { _reducer, initialState, parentScreen, PREV_MAP, AppState, resolveScreenName } from '../src/state/store';
import { setTokens } from '../src/api/client';

describe('UC-N7 agent screen-name resolution (bug: "My Loan" opened Repayment)', () => {
  const cases: [string, string | null][] = [
    ['My Loan', 'loans'],
    ['My Loans', 'loans'],
    ['my loans', 'loans'],
    ['Repayment Overview', 'repay'],
    ['repayment', 'repay'],
    ['repay', 'repay'],
    ['My Offers', 'fare'],
    ['Home', 'home'],
    ['dashboard', 'home'],
    ['profile', 'profile'],
    ['loans', 'loans'],       // exact id still resolves
    ['offers', 'fare'],       // spoken "offers" = My Offers, never the retired legacy screen
    ['apply', 'basicpan'],    // spoken "apply" = the application funnel, not the dead `apply` route
    ['Apply for a loan', 'basicpan'],
    ['compare offers', 'compare'],
    ['basic', 'basic'],       // other exact ids unaffected
    ['finding', 'finding'],
    ['totally-unknown', null],
  ];
  it.each(cases)('%s → %s', (name, expected) => {
    expect(resolveScreenName(name)).toBe(expected);
  });
});

describe('UC-N1 initial screen', () => {
  it('starts on splash', () => {
    expect(initialState.screen).toBe('splash');
  });
});

describe('UC-N2 go() sets screen', () => {
  afterEach(() => setTokens(null));

  it('changes the active screen', () => {
    setTokens('fake-access-token');
    const s = _reducer(initialState, { type: 'go', screen: 'home' });
    expect(s.screen).toBe('home');
  });
});

describe('UC-N3 back-stack fallback (prevMap)', () => {
  // PREV is now only the fallback for back() when the real history stack is empty
  // (e.g. deep-linked entry). These assert the fallback parents match the map.
  const cases: [string, string][] = [
    ['basicpan', 'home'],
    ['basic', 'basicpan'],
    ['moredetails', 'basic'],
    ['finding', 'moredetails'],
    ['offers', 'home'],
    ['handoff', 'offers'],
    ['language', 'splash'],
    ['intro', 'language'],
    ['mobile', 'intro'],
    ['permissions', 'mobile'],
    ['aboutyou', 'permissions'],
    ['loans', 'home'],
    ['fare', 'home'],
  ];
  it.each(cases)('%s → %s', (screen, parent) => {
    expect(parentScreen(screen as any)).toBe(parent);
  });
});

describe('UC-N3b real back stack returns to actual origin', () => {
  // All of these exercise post-login screens (fare/basic/basicpan/...), so a
  // real session is needed now that guardScreen() also redirects an
  // unauthenticated go()/back() away from them (see the comment on
  // PRE_LOGIN_ONLY in store.ts) — these tests are about back-stack mechanics,
  // not auth, so a fake token just clears that gate out of the way.
  afterEach(() => setTokens(null));

  it('back() returns to where you came from, not a fixed parent', () => {
    setTokens('fake-access-token');
    // My Offers (fare) → Apply (basicpan): Back must return to fare, not home.
    let s = _reducer(initialState, { type: 'go', screen: 'fare' });
    s = _reducer(s, { type: 'go', screen: 'basicpan' });
    expect(s.screen).toBe('basicpan');
    s = _reducer(s, { type: 'back' });
    expect(s.screen).toBe('fare');
  });

  it('reaching the same screen from a different origin backs to that origin', () => {
    setTokens('fake-access-token');
    // Home → basicpan: Back returns to home (the real origin this time).
    let s = _reducer(initialState, { type: 'go', screen: 'home' });
    s = _reducer(s, { type: 'go', screen: 'basicpan' });
    s = _reducer(s, { type: 'back' });
    expect(s.screen).toBe('home');
  });

  it('a top-level tab resets the stack (acts as a root)', () => {
    setTokens('fake-access-token');
    let s = _reducer(initialState, { type: 'go', screen: 'fare' });
    s = _reducer(s, { type: 'go', screen: 'basicpan' });
    s = _reducer(s, { type: 'go', screen: 'home' }); // tab tap
    expect(s.history).toEqual([]);
  });

  it('Back from the offers result returns to the funnel origin, not the funnel', () => {
    setTokens('fake-access-token');
    // My Offers (fare) → apply funnel → offers: Back returns to fare, skipping
    // the whole funnel (details → optional → Verify PAN → finding), per offersReturn.
    let s: typeof initialState = { ...initialState, offersReturn: 'fare' };
    s = _reducer(s, { type: 'go', screen: 'fare' });
    s = _reducer(s, { type: 'go', screen: 'basicpan' });
    s = _reducer(s, { type: 'go', screen: 'basic' });
    s = _reducer(s, { type: 'go', screen: 'finding' });
    s = _reducer(s, { type: 'go', screen: 'offers' });
    s = _reducer(s, { type: 'back' });
    expect(s.screen).toBe('fare');
  });

  it('back() on an empty stack falls back to the PREV map', () => {
    setTokens('fake-access-token');
    const s = _reducer({ ...initialState, screen: 'basic', history: [] }, { type: 'back' });
    expect(s.screen).toBe(PREV_MAP.basic || 'home');
  });
});

describe('UC-N4 unknown parent defaults to home', () => {
  it('home has no parent → home', () => {
    expect(parentScreen('home')).toBe('home');
    expect(PREV_MAP.home).toBeUndefined();
  });
});

describe('UC-N5 set() merges partial state', () => {
  it('updates only given keys', () => {
    const s = _reducer(initialState, { type: 'set', patch: { mobileVal: '9999999999', terms: true } });
    expect(s.mobileVal).toBe('9999999999');
    expect(s.terms).toBe(true);
    expect(s.screen).toBe(initialState.screen);
    expect(s.fareAmount).toBe(initialState.fareAmount);
  });
});

describe('UC-N6 reset (logout) clears state, keeps consent/language, lands on login', () => {
  it('clears session state but returns to the login screen — not Privacy', () => {
    const dirty: AppState = {
      ...initialState,
      screen: 'home', mobileVal: '9999999999', terms: true,
      privacyAccepted: true, lang: 'te', selectedLang: 'telugu',
    };
    const s = _reducer(dirty, { type: 'reset' });
    // Goes to login, not splash→Privacy (bug #14).
    expect(s.screen).toBe('mobile');
    // Session/form state cleared…
    expect(s.mobileVal).toBe('');
    expect(s.terms).toBe(false);
    // …but device-level consent + language are preserved.
    expect(s.privacyAccepted).toBe(true);
    expect(s.lang).toBe('te');
    expect(s.selectedLang).toBe('telugu');
  });
});

describe('UC-N14 the login boundary is guarded in both directions', () => {
  // Bug: the voice agent's navigate_screen('language') — meant to change the
  // app's UI-copy language for a *guest* — dumped an already-authenticated
  // user back onto the onboarding language picker, because nothing stopped
  // go()/back() from crossing the login boundary the wrong way. Fixed both
  // directions (see the comment on PRE_LOGIN_ONLY/guardScreen in store.ts):
  // an authed user can't land back on onboarding, and an unauthenticated one
  // can't reach a post-login screen (profile/home/basicpan/fare/...) either
  // — confirmed live as a real gap when a pre-login "change the app language"
  // request sent the voice agent straight to `profile` with no session.
  afterEach(() => setTokens(null));

  it('go() redirects a pre-login screen to home once a session exists', () => {
    setTokens('fake-access-token');
    const s = _reducer({ ...initialState, screen: 'profile' }, { type: 'go', screen: 'language' });
    expect(s.screen).toBe('home');
  });

  it('go() still allows the pre-login screen with no session', () => {
    const s = _reducer(initialState, { type: 'go', screen: 'language' });
    expect(s.screen).toBe('language');
  });

  it('go() redirects a post-login screen to mobile with no session', () => {
    const s = _reducer(initialState, { type: 'go', screen: 'profile' });
    expect(s.screen).toBe('mobile');
  });

  it('go() still allows the post-login screen once a session exists', () => {
    setTokens('fake-access-token');
    const s = _reducer(initialState, { type: 'go', screen: 'profile' });
    expect(s.screen).toBe('profile');
  });

  it('back() redirects too — a stale pre-login entry on the stack cannot resurface after login', () => {
    setTokens('fake-access-token');
    const withStaleHistory: AppState = { ...initialState, screen: 'profile', history: ['splash', 'language', 'intro', 'mobile'] };
    const s = _reducer(withStaleHistory, { type: 'back' });
    expect(s.screen).toBe('home');
  });

  it('back() from permissions stays put after login — it must not skip About You via the guard', () => {
    setTokens('fake-access-token');
    const s = _reducer({ ...initialState, screen: 'permissions', history: ['mobile'] }, { type: 'back' });
    expect(s.screen).toBe('permissions');
  });

  it('go() carries one-shot results across exactly one navigation, then drops them', () => {
    setTokens('fake-access-token');
    const withResult: AppState = { ...initialState, screen: 'handoff', apiContext: { handoffResult: { id: 'L1' }, other: 1 } };
    const a = _reducer(withResult, { type: 'go', screen: 'disbursed' });
    expect(a.apiContext.handoffResult).toEqual({ id: 'L1' });
    expect(a.apiContext.other).toBeUndefined();
    const b = _reducer(a, { type: 'go', screen: 'loans' });
    expect(b.apiContext.handoffResult).toBeUndefined();
  });

  it('go() carries the last toast across one navigation so a toast + navigate is not lost', () => {
    setTokens('fake-access-token');
    const withToast: AppState = { ...initialState, screen: 'offers', apiContext: { lastToast: { message: 'Already applied', at: 1 } } };
    const a = _reducer(withToast, { type: 'go', screen: 'status' });
    expect(a.apiContext.lastToast).toEqual({ message: 'Already applied', at: 1 });
    expect(_reducer(a, { type: 'go', screen: 'loans' }).apiContext.lastToast).toBeUndefined();
  });

  it('privacy stays reachable with a restored session (consent gate must not be skipped)', () => {
    setTokens('fake-access-token');
    const s = _reducer(initialState, { type: 'go', screen: 'privacy' });
    expect(s.screen).toBe('privacy');
  });
});
