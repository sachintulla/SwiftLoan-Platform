import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { yubiAuthOk, parseYubiEvent } from './yubiWebhook.js';

const body = Buffer.from('{"clientReferralId":"abc"}');

describe('yubiAuthOk', () => {
  it('rejects everything when no secret is configured', () => {
    expect(yubiAuthOk('', { 'x-api-key': 'x' }, body)).toBe(false);
  });
  it('accepts the shared secret in any of the supported headers', () => {
    expect(yubiAuthOk('s3cret', { 'x-webhook-secret': 's3cret' }, body)).toBe(true);
    expect(yubiAuthOk('s3cret', { 'x-api-key': 's3cret' }, body)).toBe(true);
    expect(yubiAuthOk('s3cret', { authorization: 'Bearer s3cret' }, body)).toBe(true);
  });
  it('rejects a wrong or missing secret', () => {
    expect(yubiAuthOk('s3cret', { 'x-api-key': 'nope' }, body)).toBe(false);
    expect(yubiAuthOk('s3cret', {}, body)).toBe(false);
  });
  it('accepts an HMAC-SHA256 body signature (hex, base64, sha256= prefix)', () => {
    const mac = () => crypto.createHmac('sha256', 's3cret').update(body);
    expect(yubiAuthOk('s3cret', { 'x-yubi-signature': mac().digest('hex') }, body)).toBe(true);
    expect(yubiAuthOk('s3cret', { 'x-signature': `sha256=${mac().digest('hex')}` }, body)).toBe(true);
    expect(yubiAuthOk('s3cret', { 'x-signature': mac().digest('base64') }, body)).toBe(true);
  });
  it('rejects a signature over a different body', () => {
    const sig = crypto.createHmac('sha256', 's3cret').update('tampered').digest('hex');
    expect(yubiAuthOk('s3cret', { 'x-yubi-signature': sig }, body)).toBe(false);
  });
});

describe('parseYubiEvent', () => {
  it('reads the Get Status field names at the top level', () => {
    expect(parseYubiEvent({ clientReferralId: 'c1', ymplReferralId: 'y1', journeyStatus: 'NEW_LEAD' })).toMatchObject({
      clientReferralId: 'c1', ymplReferralId: 'y1', status: 'NEW_LEAD',
    });
  });
  it('reads snake_case fields nested under data', () => {
    expect(parseYubiEvent({ data: { client_referral_id: 'c2', journey_status: 'APPLIED', lender_name: 'Acme' } })).toMatchObject({
      clientReferralId: 'c2', status: 'APPLIED', lender: 'Acme',
    });
  });
  it('returns nulls for an empty or non-object body', () => {
    expect(parseYubiEvent(undefined)).toEqual({ clientReferralId: null, ymplReferralId: null, status: null, lender: null, eventId: null });
  });
});
