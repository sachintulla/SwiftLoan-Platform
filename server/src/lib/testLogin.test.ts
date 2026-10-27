import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const find = vi.fn();
vi.mock('./prisma.js', () => ({ prisma: { testLoginNumber: { findUnique: (...a: unknown[]) => find(...a) } } }));

import { testLoginOtp, isTestLoginNumber, isTestLoginOtp } from './testLogin.js';

describe('test-number login (TEST_LOGIN_OTP + admin list)', () => {
  beforeEach(() => find.mockReset());
  afterEach(() => { delete process.env.TEST_LOGIN_OTP; });

  it('is off when the code is unset or malformed (fails closed, no DB read)', async () => {
    expect(testLoginOtp()).toBeNull();
    expect(await isTestLoginOtp('9876543210', '482915')).toBe(false);
    process.env.TEST_LOGIN_OTP = '12ab56';
    expect(testLoginOtp()).toBeNull();
    process.env.TEST_LOGIN_OTP = '1234';
    expect(testLoginOtp()).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it('accepts the code only for a listed, active number', async () => {
    process.env.TEST_LOGIN_OTP = '482915';
    find.mockResolvedValueOnce({ active: true });
    expect(await isTestLoginOtp('9876543210', '482915')).toBe(true);
    find.mockResolvedValueOnce(null); // a real customer's number
    expect(await isTestLoginOtp('9123456780', '482915')).toBe(false);
    find.mockResolvedValueOnce({ active: false }); // switched off
    expect(await isTestLoginOtp('9876543210', '482915')).toBe(false);
  });

  it('rejects a wrong code without looking the number up', async () => {
    process.env.TEST_LOGIN_OTP = '482915';
    expect(await isTestLoginOtp('9876543210', '000000')).toBe(false);
    expect(await isTestLoginOtp('9876543210', '4829')).toBe(false);
    expect(find).not.toHaveBeenCalled();
  });

  it('isTestLoginNumber is false for everyone when no code is configured', async () => {
    expect(await isTestLoginNumber('9876543210')).toBe(false);
    expect(find).not.toHaveBeenCalled();
  });
});
