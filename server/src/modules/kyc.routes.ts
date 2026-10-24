import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah } from '../middleware/error.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';
import type { KycMethod } from '@prisma/client';
import { scoped } from '../lib/log.js';
import { verifyPan, cachedPanForUser } from '../lib/panVerification.js';
import { loadPan } from '../lib/storedPan.js';
import { normalisePan } from '../lib/pii.js';
import { markPanVerified } from '../lib/installReminder.js';

const log = scoped('kyc');

/** Every method that must be verified before KYC counts as complete. */
const KYC_METHODS: KycMethod[] = ['aadhaar', 'pan', 'bank', 'selfie'];

export const kycRouter = Router();
kycRouter.use(requireAuth);

/**
 * Step 1 of the application: verify a PAN and get pre-fill details for step 2.
 * Answers from our DB whenever the PAN has been seen before; only a never-seen
 * PAN triggers the paid Aurix PAN Comprehensive call. See lib/panVerification.ts.
 * Registered before `/:method` so it isn't swallowed by it.
 */
kycRouter.post('/pan/verify',
  validate(z.object({ pan: z.string().trim().min(1).max(20) })),
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Capture the PAN already on file BEFORE verifying — a successful verify of a
    // different PAN would attach (replace) it, and we need the old one to tell the
    // client "this number is linked to PAN ••••••234A" so it can ask before letting
    // the entered PAN (and the old account's identity data) go forward mismatched.
    const onFileBefore = await cachedPanForUser(user.id); // verified PAN on file (masked) or null
    const onFilePanPlain = onFileBefore ? await loadPan(user.id) : ''; // in memory only, never returned
    const enteredNorm = normalisePan(req.body.pan);

    const result = await verifyPan(user, req.body.pan);
    // Website drop-off recovery: remember step 1 is done, and the first name for the app's greeting.
    // A no-op unless this user has an active website reminder; never blocks the response.
    if (result.verified) markPanVerified(user.id, result.prefill?.firstName).catch(() => {});

    const panOnFile = !!onFileBefore;
    const samePanOnFile = panOnFile && !!onFilePanPlain && onFilePanPlain === enteredNorm;
    res.json({
      success: true,
      data: { ...result, panOnFile, samePanOnFile, maskedPanOnFile: onFileBefore?.maskedPan ?? null },
      message: result.verified ? 'PAN verified' : (result.message ?? 'PAN could not be verified'),
    });
  }));

/**
 * The details for the PAN this user already verified (e.g. on the website), so the app can resume at
 * step 2 without asking for the PAN again. Never returns the PAN, only a masked form; no lender call.
 */
kycRouter.get('/pan/on-file',
  ah(async (req, res) => {
    const found = await cachedPanForUser(req.user!.sub);
    res.json({
      success: true,
      data: found
        ? { onFile: true, maskedPan: found.maskedPan, category: found.result.category, aadhaarLinked: found.result.aadhaarLinked, prefill: found.result.prefill }
        : { onFile: false },
      message: found ? 'PAN on file' : 'No verified PAN on file',
    });
  }));

/**
 * Submit a KYC method (aadhaar/pan/bank/selfie). No verification vendor is wired
 * up yet, so every submission is stored as genuinely 'pending' — it must not be
 * auto-marked verified until a real KYC provider is integrated.
 */
kycRouter.post('/:method',
  validate(z.object({ applicationId: z.string().uuid().optional(), reference: z.string().max(200).optional() })),
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
    log.info('method submitted', { userId: req.user!.sub, method, applicationId: req.body.applicationId ?? null });
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
      log.info(isComplete ? 'kyc completed' : 'kyc started', { userId: req.user!.sub, method, completed: [...done] });
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
