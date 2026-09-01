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
  it('changes the active screen', () => {
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
    ['aadhaar', 'kyc'],
    ['panv', 'kyc'],
    ['bankv', 'kyc'],
    ['selfie', 'kyc'],
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
  it('back() returns to where you came from, not a fixed parent', () => {
    // My Offers (fare) → Apply (basicpan): Back must return to fare, not home.
    let s = _reducer(initialState, { type: 'go', screen: 'fare' });
    s = _reducer(s, { type: 'go', screen: 'basicpan' });
    expect(s.screen).toBe('basicpan');
    s = _reducer(s, { type: 'back' });
    expect(s.screen).toBe('fare');
  });

  it('reaching the same screen from a different origin backs to that origin', () => {
    // Home → basicpan: Back returns to home (the real origin this time).
    let s = _reducer(initialState, { type: 'go', screen: 'home' });
    s = _reducer(s, { type: 'go', screen: 'basicpan' });
    s = _reducer(s, { type: 'back' });
    expect(s.screen).toBe('home');
  });

  it('a top-level tab resets the stack (acts as a root)', () => {
    let s = _reducer(initialState, { type: 'go', screen: 'fare' });
    s = _reducer(s, { type: 'go', screen: 'basicpan' });
    s = _reducer(s, { type: 'go', screen: 'home' }); // tab tap
    expect(s.history).toEqual([]);
  });

  it('Back from the offers result returns to the funnel origin, not the funnel', () => {
    // My Offers (fare) → apply funnel → offers: Back returns to fare, skipping
    // the whole funnel (Verify PAN → details → finding), per offersReturn.
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

describe('UC-N14 onboarding screens are unreachable once logged in', () => {
  // Bug: the voice agent's navigate_screen('language') — meant to change the
  // app's UI-copy language for a *guest* — dumped an already-authenticated
  // user back onto the onboarding language picker, because nothing stopped
  // go()/back() from crossing the login boundary the wrong way. Only this
  // direction is guarded (see the comment on PRE_LOGIN_ONLY in store.ts) —
  // home/basicpan/fare etc. stay reachable without a session by design.
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

  it('back() redirects too — a stale pre-login entry on the stack cannot resurface after login', () => {
    setTokens('fake-access-token');
    const withStaleHistory: AppState = { ...initialState, screen: 'aboutyou', history: ['splash', 'language', 'intro', 'mobile', 'permissions'] };
    const s = _reducer(withStaleHistory, { type: 'back' });
    expect(s.screen).toBe('home');
  });
});
