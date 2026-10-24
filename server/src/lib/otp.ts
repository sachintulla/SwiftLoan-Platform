/**
 * Website-scoped phone OTP — proves a lead's number is real before any calling
 * job is allowed to dial it.
 *
 * Deliberately separate from the app's /api/auth/otp/* flow (auth.routes.ts):
 * that flow auto-creates a full `User` account and issues real app JWT/refresh
 * tokens on verify — side effects that make no sense for an anonymous
 * marketing-site visitor who hasn't signed up for anything. This module only
 * proves phone ownership and never touches `User` or issues any token; the
 * caller (context.routes.ts) is responsible for flipping `Customer.phoneVerified`.
 *
 * Reuses the same `OtpToken` table and SMS provider as the app flow (purpose
 * "verify_phone", already reserved but unused in the schema comment) so there
 * is one delivery/storage mechanism, not two.
 */
import { timing } from './timings.js';
import { prisma } from './prisma.js';
import { sha256, genOtp } from './crypto.js';
import { sendOtpSms, smsConfigured } from './sms.js';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.js';
import { isMasterOtp } from './reviewLogin.js';

/** How long a code works / how long repeated requests are counted. Live values: Admin → Timings (auth.*). */
const otpTtlMs = () => timing.minutesMs('auth.otpValidityMinutes');
/** Anti-SMS-bombing: this is a public, unauthenticated endpoint. */
const resendWindowMs = () => timing.minutesMs('auth.otpResendWindowMinutes');
const MAX_REQUESTS_PER_WINDOW = 3;

export const VERIFY_PHONE_PURPOSE = 'verify_phone';

export interface RequestOtpResult {
  sent: boolean;
  /** Only present outside prod (or with no SMS provider configured) — see auth.routes.ts's identical convention. */
  devOtp?: string;
}

export async function requestPhoneOtp(phone: string, purpose: string = VERIFY_PHONE_PURPOSE): Promise<RequestOtpResult> {
  const windowStart = new Date(Date.now() - resendWindowMs());
  const recent = await prisma.otpToken.count({ where: { phone, purpose, createdAt: { gte: windowStart } } });
  if (recent >= MAX_REQUESTS_PER_WINDOW) {
    throw new HttpError(429, 'Too many OTP requests for this number. Please try again in a few minutes.');
  }

  const code = genOtp();
  // Invalidate any still-live code for this phone+purpose first, so only the
  // most recently sent one can ever verify.
  await prisma.otpToken.updateMany({ where: { phone, purpose, consumed: false }, data: { consumed: true } });
  await prisma.otpToken.create({
    data: { phone, purpose, codeHash: sha256(code), expiresAt: new Date(Date.now() + otpTtlMs()) },
  });

  if (smsConfigured()) {
    await sendOtpSms(phone, code); // fire-and-forget; failure is logged in sms.ts
    return { sent: true };
  }
  // No SMS provider: dev, or explicit DEMO_LOGIN, surfaces the code (same
  // convention as auth.routes.ts's createOtp()).
  const devOtp = env.isProd && process.env.DEMO_LOGIN !== 'true' ? undefined : code;
  return { sent: true, devOtp };
}

export async function verifyPhoneOtp(phone: string, code: string, purpose: string = VERIFY_PHONE_PURPOSE): Promise<boolean> {
  // Test master OTP(s): DEV_MASTER_OTP may hold one code or a comma-separated list.
  if (isMasterOtp(code)) return true;

  const otp = await prisma.otpToken.findFirst({
    where: { phone, purpose, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.codeHash !== sha256(code)) return false;
  await prisma.otpToken.update({ where: { id: otp.id }, data: { consumed: true } });
  return true;
}
