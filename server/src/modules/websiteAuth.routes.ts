import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sha256 } from '../lib/crypto.js';
import { signAccess } from '../lib/jwt.js';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, ah } from '../middleware/error.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';
import { assertOtpDelivered, createOtp, issueTokens, verifyOtpAndLogin, publicUser } from '../lib/authSession.js';
import { scoped } from '../lib/log.js';

const log = scoped('websiteAuth');

export const websiteAuthRouter = Router();

// A real login on the website itself — distinct from /api/website/otp/* (which
// only verifies a lead's phone, no session) and from /api/auth/otp/* (the
// app's login, 30-day session). This is the same User/RefreshToken model as
// the app, just a shorter, sliding session appropriate for a browser: an
// idle visitor is logged out after this long, an active one never is, because
// every refresh (below) pushes both the cookie and the DB row out again.
const WEBSITE_REFRESH_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const COOKIE_NAME = 'sl_web_refresh';
const COOKIE_PATH = '/api/website/auth';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: WEBSITE_REFRESH_TTL_MS,
  });
}

const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'phone must be a valid 10-digit Indian mobile number')
  .refine((p) => !/^(\d)\1{9}$/.test(p), 'phone must be a valid 10-digit Indian mobile number');

async function findHasApplication(userId: string) {
  const app = await prisma.loanApplication.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  return { hasApplication: !!app, applicationId: app?.id ?? null };
}

/** Request an OTP for the website's own login (creates a shell user if new). */
websiteAuthRouter.post(
  '/otp/request',
  validate(z.object({ phone: phoneSchema })),
  ah(async (req, res) => {
    const { phone } = req.body;
    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) user = await prisma.user.create({ data: { phone } });
    const { devOtp, delivered } = await createOtp(phone, user.id);

    trackJourney(
      { phone, userId: user.id, source: 'website' },
      { channel: 'website', name: JOURNEY_EVENTS.OTP_REQUESTED, screen: 'website' },
    ).catch(() => {});

    log.info('website otp requested', { phone, userId: user.id, hasDevOtp: !!devOtp, delivered });
    assertOtpDelivered(delivered, phone);
    res.json({ success: true, data: { otpSent: true, devOtp }, message: 'OTP sent' });
  }),
);

/** Verify the OTP, log in, and start a website session (httpOnly cookie). */
websiteAuthRouter.post(
  '/otp/verify',
  validate(z.object({ phone: phoneSchema, code: z.string().length(6) })),
  ah(async (req, res) => {
    const { phone, code } = req.body;
    const { user, tokens } = await verifyOtpAndLogin({
      phone,
      code,
      refreshTtlMs: WEBSITE_REFRESH_TTL_MS,
      source: 'website',
    });
    setRefreshCookie(res, tokens.refreshToken);
    const { hasApplication, applicationId } = await findHasApplication(user.id);
    res.json({
      success: true,
      data: { user: publicUser(user), accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, hasApplication, applicationId },
      message: 'Logged in',
    });
  }),
);

/**
 * Exchange the httpOnly refresh cookie for a new access token. Sliding
 * expiration: a successful refresh pushes the same refresh token's DB row and
 * cookie another WEBSITE_REFRESH_TTL_MS out, so an active visitor never hits
 * the 2-hour wall — only real idle time does.
 */
websiteAuthRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) throw new HttpError(401, 'No session');
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!row || row.revoked || row.expiresAt < new Date()) throw new HttpError(401, 'Session expired');
    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new HttpError(401, 'User not found');

    const newExpiresAt = new Date(Date.now() + WEBSITE_REFRESH_TTL_MS);
    await prisma.refreshToken.update({ where: { id: row.id }, data: { expiresAt: newExpiresAt } });
    setRefreshCookie(res, raw);

    res.json({
      success: true,
      data: { accessToken: signAccess({ sub: user.id, phone: user.phone }), expiresIn: env.accessTtl },
      message: 'Session refreshed',
    });
  }),
);

/** Revoke the session and clear the cookie. */
websiteAuthRouter.post(
  '/logout',
  ah(async (req, res) => {
    const raw = req.cookies?.[COOKIE_NAME];
    if (raw) await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw) }, data: { revoked: true } });
    res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
    res.json({ success: true, data: { ok: true }, message: 'Logged out' });
  }),
);

/** Current session's user, for hydrating the account area on page load. */
websiteAuthRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw new HttpError(404, 'User not found');
    const { hasApplication, applicationId } = await findHasApplication(user.id);
    res.json({ success: true, data: { user: publicUser(user), hasApplication, applicationId }, message: 'ok' });
  }),
);
