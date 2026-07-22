import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, HttpError } from '../middleware/error.js';
import { publicUser } from './auth.routes.js';

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
}).strict();

/** Update user information in the backend database. */
usersRouter.patch('/me', validate(profilePatch), ah(async (req, res) => {
  const data: any = { ...req.body };
  if (data.dob) data.dob = new Date(data.dob);
  const user = await prisma.user.update({ where: { id: req.user!.sub }, data });
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

/** Credit score (with mock factors matching the app's Credit Score screen). */
usersRouter.get('/me/credit-score', ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  res.json({
    score: user?.creditScore ?? 750,
    band: 'GOOD',
    delta: 12,
    factors: [
      { key: 'payment_history', rating: 'EXCELLENT', detail: '100% on-time payments in the last 36 months.' },
      { key: 'credit_mix', rating: 'FAIR', detail: 'You mostly have unsecured personal loans.' },
      { key: 'hard_enquiries', rating: 'HIGH_IMPACT', detail: '3 enquiries in the last 30 days.' },
    ],
    updatedAt: '2023-10-12',
    bureau: 'TransUnion CIBIL',
  });
}));

/** Delete account (right to erasure). */
usersRouter.delete('/me', ah(async (req, res) => {
  await prisma.user.delete({ where: { id: req.user!.sub } });
  res.json({ ok: true });
}));
