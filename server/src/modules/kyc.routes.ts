import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah } from '../middleware/error.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';
import type { KycMethod } from '@prisma/client';

/** Every method that must be verified before KYC counts as complete. */
const KYC_METHODS: KycMethod[] = ['aadhaar', 'pan', 'bank', 'selfie'];

export const kycRouter = Router();
kycRouter.use(requireAuth);

/**
 * Submit a KYC method (aadhaar/pan/bank/selfie). No verification vendor is wired
 * up yet, so every submission is stored as genuinely 'pending' — it must not be
 * auto-marked verified until a real KYC provider is integrated.
 */
kycRouter.post('/:method',
  validate(z.object({ applicationId: z.string().uuid().optional(), reference: z.string().optional() })),
  ah(async (req, res) => {
    const method = req.params.method as any;
    const rec = await prisma.kycVerification.upsert({
      where: { userId_method_applicationId: { userId: req.user!.sub, method, applicationId: req.body.applicationId ?? null as any } },
      update: { status: 'pending', verifiedAt: null, reference: req.body.reference },
      create: { userId: req.user!.sub, method, applicationId: req.body.applicationId, reference: req.body.reference, status: 'pending' },
    }).catch(async () => {
      // fallback when applicationId is null (composite unique with null)
      return prisma.kycVerification.create({ data: { userId: req.user!.sub, method, applicationId: req.body.applicationId, reference: req.body.reference, status: 'pending' } });
    });
    // WS5: emit KYC_STARTED once (on the first submitted method) and
    // KYC_COMPLETED once (every method has been submitted). The client used to
    // fire "kyc_submitted" on arrival at each of the four sub-screens, which
    // meant four events and no way to tell who actually finished.
    void (async () => {
      const submitted = await prisma.kycVerification.findMany({
        where: { userId: req.user!.sub, status: { in: ['pending', 'verified'] } },
        select: { method: true },
      });
      const done = new Set(submitted.map((v) => v.method));
      const isFirst = done.size === 1;
      const isComplete = KYC_METHODS.every((m) => done.has(m));
      if (!isFirst && !isComplete) return;
      await trackJourney(
        { userId: req.user!.sub },
        {
          channel: 'app',
          name: isComplete ? JOURNEY_EVENTS.KYC_COMPLETED : JOURNEY_EVENTS.KYC_STARTED,
          metadata: { method, completed: [...done] },
        },
      );
    })().catch(() => {});

    res.status(201).json({ verification: rec });
  }));

kycRouter.get('/', ah(async (req, res) => {
  const items = await prisma.kycVerification.findMany({ where: { userId: req.user!.sub }, orderBy: { createdAt: 'desc' } });
  res.json({ verifications: items });
}));
