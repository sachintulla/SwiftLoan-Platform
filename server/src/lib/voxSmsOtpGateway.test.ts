import { describe, expect, it } from 'vitest';
import { buildOtpGatewayRequest, otpGatewayConfigured } from './voxSms.js';

const ENV = { SMS_PROVIDER: 'vox', VOX_AUTH_TOKEN: 'tok', VOX_PROJECT_ID: 'PRJ1', VOX_BASE_URL: 'https://api.vox-cpaas.in/sendsms' };
const MSG = { phone: '9000000001', body: 'Dear Customer, hello', templateId: '1277179282379560316', from: 'PTSLA' };

describe('buildOtpGatewayRequest', () => {
  it('uses the form transport (v1) for a URL without /v2/ and sends the DLT fields', () => {
    const r = buildOtpGatewayRequest(ENV, MSG);
    if ('error' in r) throw new Error(r.error);
    expect(r.version).toBe('v1');
    expect(r.headers['content-type']).toBe('application/x-www-form-urlencoded');
    const f = new URLSearchParams(r.payload);
    expect(f.get('to')).toBe('+919000000001');
    expect(f.get('from')).toBe('PTSLA');
    expect(f.get('template_id')).toBe('1277179282379560316');
    expect(f.get('projectid')).toBe('PRJ1');
    expect(f.get('authtoken')).toBe('tok');
    expect(f.get('body')).toBe('Dear Customer, hello');
    expect(f.get('expiry')).toBe('10');
  });

  it('uses JSON (v2) when the URL says /v2/ or VOX_API_VERSION=v2', () => {
    for (const env of [{ ...ENV, VOX_BASE_URL: 'https://x/sms/v2/send' }, { ...ENV, VOX_API_VERSION: 'v2' }]) {
      const r = buildOtpGatewayRequest(env, MSG);
      if ('error' in r) throw new Error(r.error);
      expect(r.version).toBe('v2');
      expect(JSON.parse(r.payload).to).toBe('+919000000001');
    }
  });

  it('reports what is missing instead of sending', () => {
    expect(buildOtpGatewayRequest({ ...ENV, VOX_BASE_URL: undefined }, MSG)).toEqual({ error: 'VOX_BASE_URL is not set' });
    expect('error' in buildOtpGatewayRequest({ ...ENV, VOX_AUTH_TOKEN: undefined }, MSG)).toBe(true);
    expect(buildOtpGatewayRequest(ENV, { ...MSG, from: '' })).toEqual({ error: 'SMS sender is not configured' });
    expect(buildOtpGatewayRequest(ENV, { ...MSG, templateId: '' })).toEqual({ error: 'SMS templateId is not configured' });
  });
});

describe('otpGatewayConfigured', () => {
  it('needs provider vox plus the token, project and URL', () => {
    expect(otpGatewayConfigured(ENV)).toBe(true);
    expect(otpGatewayConfigured({ ...ENV, SMS_PROVIDER: 'msg91' })).toBe(false);
    expect(otpGatewayConfigured({ ...ENV, VOX_PROJECT_ID: '' })).toBe(false);
    expect(otpGatewayConfigured({})).toBe(false);
  });
});
