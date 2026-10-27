import { timingSafeEqual } from 'node:crypto';
import { prisma } from './prisma.js';

/**
 * Test-number login for QA on the production build.
 *
 * An admin lists phone numbers (Admin → Test numbers, table TestLoginNumber); each of them signs in with
 * ONE shared code, env TEST_LOGIN_OTP. Unlike DEV_MASTER_OTP (any number) the code is honoured ONLY for a
 * listed, active number, so it can never open a real customer's account. The code lives in the environment
 * only — not in the database, the admin page or the audit log. Removing a number (or unsetting the env var)
 * takes effect on the next sign-in; there is no cache.
 *
 * Unlike the app-store reviewer account these numbers are NOT sandboxed: they run the real flow, so PAN
 * checks and lender calls are real (and use up a number's one Revasure lead).
 */
const OTP_RE = /^\d{6}$/; // the app's verify endpoint takes exactly 6 digits

export function testLoginOtp(): string | null {
  const otp = (process.env.TEST_LOGIN_OTP ?? '').trim();
  return OTP_RE.test(otp) ? otp : null;
}

export async function isTestLoginNumber(phone: string): Promise<boolean> {
  if (!testLoginOtp()) return false;
  const row = await prisma.testLoginNumber.findUnique({ where: { phone }, select: { active: true } });
  return row?.active === true;
}

/** True only for a listed, active number presenting the shared code. */
export async function isTestLoginOtp(phone: string, code: string): Promise<boolean> {
  const cfg = testLoginOtp();
  if (!cfg) return false;
  const a = Buffer.from(code.trim());
  const b = Buffer.from(cfg);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return isTestLoginNumber(phone);
}
