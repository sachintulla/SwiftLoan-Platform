import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, HttpError } from '../middleware/error.js';
import { publicUser } from './auth.routes.js';
import { presignAvatarUpload, s3Configured } from '../lib/s3.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

/** Current user profile. */
usersRouter.get('/me', ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user: publicUser(user) });
}));

const profilePatch = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  dob: z.string().datetime().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  residenceType: z.enum(['own', 'rented', 'family', 'company']).optional(),
  employment: z.enum(['salaried', 'self_employed', 'business_owner', 'gig_worker', 'student', 'retired', 'other']).optional(),
  monthlyIncome: z.number().int().nonnegative().optional(),
  company: z.string().optional(),
  panNumber: z.string().length(10).optional(),
  // Aurix applicant fields collected across the PAN / details / optional screens.
  qualification: z.string().optional(),
  maritalStatus: z.string().optional(),
  alternateMobile: z.string().optional(),
  alternateEmail: z.string().email().optional(),
  loanPurpose: z.string().optional(),
  salaryMode: z.string().optional(),
  professionalType: z.string().optional(),
  companyEmail: z.string().email().optional(),
  businessEmail: z.string().email().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  monthlyObligations: z.number().int().nonnegative().optional(),
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
  await prisma.user.delete({ where: { id: req.user!.sub } });
  res.json({ ok: true });
}));
