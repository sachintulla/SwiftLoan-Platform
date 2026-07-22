import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, HttpError } from '../middleware/error.js';
import { makeRef } from '../utils/ref.js';
import { emi } from '../utils/emi.js';

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
  const full = await prisma.loanApplication.findUnique({ where: { id: app.id }, include: { offers: { include: { partner: true } }, loan: true, kyc: true } });
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

  const created = await Promise.all(partners.map((p, i) => {
    const apr = p.baseApr;
    return prisma.offer.create({
      data: {
        applicationId: app.id,
        partnerId: p.id,
        amount: app.amount,
        apr,
        emi: emi(app.amount, app.tenureMonths, apr),
        tenureMonths: app.tenureMonths,
        processingFee: p.processingFee,
        tag: p.tagline,
        recommended: i === 0, // lowest APR
      },
    });
  }));
  await prisma.loanApplication.update({ where: { id: app.id }, data: { status: 'offers_ready' } });
  res.json({ offers: created });
}));

/** List offers for an application. */
applicationsRouter.get('/:id/offers', ah(async (req, res) => {
  const app = await owned(req.user!.sub, req.params.id);
  const offers = await prisma.offer.findMany({ where: { applicationId: app.id }, include: { partner: true }, orderBy: { apr: 'asc' } });
  res.json({ offers });
}));

/** Select an offer (Step 3 → 4). */
applicationsRouter.post('/:id/offers/:offerId/select', ah(async (req, res) => {
  const app = await owned(req.user!.sub, req.params.id);
  await prisma.offer.updateMany({ where: { applicationId: app.id }, data: { selected: false } });
  const offer = await prisma.offer.update({ where: { id: req.params.offerId }, data: { selected: true } });
  await prisma.loanApplication.update({ where: { id: app.id }, data: { status: 'handoff' } });
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
  res.status(201).json({ loan });
}));

async function owned(userId: string, id: string) {
  const app = await prisma.loanApplication.findUnique({ where: { id }, include: { loan: true } });
  if (!app || app.userId !== userId) throw new HttpError(404, 'Application not found');
  return app;
}
