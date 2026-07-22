import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';

export const catalogRouter = Router();

/** Public lender-partner catalog. */
catalogRouter.get('/partners', ah(async (_req, res) => {
  const partners = await prisma.lenderPartner.findMany({ where: { active: true }, orderBy: { baseApr: 'asc' } });
  res.json({ partners });
}));
