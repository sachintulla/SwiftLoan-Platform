import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export const hash = (s: string) => bcrypt.hash(s, 10);
export const compare = (s: string, h: string) => bcrypt.compare(s, h);
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
// 6-digit OTP; fixed 123456 in dev (or when DEMO_LOGIN=true) for the demo login.
export const genOtp = () => (process.env.NODE_ENV === 'production' && process.env.DEMO_LOGIN !== 'true'
  ? String(crypto.randomInt(100000, 999999))
  : '123456');
