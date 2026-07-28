import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hash, compare, sha256, genOtp, randomToken } from '../lib/crypto.js';
import { signAccess } from '../lib/jwt.js';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { HttpError, ah } from '../middleware/error.js';

export const authRouter = Router();

const phoneSchema = z.string().regex(/^\d{10}$/, 'phone must be 10 digits');

async function issueTokens(userId: string, phone: string) {
  const access = signAccess({ sub: userId, phone });
  const refresh = randomToken();
  const expiresAt = new Date(Date.now() + env.refreshTtlDays * 864e5);
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(refresh), expiresAt } });
  return { accessToken: access, refreshToken: refresh, expiresIn: env.accessTtl };
}

async function createOtp(phone: string, userId?: string) {
  const code = genOtp();
  await prisma.otpToken.updateMany({ where: { phone, consumed: false }, data: { consumed: true } });
  await prisma.otpToken.create({
    data: { phone, userId, codeHash: sha256(code), expiresAt: new Date(Date.now() + 5 * 60_000) },
  });
  // In production this is sent via SMS. In dev (or when DEMO_LOGIN=true) we surface
  // it so the app can show the demo OTP (123456).
  return env.isProd && process.env.DEMO_LOGIN !== 'true' ? undefined : code;
}

/** Register a new user by phone (+ optional email/password) and send an OTP. */
authRouter.post(
  '/register',
  validate(z.object({ phone: phoneSchema, email: z.string().email().optional(), password: z.string().min(6).optional(), lang: z.string().optional() })),
  ah(async (req, res) => {
    const { phone, email, password, lang } = req.body;
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) throw new HttpError(409, 'An account with this phone already exists');
    const user = await prisma.user.create({
      data: {
        phone,
        email: email || null,
        passwordHash: password ? await hash(password) : null,
        lang: (lang as any) || 'en',
      },
    });
    const devOtp = await createOtp(phone, user.id);
    res.status(201).json({ userId: user.id, otpSent: true, devOtp });
  }),
);

/** Request an OTP for login/verification (creates a shell user if new). */
authRouter.post(
  '/otp/request',
  validate(z.object({ phone: phoneSchema })),
  ah(async (req, res) => {
    const { phone } = req.body;
    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) user = await prisma.user.create({ data: { phone } });
    const devOtp = await createOtp(phone, user.id);
    res.json({ otpSent: true, devOtp });
  }),
);

/** Verify an OTP and issue tokens (this is the app's primary login). */
authRouter.post(
  '/otp/verify',
  validate(z.object({ phone: phoneSchema, code: z.string().length(6) })),
  ah(async (req, res) => {
    const { phone, code } = req.body;
    const otp = await prisma.otpToken.findFirst({
      where: { phone, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.codeHash !== sha256(code)) throw new HttpError(400, 'Invalid or expired OTP');
    await prisma.otpToken.update({ where: { id: otp.id }, data: { consumed: true } });
    const user = await prisma.user.update({ where: { phone }, data: { phoneVerified: true } });
    const tokens = await issueTokens(user.id, user.phone);
    res.json({ user: publicUser(user), ...tokens });
  }),
);

/** Password login (email or phone + password). */
authRouter.post(
  '/login',
  validate(z.object({ identifier: z.string(), password: z.string() })),
  ah(async (req, res) => {
    const { identifier, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: identifier }, { email: identifier }] },
    });
    if (!user || !user.passwordHash || !(await compare(password, user.passwordHash)))
      throw new HttpError(401, 'Invalid credentials');
    const tokens = await issueTokens(user.id, user.phone);
    res.json({ user: publicUser(user), ...tokens });
  }),
);

/** Exchange a refresh token for a new access token. */
authRouter.post(
  '/refresh',
  validate(z.object({ refreshToken: z.string() })),
  ah(async (req, res) => {
    const { refreshToken } = req.body;
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!row || row.revoked || row.expiresAt < new Date()) throw new HttpError(401, 'Invalid refresh token');
    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new HttpError(401, 'User not found');
    res.json({ accessToken: signAccess({ sub: user.id, phone: user.phone }), expiresIn: env.accessTtl });
  }),
);

/** Revoke a refresh token (logout). */
authRouter.post(
  '/logout',
  validate(z.object({ refreshToken: z.string() })),
  ah(async (req, res) => {
    await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(req.body.refreshToken) }, data: { revoked: true } });
    res.json({ ok: true });
  }),
);

export function publicUser(u: any) {
  const { passwordHash, ...rest } = u;
  return rest;
}
