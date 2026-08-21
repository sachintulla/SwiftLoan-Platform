import {
  _reducer, initialState, parentScreen, PREV_MAP, AppState,
  CANONICAL_FUNNEL_EVENTS, TELEMETRY_ONLY_FUNNEL_EVENTS, FUNNEL_EVENTS_FOR_TESTS,
} from '../src/state/store';

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
  // These encoded an older application flow (home → basic → basicpan → finding). The
  // app now collects PAN first and has a `moredetails` step, so the real forward path is
  //
  //   home → basicpan → basic → moredetails → finding → offers
  //
  // as traced from the actual `go()` calls in those screens. PREV was correct and the
  // expectations were stale, so the expectations are what changed here.
  const cases: [string, string][] = [
    ['basicpan', 'home'],
    ['basic', 'basicpan'],
    ['moredetails', 'basic'],
    ['finding', 'moredetails'],
    // Deliberately 'home', not 'finding': `finding` is the auto-advancing "looking for
    // offers" spinner, so sending Back into it would bounce the user straight forward
    // again. Offers is also reachable directly from home and basicpan.
    ['offers', 'home'],
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

// ─────────────────────────────────────────────────────────────────────────────
// The funnel-event names are a contract with the backend: the server translates
// each one into a JourneyEvent (server/src/lib/appEventMap.ts), and the customer
// 360 view, the stage machine and every stall rule read those journey events.
//
// A name that is not in that map produces telemetry only — silently invisible to
// the funnel. That failure mode has already bitten once: three of six stall rules
// were unable to fire because the app's names never reached the journey layer.
// This guards the reverse direction (an app-side rename or a new screen), and the
// server has the matching assertion in appEventMap.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
describe('funnel events stay in the canonical vocabulary', () => {
  const known = new Set<string>([
    ...CANONICAL_FUNNEL_EVENTS,
    ...TELEMETRY_ONLY_FUNNEL_EVENTS,
  ]);

  it('every screen mapping is either canonical or explicitly telemetry-only', () => {
    const unknown = Object.entries(FUNNEL_EVENTS_FOR_TESTS)
      .filter(([, name]) => !known.has(String(name)))
      .map(([screen, name]) => `${screen} -> ${name}`);

    // If this fails, add the name to server/src/lib/appEventMap.ts AND to
    // CANONICAL_FUNNEL_EVENTS, or to TELEMETRY_ONLY_FUNNEL_EVENTS if it is not a
    // funnel step. Do not just add it here.
    expect(unknown).toEqual([]);
  });

  it('the two lists do not overlap', () => {
    const overlap = CANONICAL_FUNNEL_EVENTS.filter((n) =>
      (TELEMETRY_ONLY_FUNNEL_EVENTS as readonly string[]).includes(n),
    );
    expect(overlap).toEqual([]);
  });

  it('the funnel steps that drive the journey use canonical names', () => {
    // These four are what the 360 stage machine actually advances on from a handset.
    expect(FUNNEL_EVENTS_FOR_TESTS.basic).toBe('eligibility_started');
    expect(FUNNEL_EVENTS_FOR_TESTS.offers).toBe('offer_viewed');
    expect(FUNNEL_EVENTS_FOR_TESTS.handoff).toBe('offer_selected');
    expect(FUNNEL_EVENTS_FOR_TESTS.status).toBe('application_submitted');
  });

  it('a single KYC document does not report KYC complete', () => {
    // Mapping any of these to kyc_completed would satisfy the "KYC started but never
    // finished" rule and hide exactly the customer it exists to catch.
    for (const screen of ['aadhaar', 'panv', 'bankv', 'selfie'] as const) {
      expect(FUNNEL_EVENTS_FOR_TESTS[screen]).toBe('kyc_submitted');
    }
  });
});
