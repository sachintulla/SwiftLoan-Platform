import { describe, expect, it } from 'vitest';
import { smsCredentials } from './smsCredentials.js';

const settings = { projectId: 'PRJ_WA', smsUseOtpCredentials: false };
const secrets = { authToken: 'wa-token' };
const env = { VOX_AUTH_TOKEN: 'otp-token', VOX_PROJECT_ID: 'PRJ_OTP' };

describe('smsCredentials', () => {
  it('uses the integration credentials by default, so nothing changes until the switch is on', () => {
    expect(smsCredentials(settings, secrets, env)).toEqual({ token: 'wa-token', projectId: 'PRJ_WA', source: 'integration' });
    expect(smsCredentials({ projectId: 'PRJ_WA' }, secrets, env).source).toBe('integration');
  });

  it("uses the OTP project's token and ID when the switch is on", () => {
    expect(smsCredentials({ ...settings, smsUseOtpCredentials: true }, secrets, env)).toEqual({ token: 'otp-token', projectId: 'PRJ_OTP', source: 'otp' });
    expect(smsCredentials({ ...settings, smsUseOtpCredentials: 'true' }, secrets, env).source).toBe('otp');
  });

  it('falls back to the integration credentials if the OTP ones are missing, rather than sending with half a pair', () => {
    expect(smsCredentials({ ...settings, smsUseOtpCredentials: true }, secrets, { VOX_AUTH_TOKEN: 'otp-token' }).source).toBe('integration');
    expect(smsCredentials({ ...settings, smsUseOtpCredentials: true }, secrets, {}).source).toBe('integration');
  });

  it('never mixes the two pairs', () => {
    const c = smsCredentials({ ...settings, smsUseOtpCredentials: true }, secrets, env);
    expect(c.token === 'otp-token').toBe(c.projectId === 'PRJ_OTP');
  });
});
