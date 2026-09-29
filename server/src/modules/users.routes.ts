import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, HttpError } from '../middleware/error.js';
import { publicUser } from './auth.routes.js';
import { presignAvatarUpload, s3Configured } from '../lib/s3.js';
import { scoped } from '../lib/log.js';
import { isAdult } from '../lib/age.js';

const log = scoped('users');

export const usersRouter = Router();
usersRouter.use(requireAuth);

/** Current user profile. */
usersRouter.get('/me', ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user: publicUser(user) });
}));

// Real PAN structure, not just "10 characters" — see applications.routes.ts's
// panSchema comment for the holder-type-code reasoning; duplicated here rather
// than shared, matching how phoneSchema is independently defined per module.
const PAN_HOLDER_CODES = 'ABCFGHJLPT';
const panSchema = z
  .string()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'panNumber must be a valid PAN (e.g. AAAPL1234C)')
  .refine(p => PAN_HOLDER_CODES.includes(p[3]), 'panNumber must be a valid PAN (e.g. AAAPL1234C)');

// Every free-text field capped — an authenticated (or PAN-verify-anonymous)
// caller can hit this endpoint directly, no app UI involved, so the app's own
// TextInput maxLength is UX only and enforces nothing by itself. Without a
// server-side bound here, a single field could carry an arbitrarily large
// string (up to the 1mb body-parser cap in app.ts) into the DB — inflated
// storage (worse for the PII columns, which are AES-256-GCM encrypted, so
// bloats the ciphertext too), and a stored payload nothing downstream (this
// API, the admin dashboard, Ruby's own context) ever expected a name/address
// field to carry. Limits are generous for real data, not tight enough to
// reject anyone: 60 for name-shaped fields, 100 for company/city/state-shaped
// ones, 300 for free-form address lines, 254 for email (RFC 5321's own cap).
const NAME_MAX = 60, MID_MAX = 100, ADDR_MAX = 300, EMAIL_MAX = 254;
// Loan amounts are capped at 15,00,000 elsewhere (applications.routes.ts);
// income/obligations/draft amount aren't loan amounts themselves but should
// never approach Postgres's 32-bit Int column limit (~2.1bn) either.
const MONEY_MAX = 999_999_999;
// A PAN-card name is always Latin script regardless of the app's own display
// language — letters, spaces, and the punctuation real names legitimately use
// (O'Brien, Anne-Marie, "A. Rahul"). No digits, emoji, or symbols. `.trim()`
// also closes the "saved with stray leading/trailing spaces" gap — the app's
// own onBlur handler already trims, but this is the boundary that actually
// matters for a caller that skips the app.
const NAME_RE = /^[A-Za-z '.-]+$/;
const nameField = (max: number) => z.string().trim().min(1).max(max).regex(NAME_RE, 'Only letters, spaces, apostrophes, hyphens and dots are allowed');
// Real monthly incomes for a loan applicant; rejects the 0 / 100 / 1000
// "technically a number but not a real income" cases outright.
const MONTHLY_INCOME_MIN = 5000;

const profilePatch = z.object({
  firstName: nameField(NAME_MAX).optional(),
  lastName: nameField(NAME_MAX).optional(),
  fullName: nameField(NAME_MAX * 2).optional(),
  email: z.string().email().max(EMAIL_MAX).optional(),
  dob: z.string().datetime().refine(v => isAdult(new Date(v)), 'You must be at least 18 years old.').optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  // Indian PIN codes are exactly 6 digits and never start with 0 (the first
  // digit is a postal zone, 1–9) — matches src/utils/inputLimits.ts's PINCODE_RE.
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'pincode must be a valid 6-digit Indian PIN code').optional(),
  residenceType: z.enum(['own', 'rented', 'family', 'company']).optional(),
  employment: z.enum(['salaried', 'self_employed', 'business_owner', 'gig_worker', 'student', 'retired', 'other']).optional(),
  monthlyIncome: z.number().int().min(MONTHLY_INCOME_MIN, `monthlyIncome must be at least ${MONTHLY_INCOME_MIN}`).max(MONEY_MAX).optional(),
  company: z.string().max(MID_MAX).optional(),
  panNumber: panSchema.optional(),
  // Aurix applicant fields collected across the PAN / details / optional screens.
  qualification: z.string().max(MID_MAX).optional(),
  maritalStatus: z.string().max(MID_MAX).optional(),
  alternateMobile: z.string().max(15).optional(),
  alternateEmail: z.string().email().max(EMAIL_MAX).optional(),
  loanPurpose: z.string().max(MID_MAX).optional(),
  salaryMode: z.string().max(MID_MAX).optional(),
  professionalType: z.string().max(MID_MAX).optional(),
  companyEmail: z.string().email().max(EMAIL_MAX).optional(),
  businessEmail: z.string().email().max(EMAIL_MAX).optional(),
  addressLine1: z.string().max(ADDR_MAX).optional(),
  addressLine2: z.string().max(ADDR_MAX).optional(),
  landmark: z.string().max(MID_MAX).optional(),
  city: z.string().max(MID_MAX).optional(),
  district: z.string().max(MID_MAX).optional(),
  state: z.string().max(MID_MAX).optional(),
  monthlyObligations: z.number().int().nonnegative().max(MONEY_MAX).optional(),
  // The desired loan amount, gathered conversationally before a real
  // LoanApplication exists to hold it — see the schema comment on the column
  // itself. Plain rupees, matching LoanApplication.amount's own convention.
  draftLoanAmount: z.number().int().nonnegative().max(MONEY_MAX).optional(),
}).strict();

/** Update user information in the backend database. */
usersRouter.patch('/me', validate(profilePatch), ah(async (req, res) => {
  const data: any = { ...req.body };
  if (data.dob) data.dob = new Date(data.dob);
  try {
    const user = await prisma.user.update({ where: { id: req.user!.sub }, data });
    res.json({ user: publicUser(user) });
  } catch (e: any) {
    // email (and any other @unique applicant field) can collide with an existing
    // account — surface a clean 409 instead of a raw 500, so the whole profile
    // save (and the downstream Aurix payload) isn't silently lost.
    if (e?.code === 'P2002') {
      const field = Array.isArray(e?.meta?.target) ? e.meta.target[0] : (e?.meta?.target ?? 'value');
      throw new HttpError(409, `This ${field} is already in use by another account.`);
    }
    throw e;
  }
}));

/** Get a presigned S3 PUT URL for a profile photo upload. */
usersRouter.post('/me/avatar/presign',
  validate(z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) })),
  ah(async (req, res) => {
    if (!s3Configured()) throw new HttpError(503, 'Photo upload is not configured yet.');
    const { uploadUrl, publicUrl } = await presignAvatarUpload(req.user!.sub, req.body.contentType);
    res.json({ uploadUrl, publicUrl });
  }));

/** Confirm a photo upload (after the client PUTs the file to the presigned URL). */
usersRouter.patch('/me/avatar',
  validate(z.object({ avatarUrl: z.string().url() })),
  ah(async (req, res) => {
    // The URL must be one we just handed out for this exact user — an object
    // key under avatars/{userId}/ in our own bucket — never an arbitrary URL
    // the client makes up.
    const bucket = process.env.S3_BUCKET_NAME;
    const expectedPrefix = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/avatars/${req.user!.sub}/`;
    if (!req.body.avatarUrl.startsWith(expectedPrefix)) throw new HttpError(400, 'Invalid avatar URL.');
    const user = await prisma.user.update({ where: { id: req.user!.sub }, data: { avatarUrl: req.body.avatarUrl } });
    res.json({ user: publicUser(user) });
  }));

/** Set display language. */
usersRouter.patch('/me/language', validate(z.object({ lang: z.enum(['en', 'hi', 'te', 'hinglish', 'tenglish']) })),
  ah(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.user!.sub }, data: { lang: req.body.lang } });
    res.json({ user: publicUser(user) });
  }));

/**
 * Set the language the user has spoken to the voice agent — distinct from
 * `/me/language` (the app's UI-copy language). The agent's `set_language`
 * voice tool calls this so the preference survives across calls/devices.
 */
usersRouter.patch('/me/voice-language', validate(z.object({ lang: z.enum(['en', 'hi', 'te', 'hinglish', 'tenglish']) })),
  ah(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.user!.sub }, data: { voiceLang: req.body.lang } });
    res.json({ user: publicUser(user) });
  }));

/** Notification preferences. */
usersRouter.patch('/me/notifications',
  validate(z.object({ loanUpdates: z.boolean().optional(), securityAlerts: z.boolean().optional(), promoOffers: z.boolean().optional() })),
  ah(async (req, res) => {
    const { loanUpdates, securityAlerts, promoOffers } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: {
        ...(loanUpdates !== undefined ? { notifyLoanUpdates: loanUpdates } : {}),
        ...(securityAlerts !== undefined ? { notifySecurityAlerts: securityAlerts } : {}),
        ...(promoOffers !== undefined ? { notifyPromoOffers: promoOffers } : {}),
      },
    });
    res.json({ user: publicUser(user) });
  }));

/** Record a consent (terms / soft-pull / data-sharing / communications). */
usersRouter.post('/me/consents',
  validate(z.object({ type: z.enum(['terms', 'soft_pull', 'data_sharing', 'communications']), granted: z.boolean() })),
  ah(async (req, res) => {
    const consent = await prisma.consent.create({ data: { userId: req.user!.sub, type: req.body.type, granted: req.body.granted } });
    log.info('consent recorded', { userId: req.user!.sub, type: consent.type, granted: consent.granted });
    res.status(201).json({ consent });
  }));

/** Real score band thresholds — no bureau vendor is integrated yet, so this is
 * the only per-user thing we can report: the stored score and a classification
 * of it. Factors/delta/bureau are NOT reported because we have no real data to
 * back those claims. */
function scoreBand(score: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' {
  if (score >= 800) return 'EXCELLENT';
  if (score >= 700) return 'GOOD';
  if (score >= 600) return 'FAIR';
  return 'POOR';
}

usersRouter.get('/me/credit-score', ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  const score = user?.creditScore ?? 750;
  res.json({ score, band: scoreBand(score) });
}));

/** Delete account (right to erasure). */
usersRouter.delete('/me', ah(async (req, res) => {
  const userId = req.user!.sub;
  await prisma.user.delete({ where: { id: userId } });
  log.warn('account deleted', { userId });
  res.json({ ok: true });
}));
