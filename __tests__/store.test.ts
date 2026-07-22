import { _reducer, initialState, parentScreen, PREV_MAP, AppState } from '../src/state/store';

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

describe('UC-N3 back-stack (prevMap)', () => {
  const cases: [string, string][] = [
    ['basic', 'home'],
    ['basicpan', 'basic'],
    ['finding', 'basicpan'],
    ['offers', 'basicpan'],
    ['handoff', 'offers'],
    ['aadhaar', 'kyc'],
    ['panv', 'kyc'],
    ['bankv', 'kyc'],
    ['selfie', 'kyc'],
    ['creditscore', 'repay'],
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

describe('UC-N6 reset returns to splash', () => {
  it('clears state and returns to splash', () => {
    const dirty: AppState = { ...initialState, screen: 'home', mobileVal: '9999999999', terms: true };
    const s = _reducer(dirty, { type: 'reset' });
    expect(s.screen).toBe('splash');
    expect(s.mobileVal).toBe('');
    expect(s.terms).toBe(false);
  });
});
