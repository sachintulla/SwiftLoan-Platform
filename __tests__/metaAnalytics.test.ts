// Meta SDK wrapper (src/analytics/meta.ts): off by default, funnel-only, no parameters.
export {}; // module scope, so `load` doesn't collide with other test scripts

const logEvent = jest.fn();
const settings = {
  setAppID: jest.fn(),
  setClientToken: jest.fn(),
  setAutoLogAppEventsEnabled: jest.fn(),
  setAdvertiserIDCollectionEnabled: jest.fn(),
  setAdvertiserTrackingEnabled: jest.fn().mockResolvedValue(false),
  initializeSDK: jest.fn(),
};

function load(opts: { token?: string; linked?: boolean; demo?: boolean; allowDemo?: boolean }) {
  jest.resetModules();
  jest.clearAllMocks();
  (globalThis as any).SWIFTLOAN_META_CLIENT_TOKEN = opts.token ?? '';
  (globalThis as any).SWIFTLOAN_META_ALLOW_DEMO = opts.allowDemo ?? false;
  jest.doMock('../src/config/build', () => ({ UPSHOT_DEMO: opts.demo ?? false }));
  jest.doMock('react-native', () => ({ NativeModules: opts.linked === false ? {} : { FBSettings: {} } }));
  jest.doMock('react-native-fbsdk-next', () => ({ Settings: settings, AppEventsLogger: { logEvent } }), { virtual: true });
  return require('../src/analytics/meta');
}

afterEach(() => {
  delete (globalThis as any).SWIFTLOAN_META_CLIENT_TOKEN;
  delete (globalThis as any).SWIFTLOAN_META_ALLOW_DEMO;
});

describe('Meta SDK wrapper', () => {
  it('is off without a client token', () => {
    const m = load({ token: '' });
    expect(m.META_CONFIGURED).toBe(false);
    expect(m.initMeta()).toBe(false);
    m.metaTrackFromAppEvent('otp_verified');
    expect(settings.initializeSDK).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('is off when the native module is not linked', () => {
    const m = load({ token: 'tok', linked: false });
    expect(m.initMeta()).toBe(false);
    expect(settings.initializeSDK).not.toHaveBeenCalled();
  });

  it('keeps demo/dev-backend builds out unless explicitly allowed', () => {
    expect(load({ token: 'tok', demo: true }).META_CONFIGURED).toBe(false);
    expect(load({ token: 'tok', demo: true, allowDemo: true }).META_CONFIGURED).toBe(true);
  });

  it('initialises with the app id + token and never enables ad-id collection or ATT tracking', () => {
    const m = load({ token: 'tok' });
    expect(m.initMeta()).toBe(true);
    expect(m.initMeta()).toBe(true); // idempotent
    expect(settings.initializeSDK).toHaveBeenCalledTimes(1);
    expect(settings.setAppID).toHaveBeenCalledWith('1669156655221818');
    expect(settings.setClientToken).toHaveBeenCalledWith('tok');
    expect(settings.setAdvertiserIDCollectionEnabled).toHaveBeenCalledWith(false);
    expect(settings.setAdvertiserTrackingEnabled).toHaveBeenCalledWith(false);
  });

  it('reports only the funnel moments, with no parameters', () => {
    const m = load({ token: 'tok' });
    m.initMeta();
    m.metaTrackFromAppEvent('otp_verified');
    m.metaTrackFromAppEvent('PAN Verified');
    m.metaTrackFromAppEvent('eligibility_completed');
    m.metaTrackFromAppEvent('Offers Got');
    m.metaTrackFromAppEvent('offer_viewed');
    m.metaTrackFromAppEvent('offer_selected');
    m.metaTrackFromAppEvent('application_submitted');
    m.metaTrackFromAppEvent('loan_disbursed');
    // anything else (language, app_opened, otp_requested, emi...) is never sent
    m.metaTrackFromAppEvent('language_selected');
    m.metaTrackFromAppEvent('app_opened');
    expect(logEvent.mock.calls).toEqual([
      ['fb_mobile_complete_registration'],
      ['IdentityVerified'],
      ['EligibilityCompleted'],
      ['OffersReceived'],
      ['fb_mobile_content_view'],
      ['fb_mobile_initiated_checkout'],
      ['SubmitApplication'],
      ['LoanDisbursed'],
    ]);
  });

  it('reports repeatable steps (offers, eligibility, identity, disbursal) once per launch', () => {
    const m = load({ token: 'tok' });
    m.initMeta();
    m.metaTrackFromAppEvent('offer_viewed');
    m.metaTrackFromAppEvent('offer_viewed');
    m.metaTrackFromAppEvent('eligibility_completed');
    m.metaTrackFromAppEvent('eligibility_completed');
    m.metaTrackFromAppEvent('offer_selected');
    m.metaTrackFromAppEvent('PAN Verified');
    m.metaTrackFromAppEvent('PAN Verified');
    m.metaTrackFromAppEvent('Offers Got');
    m.metaTrackFromAppEvent('Offers Got');
    m.metaTrackFromAppEvent('loan_disbursed');
    m.metaTrackFromAppEvent('loan_disbursed');
    m.metaTrackFromAppEvent('offer_selected'); // a real choice each time: not deduplicated
    expect(logEvent.mock.calls.map((c) => c[0])).toEqual([
      'fb_mobile_content_view',
      'EligibilityCompleted',
      'fb_mobile_initiated_checkout',
      'IdentityVerified',
      'OffersReceived',
      'LoanDisbursed',
      'fb_mobile_initiated_checkout',
    ]);
  });

  it('does not report before init', () => {
    const m = load({ token: 'tok' });
    m.metaTrackFromAppEvent('otp_verified');
    expect(logEvent).not.toHaveBeenCalled();
  });
});
