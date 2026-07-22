import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah } from '../middleware/error.js';

export const kycRouter = Router();
kycRouter.use(requireAuth);

/** Submit a KYC method (aadhaar/pan/bank/selfie). Mock verification = verified. */
kycRouter.post('/:method',
  validate(z.object({ applicationId: z.string().uuid().optional(), reference: z.string().optional() })),
  ah(async (req, res) => {
    const method = req.params.method as any;
    const rec = await prisma.kycVerification.upsert({
      where: { userId_method_applicationId: { userId: req.user!.sub, method, applicationId: req.body.applicationId ?? null as any } },
      update: { status: 'verified', verifiedAt: new Date(), reference: req.body.reference },
      create: { userId: req.user!.sub, method, applicationId: req.body.applicationId, reference: req.body.reference, status: 'verified', verifiedAt: new Date() },
    }).catch(async () => {
      // fallback when applicationId is null (composite unique with null)
      return prisma.kycVerification.create({ data: { userId: req.user!.sub, method, applicationId: req.body.applicationId, reference: req.body.reference, status: 'verified', verifiedAt: new Date() } });
    });
    res.status(201).json({ verification: rec });
  }));

kycRouter.get('/', ah(async (req, res) => {
  const items = await prisma.kycVerification.findMany({ where: { userId: req.user!.sub }, orderBy: { createdAt: 'desc' } });
  res.json({ verifications: items });
}));
