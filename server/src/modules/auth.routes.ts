import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hash, compare, sha256 } from '../lib/crypto.js';
import { signAccess } from '../lib/jwt.js';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { HttpError, ah } from '../middleware/error.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';
import { assertOtpDelivered, createOtp, issueTokens, verifyOtpAndLogin, publicUser } from '../lib/authSession.js';
import { scoped } from '../lib/log.js';

const log = scoped('auth');

export const authRouter = Router();
export { publicUser };

// Real Indian mobile numbers start with 6-9; reject one digit repeated ten
// times ("0000000000", "9999999999") too — the app's own client-side check
// mirrors this, but that alone is bypassable, so this is the real boundary.
const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'phone must be a valid 10-digit Indian mobile number')
  .refine(p => !/^(\d)\1{9}$/.test(p), 'phone must be a valid 10-digit Indian mobile number');

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
    const { devOtp, delivered } = await createOtp(phone, user.id);
    log.info('registered', { userId: user.id, phone, hasDevOtp: !!devOtp, delivered });
    assertOtpDelivered(delivered, phone);
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
    const { devOtp, delivered } = await createOtp(phone, user.id);

    // WS5: OTP_REQUESTED had no event at all before — without it there is no
    // way to see the "asked for an OTP but never entered it" drop-off.
    trackJourney(
      { phone, userId: user.id, source: 'app' },
      { channel: 'app', name: JOURNEY_EVENTS.OTP_REQUESTED, screen: 'mobile' },
    ).catch(() => {});

    log.info('otp requested', { phone, userId: user.id, hasDevOtp: !!devOtp, delivered });
    assertOtpDelivered(delivered, phone);
    res.json({ otpSent: true, devOtp });
  }),
);

/** Verify an OTP and issue tokens (this is the app's primary login). */
authRouter.post(
  '/otp/verify',
  // session_id must be declared here: validate() replaces req.body with Zod's
  // parsed output, and Zod strips unknown keys — so an undeclared field arrives
  // as undefined no matter what the client sent.
  //
  // .nullable() matters: the client's getTrackingSessionId() sends a literal
  // `null` (not an absent key) before any tracking session exists yet —
  // .optional() alone rejects null (only undefined/absent passes), which was
  // failing every login attempt made before the app's first tracking call
  // landed. Real bug, not a typo — verified via request-body logging.
  validate(
    z.object({
      phone: phoneSchema,
      code: z.string().length(6),
      session_id: z.string().nullable().optional(),
      sessionId: z.string().nullable().optional(),
    }),
  ),
  ah(async (req, res) => {
    const { phone, code } = req.body;
    const sessionId: string | null = req.body.session_id ?? req.body.sessionId ?? null;
    const { user, tokens, priorInquiries } = await verifyOtpAndLogin({
      phone,
      code,
      sessionId,
      refreshTtlMs: env.refreshTtlDays * 864e5,
      source: 'app',
    });
    res.json({ user: publicUser(user), ...tokens, priorInquiries });
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
    if (!user || !user.passwordHash || !(await compare(password, user.passwordHash))) {
      log.warn('password login rejected', { identifier });
      throw new HttpError(401, 'Invalid credentials');
    }
    const tokens = await issueTokens(user.id, user.phone, env.refreshTtlDays * 864e5);
    log.info('password login', { userId: user.id });
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
