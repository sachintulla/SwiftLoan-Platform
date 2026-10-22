// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetUpshotForTests,
  buildUpshotProfile,
  knownOfferInfo,
  markUpshotReady,
  rememberOffers,
  toE164,
  upshotEvent,
  upshotIdentify,
  upshotIdentifyServerUser,
  upshotLogout,
  upshotOfferSelected,
  upshotOffersFetched,
  upshotOfferViewed,
  upshotPageView,
  upshotPanVerified,
  upshotRouteFunnel,
  upshotScreenLabel,
  toUpshotAttribution,
  currentUpshotStage,
  UPSHOT_STAGES,
  UPSHOT_STAGE_FOR_ROUTE,
} from './upshot';

/** The only methods the real v1.4 bundle exposes for these jobs (checked against `window.upshot`). */
function installSdk() {
  const sdk = {
    init: vi.fn(),
    createEvent: vi.fn(),
    createEventByName: vi.fn(),
    updateUserProfile: vi.fn(),
  };
  (window as unknown as { upshot: typeof sdk }).upshot = sdk;
  return sdk;
}

beforeEach(() => {
  __resetUpshotForTests();
  delete (window as unknown as { upshot?: unknown }).upshot;
  delete (window as unknown as { __upshotReady?: unknown }).__upshotReady;
});

describe('toE164', () => {
  it('normalises Indian numbers to +91XXXXXXXXXX', () => {
    expect(toE164('9876543210')).toBe('+919876543210');
    expect(toE164('098765 43210')).toBe('+919876543210');
    expect(toE164('+919876543210')).toBe('+919876543210');
  });
  it('rejects too-short or empty input rather than sending a bad key', () => {
    expect(toE164('12345')).toBeUndefined();
    expect(toE164('')).toBeUndefined();
    expect(toE164(null)).toBeUndefined();
  });
});

describe('buildUpshotProfile', () => {
  it('uses the SDK\'s exact key names (lower-case appuid/city/country, firstName, userName…)', () => {
    const p = buildUpshotProfile({ userId: 'u-1', phone: '9876543210', name: 'Asha Rao Kumar', email: 'a@b.in' });
    expect(p).toMatchObject({
      appuid: 'u-1',
      firstName: 'Asha',
      lastName: 'Rao Kumar',
      userName: 'Asha Rao Kumar',
      email: 'a@b.in',
      phone: '+919876543210',
      location: { country: 'India' },
      Platform: 'Web',
    });
    // The old keys silently became custom attributes and left name/contact blank.
    for (const bad of ['Name', 'Email', 'Phone', 'City', 'Country', 'appuID', 'city', 'country']) expect(p).not.toHaveProperty(bad);
  });

  it('keys an anonymous lead by phone, and the logged-in user by server id (matching mobile)', () => {
    expect(buildUpshotProfile({ phone: '9876543210' }).appuid).toBe('+919876543210');
    expect(buildUpshotProfile({ userId: 'u-1', phone: '9876543210' }).appuid).toBe('u-1');
  });

  it('omits fields it does not have instead of sending undefined', () => {
    const p = buildUpshotProfile({ userId: 'u-1' });
    expect(Object.values(p).every((v) => v !== undefined)).toBe(true);
    expect(p).not.toHaveProperty('phone');
    expect(p).not.toHaveProperty('firstName');
  });
});

describe('screen labels', () => {
  it('shares the mobile funnel names and labels loan detail routes', () => {
    expect(upshotScreenLabel('/apply/step-1')).toBe('PAN Verification Step 1');
    expect(upshotScreenLabel('/apply/step-2')).toBe('Basic Details Step 2');
    expect(upshotScreenLabel('/apply/step-3')).toBe('More Details Step 3');
    expect(upshotScreenLabel('/apply/finding')).toBe('Finding Loader');
    expect(upshotScreenLabel('/apply/offers')).toBe('My Offers');
    expect(upshotScreenLabel('/apply/compare')).toBe('Compare Offers');
    expect(upshotScreenLabel('/account')).toBe('My Loans');
    expect(upshotScreenLabel('/account/3f2a-uuid')).toBe('Loan Details');
    expect(upshotScreenLabel('/apply/')).toBe('Get Started');
    expect(upshotScreenLabel('/something/new')).toBe('/something/new');
  });
});

describe('queueing and the real SDK API', () => {
  it('holds calls made before init and flushes them in order when ready', () => {
    const sdk = installSdk();
    upshotPageView('/');
    upshotEvent('website_visit', { page: '/' });
    expect(sdk.createEventByName).not.toHaveBeenCalled();

    markUpshotReady();
    // Exactly the documented call: the page NAME is the 2nd argument.
    expect(sdk.createEvent).toHaveBeenCalledWith('UpshotEventPageView', 'Website Home');
    expect(sdk.createEventByName).toHaveBeenCalledWith('website_visit', { platform: 'Web', page: '/' }, false);
  });

  it('calls createEventByName / updateUserProfile — never the non-existent createCustomEvent/setUserProfile', () => {
    const sdk = installSdk();
    const wrong = { createCustomEvent: vi.fn(), createPageViewEvent: vi.fn(), setUserProfile: vi.fn() };
    Object.assign(sdk, wrong);
    markUpshotReady();
    upshotEvent('otp_requested');
    upshotPageView('/apply');
    upshotIdentify({ userId: 'u-1', phone: '9876543210' });
    expect(sdk.createEventByName).toHaveBeenCalledTimes(1);
    expect(sdk.createEvent).toHaveBeenCalledTimes(1);
    // identify + the current step (the page view above put the visitor on 'Mobile Number')
    expect(sdk.updateUserProfile).toHaveBeenCalledTimes(2);
    for (const fn of Object.values(wrong)) expect(fn).not.toHaveBeenCalled();
  });

  it('never throws, even if the SDK throws or is missing', () => {
    const sdk = installSdk();
    sdk.createEventByName.mockImplementation(() => {
      throw new Error('boom');
    });
    markUpshotReady();
    expect(() => upshotEvent('x')).not.toThrow();
    delete (window as unknown as { upshot?: unknown }).upshot;
    expect(() => upshotEvent('x')).not.toThrow();
  });

  it('strips undefined attributes so Upshot never infers a type from a null', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotEvent('pan_verified', { source: 'aurix', aadhaarLinked: undefined });
    expect(sdk.createEventByName).toHaveBeenCalledWith('pan_verified', { platform: 'Web', source: 'aurix' }, false);
  });

  it('does not report dev / brand routes', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotPageView('/dev/upshot');
    upshotPageView('/brand');
    expect(sdk.createEvent).not.toHaveBeenCalled();
    expect(sdk.createEventByName).not.toHaveBeenCalled();
  });

  it('bounds the pre-init queue', () => {
    const sdk = installSdk();
    for (let i = 0; i < 200; i++) upshotEvent(`e${i}`);
    markUpshotReady();
    expect(sdk.createEventByName.mock.calls.length).toBe(50);
  });
});

describe('identity', () => {
  it('re-sends only when the profile changed (many pages re-fetch the user)', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotIdentifyServerUser({ id: 'u-1', phone: '9876543210', fullName: null, email: null });
    upshotIdentifyServerUser({ id: 'u-1', phone: '9876543210', fullName: null, email: null });
    expect(sdk.updateUserProfile).toHaveBeenCalledTimes(1);
    upshotIdentifyServerUser({ id: 'u-1', phone: '9876543210', fullName: 'Asha Rao', email: null });
    expect(sdk.updateUserProfile).toHaveBeenCalledTimes(2);
  });

  it('shares only id, phone, name and email from the server user — no PAN, DOB, address or city', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotIdentifyServerUser({
      id: 'u-1',
      phone: '9876543210',
      fullName: 'Asha Rao',
      email: 'a@b.in',
      panNumber: 'ABCDE1234F',
      dob: '1990-01-01',
      city: 'Pune',
      addressLine1: '12 MG Road',
      pincode: '411001',
    });
    const sent = JSON.stringify(sdk.updateUserProfile.mock.calls[0]![0]);
    for (const secret of ['ABCDE1234F', '1990-01-01', 'Pune', 'MG Road', '411001']) expect(sent).not.toContain(secret);
  });

  it('logout clears appuid (documented) and never calls disableUser, so the same user can log straight back in', () => {
    const sdk = installSdk();
    const disableUser = vi.fn();
    Object.assign(sdk, { disableUser });
    markUpshotReady();
    upshotIdentifyServerUser({ id: 'u-1', phone: '9876543210' });
    upshotLogout();
    expect(sdk.updateUserProfile).toHaveBeenLastCalledWith({ appuid: '' }, expect.any(Function));
    expect(disableUser).not.toHaveBeenCalled();
    upshotIdentifyServerUser({ id: 'u-1', phone: '9876543210' });
    expect(sdk.updateUserProfile).toHaveBeenCalledTimes(3); // identify, logout, identify again
  });

  it('ignores a user with no id', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotIdentifyServerUser(undefined);
    upshotIdentifyServerUser({ phone: '9876543210' });
    expect(sdk.updateUserProfile).not.toHaveBeenCalled();
  });
});

describe('funnel events', () => {
  const offers = [
    { id: 'o1', amount: 500000, apr: 12.5, tenureMonths: 36, lenderName: 'Aditya Finance' },
    { id: 'o2', amount: 300000, apr: 10.49, tenureMonths: 24, partner: { name: 'Axis Finance' } },
  ];

  it('eligibility_completed + offers_got mirror the mobile attributes', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotOffersFetched(offers);
    const calls = sdk.createEventByName.mock.calls.map((c) => [c[0], c[1]]);
    expect(calls).toContainEqual(['eligibility_completed', { platform: 'Web', offerCount: 2 }]);
    expect(calls).toContainEqual([
      'offers_got',
      { platform: 'Web', offerCount: 2, bestApr: 10.49, maxAmount: 500000, lenders: 'Aditya Finance, Axis Finance', topLender: 'Axis Finance' },
    ]);
  });

  it('zero offers still reports eligibility_completed but not offers_got', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotOffersFetched([]);
    const names = sdk.createEventByName.mock.calls.map((c) => c[0]);
    expect(names).toEqual(['eligibility_completed']);
  });

  it('offer_viewed waits for offers when the page opens first', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotOfferViewed();
    expect(sdk.createEventByName).not.toHaveBeenCalled();
    rememberOffers(offers);
    expect(sdk.createEventByName).toHaveBeenCalledWith('offer_viewed', { platform: 'Web', offerCount: 2, bestApr: 10.49 }, false);
  });

  it('offer_selected carries the chosen offer\'s real values', () => {
    const sdk = installSdk();
    markUpshotReady();
    rememberOffers(offers);
    upshotOfferSelected('o1');
    expect(sdk.createEventByName).toHaveBeenCalledWith(
      'offer_selected',
      { platform: 'Web', apr: 12.5, amount: 500000, tenureMonths: 36, partner: 'Aditya Finance' },
      false,
    );
    expect(knownOfferInfo('o2')).toEqual({ amount: 300000, partner: 'Axis Finance' });
  });

  it('pan_verified never carries the PAN and is skipped when not verified', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotPanVerified({ verified: false });
    expect(sdk.createEventByName).not.toHaveBeenCalled();
    upshotPanVerified({ verified: true, source: 'cache', aadhaarLinked: true, ...({ pan: 'ABCDE1234F' } as object) });
    expect(sdk.createEventByName).toHaveBeenCalledWith('pan_verified', { platform: 'Web', source: 'cache', aadhaarLinked: true }, false);
  });

  it('routes drive offer_viewed and application_submitted', () => {
    const sdk = installSdk();
    markUpshotReady();
    rememberOffers(offers);
    upshotRouteFunnel('/apply/offers');
    upshotRouteFunnel('/apply/success', { id: 'o1', amount: 500000 });
    upshotRouteFunnel('/apply/step-1');
    const names = sdk.createEventByName.mock.calls.map((c) => c[0]);
    expect(names).toEqual(['offer_viewed', 'application_submitted']);
    expect(sdk.createEventByName).toHaveBeenLastCalledWith(
      'application_submitted',
      { platform: 'Web', amount: 500000, product: 'Personal Loan' },
      false,
    );
  });
});

describe('toUpshotAttribution', () => {
  it('renames utm_* to the camelCase keys website_visit uses, so one concept is one attribute', () => {
    expect(
      toUpshotAttribution({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'diwali', utm_term: 'loan', utm_content: 'a', campaignId: 'c1' }),
    ).toEqual({ utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'diwali', utmTerm: 'loan', utmContent: 'a', campaignId: 'c1' });
  });

  it('sends the referrer as host only, and drops ad click ids and junk', () => {
    const out = toUpshotAttribution({ referrer: 'https://www.google.com/search?q=loan&x=1', gclid: 'abc', fbclid: 'def' });
    expect(out).toEqual({ referrer: 'www.google.com' });
    expect(toUpshotAttribution({ referrer: 'not a url' })).toEqual({});
  });

  it('is empty for nothing', () => {
    expect(toUpshotAttribution(undefined)).toEqual({});
    expect(toUpshotAttribution({})).toEqual({});
  });
});

describe('stage (the present step)', () => {
  it('is set by the journey pages, and every event after carries it', () => {
    const sdk = installSdk();
    markUpshotReady();
    expect(currentUpshotStage()).toBeNull();
    upshotPageView('/apply/step-1');
    expect(currentUpshotStage()).toBe('Pan Verification');
    upshotEvent('pan_verified', { source: 'aurix' });
    expect(sdk.createEventByName).toHaveBeenLastCalledWith(
      'pan_verified',
      { platform: 'Web', stage: 'Pan Verification', source: 'aurix' },
      false,
    );
  });

  it('follows the user step by step through the whole journey', () => {
    installSdk();
    markUpshotReady();
    const seen: Array<string | null> = [];
    for (const route of ['/apply', '/apply/verify', '/apply/step-1', '/apply/step-2', '/apply/step-3', '/apply/finding', '/apply/offers', '/apply/compare', '/apply/lender', '/apply/success']) {
      upshotPageView(route);
      seen.push(currentUpshotStage());
    }
    expect(seen).toEqual([
      'Mobile Number', 'Otp Verification', 'Pan Verification', 'Basic Details', 'More Details',
      'Finding Offers', 'Offers', 'Compare Offers', 'Lender Application', 'Application Submitted',
    ]);
  });

  it('pages outside the loan journey leave it unchanged (it stays the last step reached)', () => {
    installSdk();
    markUpshotReady();
    upshotPageView('/apply/step-2');
    upshotPageView('/faqs');
    upshotPageView('/privacy-policy');
    upshotPageView('/');
    expect(currentUpshotStage()).toBe('Basic Details');
  });

  it('requesting an OTP moves the user on to Otp Verification, AFTER the event itself', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotPageView('/apply');
    upshotEvent('otp_requested', { screen: 'apply' });
    expect(sdk.createEventByName).toHaveBeenLastCalledWith('otp_requested', { platform: 'Web', stage: 'Mobile Number', screen: 'apply' }, false);
    expect(currentUpshotStage()).toBe('Otp Verification');
  });

  it('a caller-provided stage wins', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotPageView('/apply/step-1');
    upshotEvent('custom_thing', { stage: 'Something Else' });
    expect(sdk.createEventByName).toHaveBeenLastCalledWith('custom_thing', { platform: 'Web', stage: 'Something Else' }, false);
  });

  it('is kept on the user profile as it changes — but only once there is a profile', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotPageView('/apply/verify'); // anonymous: nothing to attach it to
    expect(sdk.updateUserProfile).not.toHaveBeenCalled();

    upshotIdentifyServerUser({ id: 'u-1', phone: '9876543210' }); // identify, then the current step
    expect(sdk.updateUserProfile).toHaveBeenNthCalledWith(2, { stage: 'Otp Verification' }, expect.any(Function));

    upshotPageView('/apply/step-1');
    expect(sdk.updateUserProfile).toHaveBeenLastCalledWith({ stage: 'Pan Verification' }, expect.any(Function));
    upshotPageView('/apply/step-1'); // unchanged: no repeat
    expect(sdk.updateUserProfile).toHaveBeenCalledTimes(3);
  });

  it('logout forgets the step and the profile, so the next person starts clean', () => {
    const sdk = installSdk();
    markUpshotReady();
    upshotIdentifyServerUser({ id: 'u-1', phone: '9876543210' });
    upshotPageView('/apply/offers');
    upshotLogout();
    expect(currentUpshotStage()).toBeNull();
    sdk.updateUserProfile.mockClear();
    upshotPageView('/apply/step-1'); // anonymous again: no profile push
    expect(sdk.updateUserProfile).not.toHaveBeenCalled();
  });

  it('every stage a route maps to is in the shared vocabulary, in Title Case', () => {
    for (const stage of Object.values(UPSHOT_STAGE_FOR_ROUTE)) {
      expect(UPSHOT_STAGES).toContain(stage);
      expect(stage).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)*$/);
    }
  });
});
