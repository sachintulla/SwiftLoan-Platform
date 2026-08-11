import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export const hash = (s: string) => bcrypt.hash(s, 10);
export const compare = (s: string, h: string) => bcrypt.compare(s, h);
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
// Always a real random 6-digit OTP — whether it's surfaced to the client or
// sent by SMS is decided separately in auth.routes.ts's createOtp(), but the
// code itself must never be predictable.
export const genOtp = () => String(crypto.randomInt(100000, 999999));
