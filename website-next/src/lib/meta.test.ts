// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Pixel is configured for these tests (the real default is "off until an id is set").
vi.mock('@/config/meta', () => ({
  META_ENABLED: true,
  META_PIXEL_ID: '123456789',
  META_SDK_URL: 'https://connect.facebook.net/en_US/fbevents.js',
}));
vi.mock('@/lib/leads', () => ({ apiBase: () => 'https://api.test' }));
vi.mock('@/lib/session', () => ({ getAccessToken: () => null }));

import { META_CONSENT_KEY, META_EVENT_FOR, __resetMetaForTests, getMetaConsent, metaAllowed, metaTrackFromWebEvent, setMetaConsent } from './meta';

beforeEach(() => {
  __resetMetaForTests();
  window.localStorage.clear();
  delete (window as unknown as { fbq?: unknown }).fbq;
  document.head.innerHTML = '';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

describe('Meta consent gate', () => {
  it('sends nothing and loads nothing before the visitor answers', () => {
    expect(getMetaConsent()).toBeNull();
    expect(metaAllowed()).toBe(false);
    metaTrackFromWebEvent('website_lead_submitted');
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="fbevents"]')).toBeNull();
  });

  it('stays silent after a decline', () => {
    setMetaConsent('denied');
    metaTrackFromWebEvent('otp_verified');
    expect(window.localStorage.getItem(META_CONSENT_KEY)).toBe('denied');
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="fbevents"]')).toBeNull();
  });
});

describe('after consent', () => {
  it('loads the Pixel once and reports a funnel event to both Pixel and the server with one id', async () => {
    setMetaConsent('granted');
    expect(document.querySelectorAll('script[src*="fbevents"]').length).toBe(1);
    const fbq = vi.fn();
    (window as unknown as { fbq: unknown }).fbq = fbq;

    metaTrackFromWebEvent('application_submitted');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());

    const pixelCall = fbq.mock.calls.find((c) => c[0] === 'track');
    expect(pixelCall?.[1]).toBe('SubmitApplication');
    const eventId = pixelCall?.[3]?.eventID;
    expect(eventId).toBeTruthy();

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.test/api/meta/event');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ consent: true, eventName: 'SubmitApplication', eventId });
    // Nothing personal or financial travels with the event.
    const allowed = ['consent', 'eventId', 'eventName', 'eventSourceUrl', 'fbc', 'fbp'];
    expect(Object.keys(body).filter((k) => !allowed.includes(k))).toEqual([]);
  });

  it('ignores every event that is not one of the three funnel moments', () => {
    setMetaConsent('granted');
    metaTrackFromWebEvent('emi_calculated');
    metaTrackFromWebEvent('language_selected');
    metaTrackFromWebEvent('loan_disbursed'); // not observable from the browser; app-only
    expect(fetch).not.toHaveBeenCalled();
    expect(Object.values(META_EVENT_FOR).sort()).toEqual(
      [
        'CompleteRegistration', 'EligibilityCompleted', 'IdentityVerified', 'InitiateCheckout',
        'Lead', 'OffersReceived', 'SubmitApplication', 'ViewContent',
      ].sort(),
    );
  });

  it('maps the offers page to ViewContent and an offer choice to InitiateCheckout, with nothing else attached', async () => {
    setMetaConsent('granted');
    const fbq = vi.fn();
    (window as unknown as { fbq: unknown }).fbq = fbq;
    metaTrackFromWebEvent('offer_viewed');
    metaTrackFromWebEvent('offer_selected');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const tracked = fbq.mock.calls.filter((c) => c[0] === 'track').map((c) => c[1]);
    expect(tracked).toEqual(['ViewContent', 'InitiateCheckout']);
    for (const c of (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      const body = JSON.parse(c[1].body);
      expect(Object.keys(body).filter((k) => !['consent', 'eventId', 'eventName', 'eventSourceUrl', 'fbc', 'fbp'].includes(k))).toEqual([]);
    }
  });

  it('reports offers-viewed and eligibility only once per page session', async () => {
    setMetaConsent('granted');
    (window as unknown as { fbq: unknown }).fbq = vi.fn();
    metaTrackFromWebEvent('offer_viewed');
    metaTrackFromWebEvent('offer_viewed');
    metaTrackFromWebEvent('eligibility_completed');
    metaTrackFromWebEvent('eligibility_completed');
    metaTrackFromWebEvent('pan_verified');
    metaTrackFromWebEvent('pan_verified');
    metaTrackFromWebEvent('offers_got');
    metaTrackFromWebEvent('offers_got');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await new Promise((r) => setTimeout(r, 30));
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
