// Upshot funnel events + platform label (see src/analytics/upshot.ts, src/api/client.ts).
// The analytics module is mocked in the client tests so we assert exactly what the
// API layer reports, and the wrapper is tested separately against a fake SDK.

const mockRes = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

const offers = [
  { id: 'o1', apr: 14.5, amount: 300000, lenderName: 'IDFC', offerType: 'Pre-approved', offerLikelihood: 'High', partner: { name: 'IDFC First' }, emiOptions: [{ id: 'e1', tenureMonths: 24, recommended: true }, { id: 'e2', tenureMonths: 36, recommended: false }] },
  { id: 'o2', apr: 11.2, amount: 500000, partner: { name: 'Prefr' }, emiOptions: [] },
];

describe('API-layer Upshot funnel events', () => {
  let upshotEvent: jest.Mock;
  let api: any;
  let client: any;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../src/analytics/upshot', () => ({ upshotEvent: jest.fn() }));
    upshotEvent = require('../src/analytics/upshot').upshotEvent;
    client = require('../src/api/client');
    api = client.api;
  });
  afterEach(() => { jest.dontMock('../src/analytics/upshot'); });

  it('otp_requested fires after a successful OTP request only', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ ok: true }));
    await api.requestOtp('9999999999');
    expect(upshotEvent).toHaveBeenCalledWith('otp_requested', { screen: 'mobile' });

    upshotEvent.mockClear();
    (globalThis as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'err', json: async () => ({}) });
    await expect(api.requestOtp('9999999999')).rejects.toBeTruthy();
    expect(upshotEvent).not.toHaveBeenCalled();
  });

  it('eligibility_completed reports the offer count from prequalify', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ offers }));
    await api.prequalify('app1');
    expect(upshotEvent).toHaveBeenCalledWith('eligibility_completed', { offerCount: 2 });
  });

  it('offer_viewed carries count + best APR, immediately when offers are known', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ offers }));
    await api.prequalify('app1');
    upshotEvent.mockClear();
    client.upshotOfferViewed();
    expect(upshotEvent).toHaveBeenCalledWith('offer_viewed', { offerCount: 2, bestApr: 11.2 });
  });

  it('offer_viewed waits for offers to load when the screen opens first', async () => {
    client.upshotOfferViewed();
    expect(upshotEvent).not.toHaveBeenCalled();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ application: { offers } }));
    await api.getApplication('app1');
    expect(upshotEvent).toHaveBeenCalledWith('offer_viewed', { offerCount: 2, bestApr: 11.2 });
  });

  it('offer_selected has apr/amount/tenure/partner; duplicates are not re-reported', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ offers }));
    await api.prequalify('app1');
    upshotEvent.mockClear();

    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ lenderApplicationId: 'l1' }));
    await api.applyOffer('app1', 'o1', 'e2');
    expect(upshotEvent).toHaveBeenCalledWith('offer_selected', { apr: 14.5, amount: 300000, tenureMonths: 36, partner: 'IDFC', offerType: 'Pre-approved', offerLikelihood: 'High' });

    upshotEvent.mockClear();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ duplicate: true }));
    await api.applyOffer('app1', 'o1', 'e2');
    expect(upshotEvent).not.toHaveBeenCalled();
  });

  it("'Offers Got' fires only when prequalify actually returns offers", async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ offers }));
    await api.prequalify('app1');
    expect(upshotEvent).toHaveBeenCalledWith('Offers Got', {
      offerCount: 2, bestApr: 11.2, maxAmount: 500000, lenders: 'IDFC, Prefr', topLender: 'Prefr',
    });

    upshotEvent.mockClear();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ offers: [] }));
    await api.prequalify('app2');
    expect(upshotEvent).toHaveBeenCalledWith('eligibility_completed', { offerCount: 0 });
    expect(upshotEvent).not.toHaveBeenCalledWith('Offers Got', expect.anything());
  });

  it("'PAN Verified' fires for a verified PAN, never carries the PAN, and not for an invalid one", async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ data: { status: 'verified', verified: true, aadhaarLinked: true, prefill: {}, source: 'aurix' } }));
    await api.verifyPan('ABCDE1234F');
    expect(upshotEvent).toHaveBeenCalledWith('PAN Verified', { source: 'aurix', aadhaarLinked: true });
    expect(JSON.stringify(upshotEvent.mock.calls)).not.toContain('ABCDE1234F');

    upshotEvent.mockClear();
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ data: { status: 'invalid', verified: false, aadhaarLinked: null, prefill: {}, source: 'aurix' } }));
    await api.verifyPan('ABCDE1234F');
    expect(upshotEvent).not.toHaveBeenCalled();
  });

  it('knownOfferInfo returns the amount and partner of a seen offer', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(mockRes({ offers }));
    await api.prequalify('app1');
    expect(client.knownOfferInfo('o2')).toEqual({ amount: 500000, partner: 'Prefr' });
    expect(client.knownOfferInfo('nope')).toEqual({});
    expect(client.knownOfferInfo(null)).toEqual({});
  });
});

describe('Upshot wrapper platform label', () => {
  const profileFor = (os: 'ios' | 'android', user: Record<string, unknown> = { userId: 'u1', phone: '9999999999' }) => {
    let sent: any;
    jest.resetModules();
    jest.doMock('react-native', () => {
      const rn = jest.requireActual('react-native');
      return Object.setPrototypeOf({ Platform: { ...rn.Platform, OS: os }, NativeModules: { ...rn.NativeModules, UpshotReact: {} } }, rn);
    });
    jest.doMock('react-native-upshotsdk', () => ({
      default: {
        initializeUpshotUsingOptions: jest.fn(), addListener: jest.fn(), setDispatchInterval: jest.fn(),
        setUserProfile: (json: string) => { sent = JSON.parse(json); },
      },
    }), { virtual: true });
    const up = require('../src/analytics/upshot');
    expect(up.initUpshot()).toBe(true);
    up.upshotIdentify(user);
    jest.dontMock('react-native');
    jest.dontMock('react-native-upshotsdk');
    return { sent, up };
  };

  it('profiles iPhones as iOS and Android phones as Android', () => {
    expect(profileFor('ios').sent.Platform).toBe('iOS');
    expect(profileFor('android').sent.Platform).toBe('Android');
  });

  it('sends the exact key names the SDK maps (appuID, firstName, lastName, userName, email, phone)', () => {
    const { sent } = profileFor('android', { userId: 'u1', phone: '9999999999', name: 'Asha Rao Kumar', email: 'a@b.co' });
    expect(sent).toMatchObject({
      appuID: 'u1', firstName: 'Asha', lastName: 'Rao Kumar', userName: 'Asha Rao Kumar',
      email: 'a@b.co', phone: '+919999999999', Country: 'India', Platform: 'Android',
    });
    // The old capitalised / lowercase keys were stored as custom attributes only.
    expect(sent).not.toHaveProperty('appuid');
    expect(sent).not.toHaveProperty('Name');
    expect(sent).not.toHaveProperty('Phone');
    expect(sent).not.toHaveProperty('Email');
  });

  it('omits name fields when the name is not known yet (right after OTP)', () => {
    const { sent } = profileFor('ios', { userId: 'u1', phone: '9999999999' });
    expect(sent.appuID).toBe('u1');
    expect(sent).not.toHaveProperty('firstName');
    expect(sent).not.toHaveProperty('userName');
  });

  it('the dev event catalogue uses the same label', () => {
    const { up } = profileFor('ios');
    const opened = up.MOBILE_UPSHOT_EVENTS.find((e: any) => e.name === 'app_opened');
    expect(opened.attributes.platform).toBe('iOS');
  });
});

describe('Upshot screen names', () => {
  it('sends readable names for the renamed screens and the raw id for the rest', () => {
    jest.resetModules();
    const createPageViewEvent = jest.fn();
    jest.doMock('react-native', () => {
      const rn = jest.requireActual('react-native');
      return Object.setPrototypeOf({ Platform: { ...rn.Platform, OS: 'android' }, NativeModules: { ...rn.NativeModules, UpshotReact: {} } }, rn);
    });
    jest.doMock('react-native-upshotsdk', () => ({
      default: { initializeUpshotUsingOptions: jest.fn(), addListener: jest.fn(), setDispatchInterval: jest.fn(), createPageViewEvent },
    }), { virtual: true });
    const up = require('../src/analytics/upshot');
    up.initUpshot();
    const sent = (screen: string) => { createPageViewEvent.mockClear(); up.upshotScreen(screen); return createPageViewEvent.mock.calls[0][0]; };

    expect(sent('fare')).toBe('My Offers');
    expect(sent('loans')).toBe('My Loans');
    expect(sent('basicpan')).toBe('PAN Verification Step 1');
    expect(sent('basic')).toBe('Basic Details Step 2');
    expect(sent('moredetails')).toBe('More Details Step 3');
    expect(sent('finding')).toBe('Finding Loader');
    expect(sent('compare')).toBe('Compare Offers');
    expect(sent('home')).toBe('home');
    expect(sent('intro')).toBe('Get Started');
    // The launch logo screen is not reported at all.
    createPageViewEvent.mockClear();
    up.upshotScreen('splash');
    expect(createPageViewEvent).not.toHaveBeenCalled();
    jest.dontMock('react-native');
    jest.dontMock('react-native-upshotsdk');
  });
});

describe('Upshot production vs demo app', () => {
  const PROD = { appId: 'f8ac8f46-ba91-4d54-a8de-da4546e85fdb', ownerId: '6cfe2c70-4130-46d5-9202-54252d38e57f' };
  const DEMO = { appId: 'ce84173a-1e4b-4dcf-b1d3-8d9504cd0c50', ownerId: '6cfe2c70-4130-46d5-9202-54252d38e57f' };

  it('only a build pointed at the production API reports to the Production app', () => {
    const { isUpshotDemo } = require('../src/config/build');
    expect(isUpshotDemo('https://api.swiftloan.ai/api')).toBe(false);
    expect(isUpshotDemo('https://dev-api.swiftloan.ai/api')).toBe(true);
    expect(isUpshotDemo('http://localhost:4000/api')).toBe(true);
    expect(isUpshotDemo('http://172.18.5.221:4000/api')).toBe(true);
  });

  const initWith = (demo: boolean) => {
    jest.resetModules();
    const init = jest.fn();
    jest.doMock('react-native', () => {
      const rn = jest.requireActual('react-native');
      return Object.setPrototypeOf({ Platform: { ...rn.Platform, OS: 'ios' }, NativeModules: { ...rn.NativeModules, UpshotReact: {} } }, rn);
    });
    jest.doMock('react-native-upshotsdk', () => ({
      default: { initializeUpshotUsingOptions: init, addListener: jest.fn(), setDispatchInterval: jest.fn() },
    }), { virtual: true });
    jest.doMock('../src/config/build', () => ({ UPSHOT_DEMO: demo }));
    require('../src/analytics/upshot').initUpshot();
    jest.dontMock('react-native');
    jest.dontMock('react-native-upshotsdk');
    jest.dontMock('../src/config/build');
    return JSON.parse(init.mock.calls[0][0]);
  };

  it('initialises the SDK with the Production IDs in a production build', () => {
    const o = initWith(false);
    expect(o.bkApplicationID).toBe(PROD.appId);
    expect(o.bkApplicationOwnerID).toBe(PROD.ownerId);
  });

  it('initialises the SDK with the Demo IDs in a dev/local build', () => {
    const o = initWith(true);
    expect(o.bkApplicationID).toBe(DEMO.appId);
    expect(o.bkApplicationOwnerID).toBe(DEMO.ownerId);
  });
});
