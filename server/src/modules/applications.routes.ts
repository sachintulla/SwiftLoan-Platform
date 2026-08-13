import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, HttpError } from '../middleware/error.js';
import { makeRef } from '../utils/ref.js';
import { getLenderOfferProvider, takeAurixDebug, type RawLenderOffer } from '../lib/lenderOffers.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

/** Create a loan application (Step 1 — "Tell us about yourself"). */
applicationsRouter.post('/',
  validate(z.object({
    loanType: z.enum(['personal', 'business', 'home', 'education', 'vehicle']).default('personal'),
    amount: z.number().int().min(25000).max(1500000),
    tenureMonths: z.number().int().min(6).max(72).default(12),
    purpose: z.string().optional(),
    employment: z.enum(['salaried', 'self_employed', 'business_owner', 'gig_worker', 'student', 'retired', 'other']).optional(),
    monthlyIncome: z.number().int().optional(),
    residenceType: z.enum(['own', 'rented', 'family', 'company']).optional(),
  })),
  ah(async (req, res) => {
    const app = await prisma.loanApplication.create({
      data: { ...req.body, ref: makeRef(), userId: req.user!.sub, status: 'draft' },
    });
    res.status(201).json({ application: app });
  }));

/** List the user's applications. */
applicationsRouter.get('/', ah(async (req, res) => {
  const apps = await prisma.loanApplication.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: 'desc' },
    include: { offers: true, loan: true },
  });
  res.json({ applications: apps });
}));

/** Get one application with offers + loan. */
applicationsRouter.get('/:id', ah(async (req, res) => {
  const app = await owned(req.user!.sub, req.params.id);
  const full = await prisma.loanApplication.findUnique({
    where: { id: app.id },
    include: { offers: { include: { partner: true, emiOptions: true }, orderBy: { apr: 'asc' } }, loan: true, kyc: true },
  });
  res.json({ application: full });
}));

/** Update details / attach PAN (Step 2). */
applicationsRouter.patch('/:id',
  validate(z.object({
    amount: z.number().int().min(25000).max(1500000).optional(),
    tenureMonths: z.number().int().min(6).max(72).optional(),
    panNumber: z.string().length(10).optional(),
  })),
  ah(async (req, res) => {
    await owned(req.user!.sub, req.params.id);
    const app = await prisma.loanApplication.update({
      where: { id: req.params.id },
      data: { ...req.body, ...(req.body.panNumber ? { status: 'pan_pending' } : {}) },
    });
    res.json({ application: app });
  }));

/** Pre-qualify: soft-pull + generate ranked partner offers (finding → offers). */
applicationsRouter.post('/:id/prequalify', ah(async (req, res) => {
  const app = await owned(req.user!.sub, req.params.id);
  await prisma.offer.deleteMany({ where: { applicationId: app.id } });
  const partners = await prisma.lenderPartner.findMany({ where: { active: true }, take: 3, orderBy: { baseApr: 'asc' } });
  if (partners.length === 0) throw new HttpError(503, 'No lending partners configured — run the seed script');

  // Gather offers across partners. A provider whose single API call returns
  // many offers (Aurix → one per real lender) uses getOffers; others yield a
  // single offer. A partner that fails (provider down, no eligibility, a
  // validation reject from the real BRE) is skipped rather than failing the
  // whole run — we saw exactly this from Aurix's UAT ("No data found", "PAN
  // verification failed", etc.).
  const pending: Array<{ partner: (typeof partners)[number]; raw: RawLenderOffer }> = [];
  for (const p of partners) {
    try {
      const provider = getLenderOfferProvider(p);
      const list = provider.getOffers ? await provider.getOffers(p, app) : [await provider.getOffer(p, app)];
      for (const raw of list) pending.push({ partner: p, raw });
    } catch (e) {
      console.warn(`[prequalify] partner ${p.name} produced no offers: ${(e as Error).message}`);
    }
  }

  // Recommend the single lowest-APR offer across everything (0/undefined APRs
  // never win).
  let bestIdx = -1;
  let bestApr = Infinity;
  pending.forEach((x, i) => { if (x.raw.apr > 0 && x.raw.apr < bestApr) { bestApr = x.raw.apr; bestIdx = i; } });
  if (bestIdx === -1 && pending.length) bestIdx = 0;

  const created = await Promise.all(pending.map(async ({ partner: p, raw }, i) => {
    // Offer row's amount/apr/emi/tenureMonths stay a denormalized copy of the
    // recommended tenure option so /handoff keeps reading those scalars.
    const recommendedOption = raw.emiOptions.find(o => o.recommended) ?? raw.emiOptions[0];
    return prisma.offer.create({
      data: {
        applicationId: app.id,
        partnerId: p.id,
        amount: raw.amount,
        apr: raw.apr,
        emi: recommendedOption?.monthlyEmi ?? 0,
        tenureMonths: recommendedOption?.tenureMonths ?? app.tenureMonths,
        processingFee: raw.processingFeeAmount,
        processingFeeAmount: raw.processingFeeAmount,
        gstOnProcessingFee: raw.gstOnProcessingFee,
        netDisbursalAmount: raw.netDisbursalAmount,
        badgeText: raw.badgeText ?? p.tagline,
        tag: p.tagline,
        recommended: i === bestIdx,
        // Aurix passthrough — persisted for the later tile step; harmless nulls
        // for the mock provider.
        offerCode: raw.offerCode ?? null,
        offerType: raw.offerType ?? null,
        roi: raw.roi ?? null,
        offerLikelihood: raw.offerLikelihood ?? null,
        redirectionUrl: raw.redirectionUrl ?? null,
        lenderName: raw.lenderName ?? null,
        lenderLogoUrl: raw.lenderLogoUrl ?? null,
        externalPartnerId: raw.externalPartnerId ?? null,
        ...(raw.rawOffer !== undefined ? { rawOffer: raw.rawOffer as Prisma.InputJsonValue } : {}),
        emiOptions: raw.emiOptions.length ? { create: raw.emiOptions } : undefined,
      },
      include: { emiOptions: true, partner: true },
    });
  }));
  await prisma.loanApplication.update({ where: { id: app.id }, data: { status: 'offers_ready' } });

  // WS5: eligibility genuinely finished here (server-side truth). The client
  // previously only recorded "arrived at the offers screen", which is not the
  // same thing and misses everyone who never got that far.
  trackJourney(
    { userId: req.user!.sub },
    {
      channel: 'app',
      name: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED,
      metadata: { applicationId: app.id, offerCount: created.length },
    },
  ).catch(() => {});

  // Raw Aurix eligible_offers response (request/success/no-offers/validation),
  // surfaced so the app can show it in a debug alert. Null when Aurix wasn't hit.
  res.json({ offers: created, aurixResponse: takeAurixDebug(app.id) });
}));

/** List offers for an application. */
applicationsRouter.get('/:id/offers', ah(async (req, res) => {
  const app = await owned(req.user!.sub, req.params.id);
  const offers = await prisma.offer.findMany({ where: { applicationId: app.id }, include: { partner: true, emiOptions: true }, orderBy: { apr: 'asc' } });
  res.json({ offers });
}));

/** Select an offer (Step 3 → 4) — optionally the specific tenure the user picked. */
applicationsRouter.post('/:id/offers/:offerId/select',
  validate(z.object({ emiOptionId: z.string().uuid().optional() })),
  ah(async (req, res) => {
    const app = await owned(req.user!.sub, req.params.id);
    await prisma.offer.updateMany({ where: { applicationId: app.id }, data: { selected: false } });

    // If the user picked a specific tenure option, that becomes the Offer's
    // headline amount/emi/tenure — /handoff reads those scalars directly.
    let tenureOverride: { emi: number; tenureMonths: number } | undefined;
    if (req.body.emiOptionId) {
      const option = await prisma.offerEmiOption.findFirst({ where: { id: req.body.emiOptionId, offerId: req.params.offerId } });
      if (!option) throw new HttpError(404, 'EMI option not found for this offer');
      tenureOverride = { emi: option.monthlyEmi, tenureMonths: option.tenureMonths };
    }

    const offer = await prisma.offer.update({ where: { id: req.params.offerId }, data: { selected: true, ...tenureOverride } });
    await prisma.loanApplication.update({ where: { id: app.id }, data: { status: 'handoff' } });

    // WS5: the real selection, with which offer — the screen-arrival proxy the
    // client used could not say which lender or rate was chosen.
    trackJourney(
      { userId: req.user!.sub },
      {
        channel: 'app',
        name: JOURNEY_EVENTS.OFFER_SELECTED,
        metadata: {
          applicationId: app.id,
          offerId: offer.id,
          apr: offer.apr,
          amount: offer.amount,
          tenureMonths: offer.tenureMonths,
        },
      },
    ).catch(() => {});

    res.json({ offer });
  }));

/** Secure handoff → disburse: create the loan + repayment schedule. */
applicationsRouter.post('/:id/handoff', ah(async (req, res) => {
  const app = await owned(req.user!.sub, req.params.id);
  if (app.loan) throw new HttpError(409, 'Loan already created for this application');
  const offer = await prisma.offer.findFirst({ where: { applicationId: app.id, selected: true }, include: { partner: true } });
  if (!offer) throw new HttpError(400, 'Select an offer before handoff');

  const firstEmi = new Date(); firstEmi.setMonth(firstEmi.getMonth() + 1);
  const loan = await prisma.loan.create({
    data: {
      ref: makeRef(), userId: req.user!.sub, applicationId: app.id,
      partnerName: offer.partner.name, principal: offer.amount, apr: offer.apr,
      tenureMonths: offer.tenureMonths, emiAmount: offer.emi, outstanding: offer.amount,
      firstEmiDate: firstEmi, status: 'active',
    },
  });
  // Generate the repayment schedule.
  const rows = Array.from({ length: offer.tenureMonths }, (_, i) => {
    const due = new Date(firstEmi); due.setMonth(due.getMonth() + i);
    return { loanId: loan.id, ref: makeRef('PAY'), amount: offer.emi, dueDate: due, status: 'scheduled' as const };
  });
  await prisma.repayment.createMany({ data: rows });
  await prisma.loanApplication.update({ where: { id: app.id }, data: { status: 'disbursed' } });

  // WS5: application submitted then disbursed. Approval/rejection arrives from
  // the lender API later (out of scope per the brief) — when it does, emit
  // LOAN_APPROVED / LOAN_REJECTED from wherever that status lands.
  trackJourney(
    { userId: req.user!.sub },
    {
      channel: 'app',
      name: JOURNEY_EVENTS.APPLICATION_SUBMITTED,
      metadata: { applicationId: app.id },
    },
  )
    .then(() =>
      trackJourney(
        { userId: req.user!.sub },
        {
          channel: 'system',
          name: JOURNEY_EVENTS.LOAN_DISBURSED,
          metadata: { applicationId: app.id, loanId: loan.id, principal: loan.principal },
        },
      ),
    )
    .catch(() => {});

  res.status(201).json({ loan });
}));

async function owned(userId: string, id: string) {
  const app = await prisma.loanApplication.findUnique({ where: { id }, include: { loan: true } });
  if (!app || app.userId !== userId) throw new HttpError(404, 'Application not found');
  return app;
}
