import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok, created } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { validate } from '../middleware/validate.js';
import { scoped } from '../lib/log.js';

const log = scoped('prequalifying');

// Admin-curated, firm "pre-approved for you" offers shown at the top of the home
// screen the moment a user logs in — independent of the application funnel.
// Distinct from MarketLoanOffer (the soft marketing catalog under "Available
// offers"): firm economics, and the app's Accept path skips Aurix eligibility.
export const prequalifyingRouter = Router();

const offerSchema = z.object({
  lenderName: z.string().min(1),
  logoUrl: z.string().url().optional().nullable(),
  icon: z.string().optional(),
  badge: z.string().optional().nullable(),
  amount: z.number().int().positive(), // paise
  rate: z.number().nonnegative(),
  tenureMonths: z.number().int().positive(),
  processingFeePercent: z.number().nonnegative().optional().nullable(),
  redirectionUrl: z.string().url().optional().nullable(),
  terms: z.string().optional().nullable(),
  validTill: z.coerce.date().optional().nullable(),
  displayOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

/**
 * GET /api/prequalifying-offers — the app read. Auth'd (shown on login),
 * active + unexpired only, admin-ordered.
 */
prequalifyingRouter.get(
  '/api/prequalifying-offers',
  requireAuth,
  ah(async (_req, res) => {
    const now = new Date();
    const offers = await prisma.prequalifyingOffer.findMany({
      where: { active: true, OR: [{ validTill: null }, { validTill: { gt: now } }] },
      orderBy: { displayOrder: 'asc' },
    });
    return ok(res, offers, 'Pre-qualifying offers');
  }),
);

/** GET /api/admin/prequalifying-offers — admin list, includes inactive/expired. */
prequalifyingRouter.get(
  '/api/admin/prequalifying-offers',
  requireAdmin,
  ah(async (_req, res) => {
    const offers = await prisma.prequalifyingOffer.findMany({ orderBy: { displayOrder: 'asc' } });
    return ok(res, offers, 'Pre-qualifying offers');
  }),
);

/** POST /api/admin/prequalifying-offers — create. */
prequalifyingRouter.post(
  '/api/admin/prequalifying-offers',
  requireAdmin,
  validate(offerSchema),
  ah(async (req, res) => {
    const offer = await prisma.prequalifyingOffer.create({ data: req.body });
    log.info('offer created', { id: offer.id, lenderName: offer.lenderName });
    return created(res, offer, 'Pre-qualifying offer created');
  }),
);

/** PUT /api/admin/prequalifying-offers/:id — update. */
prequalifyingRouter.put(
  '/api/admin/prequalifying-offers/:id',
  requireAdmin,
  validate(offerSchema.partial()),
  ah(async (req, res) => {
    const existing = await prisma.prequalifyingOffer.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Offer not found');
    const offer = await prisma.prequalifyingOffer.update({ where: { id: req.params.id }, data: req.body });
    log.info('offer updated', { id: offer.id, fields: Object.keys(req.body) });
    return ok(res, offer, 'Pre-qualifying offer updated');
  }),
);

/** DELETE /api/admin/prequalifying-offers/:id — hard delete. */
prequalifyingRouter.delete(
  '/api/admin/prequalifying-offers/:id',
  requireAdmin,
  ah(async (req, res) => {
    const existing = await prisma.prequalifyingOffer.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Offer not found');
    await prisma.prequalifyingOffer.delete({ where: { id: req.params.id } });
    log.info('offer deleted', { id: existing.id, lenderName: existing.lenderName });
    return ok(res, null, 'Pre-qualifying offer deleted');
  }),
);
