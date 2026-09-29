import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./prisma.js', () => ({ prisma: {} }));
vi.mock('./lenderOffers.js', () => ({ generateAurixTokenFromEnv: async () => '' }));
const { assertOtpDelivered } = await import('./authSession.js');

describe('assertOtpDelivered', () => {
  afterEach(() => { delete process.env.DEV_MASTER_OTP; });

  it('passes when the SMS went out', () => {
    expect(() => assertOtpDelivered(true, '9876543210')).not.toThrow();
  });
  it('blocks sign-in on a failed SMS when no master OTP exists (prod)', () => {
    expect(() => assertOtpDelivered(false, '9876543210')).toThrow(/Could not send the verification code/);
  });
  it('lets sign-in continue on a failed SMS when DEV_MASTER_OTP is set (dev/UAT)', () => {
    process.env.DEV_MASTER_OTP = '123456';
    expect(() => assertOtpDelivered(false, '9876543210')).not.toThrow();
  });
});
