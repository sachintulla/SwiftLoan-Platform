import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  META_EVENTS, isMetaEvent, metaCapiConfig, hashEmail, hashPhone, cleanFbCookie, buildMetaPayload, sendMetaEvent,
} from './metaCapi.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('Meta CAPI config', () => {
  it('is disabled unless both the pixel id and token are set', () => {
    expect(metaCapiConfig({} as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(metaCapiConfig({ META_PIXEL_ID: '1' } as unknown as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(metaCapiConfig({ META_PIXEL_ID: '1', META_CAPI_TOKEN: 't' } as unknown as NodeJS.ProcessEnv).enabled).toBe(true);
  });
  it('can be hard-disabled', () => {
    const env = { META_PIXEL_ID: '1', META_CAPI_TOKEN: 't', META_CAPI_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv;
    expect(metaCapiConfig(env).enabled).toBe(false);
  });
});

describe('event allow-list', () => {
  it('accepts only the coarse funnel events', () => {
    expect([...META_EVENTS]).toEqual(['Lead', 'CompleteRegistration', 'ViewContent', 'IdentityVerified', 'EligibilityCompleted', 'OffersReceived', 'InitiateCheckout', 'SubmitApplication']);
    expect(isMetaEvent('ViewContent')).toBe(true);
    expect(isMetaEvent('LoanDisbursed')).toBe(false); // app SDK only; the public web relay never carries it
    expect(isMetaEvent('Lead')).toBe(true);
    expect(isMetaEvent('Purchase')).toBe(false);
    expect(isMetaEvent('AddPaymentInfo')).toBe(false);
    expect(isMetaEvent(undefined)).toBe(false);
  });
});

describe('hashing follows the Meta spec', () => {
  it('lower-cases and trims email before hashing', () => {
    expect(hashEmail('  Priya@Example.COM ')).toBe(sha('priya@example.com'));
    expect(hashEmail('not-an-email')).toBeUndefined();
  });
  it('hashes digits-only phone with the country code', () => {
    expect(hashPhone('+91 98765 43210')).toBe(sha('919876543210'));
    expect(hashPhone('9876543210')).toBe(sha('919876543210'));
    expect(hashPhone('09876543210')).toBe(sha('919876543210'));
    expect(hashPhone('12345')).toBeUndefined();
  });
  it('only accepts well-formed _fbp/_fbc cookies', () => {
    expect(cleanFbCookie('fb.1.1700000000000.1234567890')).toBe('fb.1.1700000000000.1234567890');
    expect(cleanFbCookie('fb.1.1700000000000.AbCdEf_-gh')).toBeDefined();
    expect(cleanFbCookie('<script>')).toBeUndefined();
    expect(cleanFbCookie(42)).toBeUndefined();
  });
});

describe('payload', () => {
  it('never contains raw identifiers, and keeps the IP un-hashed', () => {
    const p = buildMetaPayload(
      {
        eventName: 'Lead', eventId: 'evt-12345678', phone: '+919876543210', email: 'a@b.co',
        userId: 'user-1', clientIp: '203.0.113.7', userAgent: 'UA', fbp: 'fb.1.1700000000000.1234567890',
        eventSourceUrl: 'https://swiftloan.ai/', eventTime: 1700000000,
      },
      { testEventCode: '' },
    );
    const json = JSON.stringify(p);
    expect(json).not.toContain('9876543210');
    expect(json).not.toContain('a@b.co');
    expect(json).not.toContain('user-1');
    const ev = p.data[0];
    expect(ev.event_name).toBe('Lead');
    expect(ev.event_id).toBe('evt-12345678');
    expect(ev.action_source).toBe('website');
    expect(ev.user_data.client_ip_address).toBe('203.0.113.7');
    expect(ev.user_data.ph).toEqual([sha('919876543210')]);
    expect(p).not.toHaveProperty('test_event_code');
  });
  it('adds the test event code when configured', () => {
    const p = buildMetaPayload({ eventName: 'Lead', eventId: 'evt-12345678' }, { testEventCode: 'TEST123' });
    expect(p.test_event_code).toBe('TEST123');
  });
});

describe('sendMetaEvent', () => {
  const cfg = { enabled: true, pixelId: '999', token: 'tok', graphVersion: 'v23.0', testEventCode: '' };
  it('does nothing when disabled', async () => {
    const f = vi.fn();
    expect(await sendMetaEvent({ eventName: 'Lead', eventId: 'evt-12345678' }, { ...cfg, enabled: false }, f as never)).toEqual({ sent: false, reason: 'disabled' });
    expect(f).not.toHaveBeenCalled();
  });
  it('posts to the pixel with the token in the body, not the URL', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true });
    const r = await sendMetaEvent({ eventName: 'Lead', eventId: 'evt-12345678' }, cfg, f as never);
    expect(r.sent).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/999/events');
    expect(url).not.toContain('tok');
    expect(JSON.parse(init.body).access_token).toBe('tok');
  });
  it('swallows a Meta failure', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'bad' } }) });
    expect(await sendMetaEvent({ eventName: 'Lead', eventId: 'evt-12345678' }, cfg, f as never)).toEqual({ sent: false, reason: 'http_400' });
    const boom = vi.fn().mockRejectedValue(new Error('down'));
    expect(await sendMetaEvent({ eventName: 'Lead', eventId: 'evt-12345678' }, cfg, boom as never)).toEqual({ sent: false, reason: 'network' });
  });
});
