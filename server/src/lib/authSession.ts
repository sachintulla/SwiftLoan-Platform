import { prisma } from './prisma.js';
import { sha256, genOtp, randomToken } from './crypto.js';
import { sendOtpSms, smsConfigured } from './sms.js';
import { signAccess } from './jwt.js';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.js';
import { trackJourney, resolveCustomer, recordJourneyEvent, claimAnonymousSession, JOURNEY_EVENTS } from './journey.js';
import { generateAurixTokenFromEnv } from './lenderOffers.js';
import { scoped } from './log.js';

const log = scoped('authSession');

/**
 * Shared by the app's /api/auth/otp/* (30-day refresh, source 'app') and the
 * website's /api/website/auth/* (2-hour sliding refresh, source 'website') —
 * extracted so both issue real sessions against the same User/RefreshToken
 * rows instead of duplicating the OTP + login bookkeeping below.
 */

export async function createOtp(phone: string, userId?: string) {
  const code = genOtp();
  await prisma.otpToken.updateMany({ where: { phone, consumed: false }, data: { consumed: true } });
  await prisma.otpToken.create({
    data: { phone, userId, codeHash: sha256(code), expiresAt: new Date(Date.now() + 5 * 60_000) },
  });

  if (smsConfigured()) {
    await sendOtpSms(phone, code); // fire-and-forget; failure is logged in sms.ts
    return undefined;
  }
  return env.isProd && process.env.DEMO_LOGIN !== 'true' ? undefined : code;
}

export async function issueTokens(userId: string, phone: string, refreshTtlMs: number) {
  const access = signAccess({ sub: userId, phone });
  const refresh = randomToken();
  const expiresAt = new Date(Date.now() + refreshTtlMs);
  const row = await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(refresh), expiresAt } });
  return { accessToken: access, refreshToken: refresh, expiresIn: env.accessTtl, refreshTokenId: row.id, refreshExpiresAt: expiresAt };
}

export function publicUser(u: any) {
  // Never leak secrets to the client: the password hash, and the server-side
  // Aurix token (kept out of the app bundle/network by design).
  const { passwordHash, aurixToken, aurixTokenExpiresAt, ...rest } = u;
  return rest;
}

export type LoginSource = 'app' | 'website';

/**
 * Verify an OTP and log the user in — this is the real login, shared by every
 * client. `refreshTtlMs` lets each caller pick its own session length (the app
 * uses 30 days server-wide; the website uses a shorter, sliding 2-hour
 * session); `source` only tags journey/customer-resolution events so the 360
 * view can tell an app login from a website one.
 */
export async function verifyOtpAndLogin(params: {
  phone: string;
  code: string;
  sessionId?: string | null;
  refreshTtlMs: number;
  source: LoginSource;
}) {
  const { phone, code, sessionId, refreshTtlMs, source } = params;

  const masterOtp = process.env.DEV_MASTER_OTP;
  const isMaster = !!masterOtp && code === masterOtp;
  const otp = await prisma.otpToken.findFirst({
    where: { phone, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!isMaster && (!otp || otp.codeHash !== sha256(code))) {
    log.warn('otp verify rejected', { phone, source });
    throw new HttpError(400, 'Invalid or expired OTP');
  }
  if (otp) await prisma.otpToken.update({ where: { id: otp.id }, data: { consumed: true } });
  const user = await prisma.user.update({ where: { phone }, data: { phoneVerified: true } });
  const tokens = await issueTokens(user.id, user.phone, refreshTtlMs);
  log.info('otp verified — logged in', { phone, userId: user.id, viaMasterOtp: isMaster, source });

  // Pre-generate + cache the Aurix (Knight Fintech) X-Aurix-Token now, keyed by
  // this user.id, so the eligible_offers call after PAN reuses it instead of
  // paying a cold token round-trip. Fire-and-forget: never blocks or fails login.
  void generateAurixTokenFromEnv(user.id, user.phone)
    .then((token) =>
      prisma.user.update({
        where: { id: user.id },
        data: { aurixToken: token, aurixTokenExpiresAt: new Date(Date.now() + 20 * 864e5) },
      }),
    )
    .catch(() => {});

  // Website inquiries made under this phone number before this login (either
  // a marketing-site lead captured earlier, or — now that the website itself
  // has a real login — a prior session on another device) are surfaced and
  // converted the same way regardless of which client logged in.
  const matchingLeads = await prisma.lead.findMany({ where: { phone }, orderBy: { createdAt: 'asc' } });
  if (matchingLeads.length) {
    await prisma.lead.updateMany({
      where: { id: { in: matchingLeads.map((l) => l.id) } },
      data: { status: 'converted', convertedUserId: user.id },
    });
  }
  const priorInquiries = matchingLeads.map((l) => ({
    productInterest: l.productInterest,
    amount: l.amount,
    createdAt: l.createdAt,
  }));

  void (async () => {
    const customer = await resolveCustomer({
      phone,
      userId: user.id,
      name: user.fullName ?? matchingLeads[0]?.name ?? null,
      email: user.email,
      source: matchingLeads.length ? 'website' : source,
      campaignId: matchingLeads.find((l) => l.campaignId)?.campaignId ?? null,
    });
    if (!customer) return;
    if (sessionId) await claimAnonymousSession(customer.id, sessionId, user.id);
    await recordJourneyEvent(customer.id, {
      channel: source,
      name: JOURNEY_EVENTS.OTP_VERIFIED,
      screen: source === 'website' ? 'website' : 'otp',
      metadata: { priorInquiryCount: priorInquiries.length },
    });
  })().catch(() => {});

  return { user, tokens, priorInquiries };
}
