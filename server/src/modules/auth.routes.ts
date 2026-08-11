import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hash, compare, sha256, genOtp, randomToken } from '../lib/crypto.js';
import { sendOtpSms, smsConfigured } from '../lib/sms.js';
import { signAccess } from '../lib/jwt.js';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { HttpError, ah } from '../middleware/error.js';
import { trackJourney, resolveCustomer, recordJourneyEvent, claimAnonymousSession, JOURNEY_EVENTS } from '../lib/journey.js';

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

  // Real OTP system: when an SMS provider is configured, deliver the code by SMS
  // and NEVER return it to the client (a real one-time secret). Demo/dev keeps
  // surfacing the fixed code so testing works without a live SMS account.
  if (smsConfigured()) {
    await sendOtpSms(phone, code); // fire-and-forget; failure is logged in sms.ts
    return undefined;
  }
  // No SMS provider: dev, or explicit DEMO_LOGIN, surfaces the code (123456).
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

    // WS5: OTP_REQUESTED had no event at all before — without it there is no
    // way to see the "asked for an OTP but never entered it" drop-off.
    trackJourney(
      { phone, userId: user.id, source: 'app' },
      { channel: 'app', name: JOURNEY_EVENTS.OTP_REQUESTED, screen: 'mobile' },
    ).catch(() => {});

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
    const otp = await prisma.otpToken.findFirst({
      where: { phone, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.codeHash !== sha256(code)) throw new HttpError(400, 'Invalid or expired OTP');
    await prisma.otpToken.update({ where: { id: otp.id }, data: { consumed: true } });
    const user = await prisma.user.update({ where: { phone }, data: { phoneVerified: true } });
    const tokens = await issueTokens(user.id, user.phone);

    // Website inquiries made under this phone number before the app was
    // installed. All matches are surfaced (not just the newest) so the voice
    // agent can ask which one the caller meant instead of guessing.
    const matchingLeads = await prisma.anonymousLead.findMany({
      where: { phone },
      orderBy: { createdAt: 'asc' },
    });
    if (matchingLeads.length) {
      await prisma.anonymousLead.updateMany({
        where: { id: { in: matchingLeads.map((l) => l.id) } },
        data: { status: 'converted', convertedUserId: user.id },
      });
    }
    const priorInquiries = matchingLeads.map((l) => ({
      productInterest: l.productInterest,
      amount: l.amount,
      createdAt: l.createdAt,
    }));

    // WS5: bind this phone's Customer row to the now-known userId. This is the
    // join that makes pre-login website/campaign activity and post-login app
    // activity resolve to one person — everything the 360 view shows depends on
    // it. Fire-and-forget: journey bookkeeping must never fail a login.
    const sessionId: string | null = req.body.session_id ?? req.body.sessionId ?? null;

    void (async () => {
      const customer = await resolveCustomer({
        phone,
        userId: user.id,
        name: user.fullName ?? matchingLeads[0]?.name ?? null,
        email: user.email,
        source: matchingLeads.length ? 'website' : 'app',
        campaignId: matchingLeads.find((l) => l.campaignId)?.campaignId ?? null,
      });
      if (!customer) return;

      // Claim the pre-login app activity FIRST, so install / app-open /
      // language land on the timeline before OTP_VERIFIED and the journey reads
      // in the order it actually happened.
      if (sessionId) await claimAnonymousSession(customer.id, sessionId, user.id);

      await recordJourneyEvent(customer.id, {
        channel: 'app',
        name: JOURNEY_EVENTS.OTP_VERIFIED,
        screen: 'otp',
        metadata: { priorInquiryCount: priorInquiries.length },
      });
    })().catch(() => {});

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
