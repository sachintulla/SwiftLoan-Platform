import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok, created } from '../lib/http.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { validate } from '../middleware/validate.js';

// Admin-curated, pre-application eligibility catalog shown on the app's
// home/fare screen ("Explore your loan options") — distinct from Offer, which
// is computed per-application only after a user actually applies.
export const preapprovedRouter = Router();

const planSchema = z.object({
  lenderName: z.string().min(1),
  logoUrl: z.string().url().optional().nullable(),
  icon: z.string().optional(),
  exploreUrl: z.string().url().optional().nullable(),
  badge: z.string().optional().nullable(),
  maxAmount: z.number().int().positive().optional().nullable(),
  amountAtApproval: z.boolean().optional(),
  rateMin: z.number().optional().nullable(),
  rateMax: z.number().optional().nullable(),
  rateAtApproval: z.boolean().optional(),
  tenureMinMonths: z.number().int().positive().optional().nullable(),
  tenureMaxMonths: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
  displayOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

/**
 * GET /api/market-loan-offers — public, active only, admin-ordered. For the app
 * dashboard's "Available offers". `/api/preapproved-plans` is kept as an alias
 * so already-installed app builds keep working after the rename.
 */
preapprovedRouter.get(
  ['/api/market-loan-offers', '/api/preapproved-plans'],
  ah(async (_req, res) => {
    const offers = await prisma.marketLoanOffer.findMany({
      where: { active: true },
      orderBy: { displayOrder: 'asc' },
    });
    return ok(res, offers, 'Available loan offers');
  }),
);

/** GET /api/admin/preapproved-plans — admin list, includes inactive. */
preapprovedRouter.get(
  '/api/admin/preapproved-plans',
  requireAdmin,
  ah(async (_req, res) => {
    const plans = await prisma.marketLoanOffer.findMany({ orderBy: { displayOrder: 'asc' } });
    return ok(res, plans, 'Pre-approved plans');
  }),
);

/** POST /api/admin/preapproved-plans — create. */
preapprovedRouter.post(
  '/api/admin/preapproved-plans',
  requireAdmin,
  validate(planSchema),
  ah(async (req, res) => {
    const plan = await prisma.marketLoanOffer.create({ data: req.body });
    return created(res, plan, 'Plan created');
  }),
);

/** PUT /api/admin/preapproved-plans/:id — update. */
preapprovedRouter.put(
  '/api/admin/preapproved-plans/:id',
  requireAdmin,
  validate(planSchema.partial()),
  ah(async (req, res) => {
    const existing = await prisma.marketLoanOffer.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Plan not found');
    const plan = await prisma.marketLoanOffer.update({ where: { id: req.params.id }, data: req.body });
    return ok(res, plan, 'Plan updated');
  }),
);

/** DELETE /api/admin/preapproved-plans/:id — hard delete. */
preapprovedRouter.delete(
  '/api/admin/preapproved-plans/:id',
  requireAdmin,
  ah(async (req, res) => {
    const existing = await prisma.marketLoanOffer.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Plan not found');
    await prisma.marketLoanOffer.delete({ where: { id: req.params.id } });
    return ok(res, null, 'Plan deleted');
  }),
);
