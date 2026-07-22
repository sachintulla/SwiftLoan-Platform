import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, HttpError } from '../middleware/error.js';

export const loansRouter = Router();
loansRouter.use(requireAuth);

loansRouter.get('/', ah(async (req, res) => {
  const loans = await prisma.loan.findMany({ where: { userId: req.user!.sub }, orderBy: { disbursedAt: 'desc' } });
  res.json({ loans });
}));

loansRouter.get('/:id', ah(async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id }, include: { repayments: { orderBy: { dueDate: 'asc' } } } });
  if (!loan || loan.userId !== req.user!.sub) throw new HttpError(404, 'Loan not found');
  const repaid = loan.repayments.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
  const progress = Math.round((repaid / (loan.emiAmount * loan.tenureMonths)) * 100);
  res.json({ loan, summary: { repaid, outstanding: loan.outstanding, progressPct: progress } });
}));

loansRouter.get('/:id/repayments', ah(async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan || loan.userId !== req.user!.sub) throw new HttpError(404, 'Loan not found');
  const repayments = await prisma.repayment.findMany({ where: { loanId: loan.id }, orderBy: { dueDate: 'asc' } });
  res.json({ repayments });
}));

loansRouter.post('/:id/repayments/:rid/pay', ah(async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan || loan.userId !== req.user!.sub) throw new HttpError(404, 'Loan not found');
  const r = await prisma.repayment.update({ where: { id: req.params.rid }, data: { status: 'paid', paidDate: new Date() } });
  await prisma.loan.update({ where: { id: loan.id }, data: { outstanding: Math.max(0, loan.outstanding - r.amount) } });
  res.json({ repayment: r });
}));
