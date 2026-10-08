/**
 * Admin support-ticket desk. Mounted at /api/admin/support.
 *
 * Tickets are raised by customers from the website's Support page (and the
 * mobile app) via /api/support/tickets; this is where the team works them.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE } from '../middleware/adminAuth.js';
import { validate } from '../middleware/validate.js';
import { scoped } from '../lib/log.js';
import { categoryLabel, ticketRef, sendTicketNotification, TICKET_CATEGORIES } from '../lib/supportTickets.js';
import { mailConfigured } from '../lib/mail.js';

const log = scoped('admin-support');

export const adminSupportRouter = Router();
adminSupportRouter.use(requireAdmin);
adminSupportRouter.use(requireActiveAdmin);
adminSupportRouter.use(auditAdmin);

const STATUSES = ['open', 'in_progress', 'resolved'] as const;

const userSelect = { id: true, fullName: true, phone: true, email: true } as const;

function shape<T extends { ticketNo: number; category: string }>(t: T) {
  return { ...t, ref: ticketRef(t.ticketNo), categoryLabel: categoryLabel(t.category) };
}

// GET /api/admin/support?status=&type=&category=&search=&page=
adminSupportRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 20);
  const q = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (q.status && (STATUSES as readonly string[]).includes(q.status)) where.status = q.status;
  if (q.type === 'query' || q.type === 'grievance') where.type = q.type;
  if (q.category && (TICKET_CATEGORIES as readonly string[]).includes(q.category)) where.category = q.category;
  if (q.search) {
    const s = q.search.trim();
    // "SL-T-00042", "#42" or "42" → jump straight to the ticket number.
    const num = /^(?:sl-t-|#)?0*(\d{1,9})$/i.exec(s);
    where.OR = [
      ...(num ? [{ ticketNo: Number(num[1]) }] : []),
      { subject: { contains: s, mode: 'insensitive' } },
      { body: { contains: s, mode: 'insensitive' } },
      { user: { phone: { contains: s } } },
      { user: { fullName: { contains: s, mode: 'insensitive' } } },
      { user: { email: { contains: s, mode: 'insensitive' } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take,
      include: { user: { select: userSelect } },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return ok(res, rows.map(shape), 'OK', paginate(page, pageSize, total));
}));

// GET /api/admin/support/summary — counts for the filter chips and nav badge.
adminSupportRouter.get('/summary', ah(async (_req, res) => {
  const grouped = await prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } });
  const by = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const grievancesOpen = await prisma.supportTicket.count({ where: { type: 'grievance', status: { not: 'resolved' } } });
  return ok(res, {
    open: by.open ?? 0,
    in_progress: by.in_progress ?? 0,
    resolved: by.resolved ?? 0,
    total: Object.values(by).reduce((a, b) => a + b, 0),
    /** Open + in progress — what still needs a human. */
    needsAction: (by.open ?? 0) + (by.in_progress ?? 0),
    grievancesOpen,
    mailConfigured: mailConfigured(),
  });
}));

// GET /api/admin/support/:id
adminSupportRouter.get('/:id', ah(async (req, res) => {
  const t = await prisma.supportTicket.findUnique({
    where: { id: String(req.params.id) },
    include: { user: { select: { ...userSelect, createdAt: true } } },
  });
  if (!t) throw new HttpError(404, 'Ticket not found');
  const application = t.applicationId
    ? await prisma.loanApplication.findUnique({
        where: { id: t.applicationId },
        select: { id: true, ref: true, amount: true, status: true, tenureMonths: true, createdAt: true },
      })
    : null;
  // Other tickets from the same customer — context for the agent.
  const others = await prisma.supportTicket.findMany({
    where: { userId: t.userId, id: { not: t.id } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, ticketNo: true, category: true, subject: true, status: true, createdAt: true },
  });
  return ok(res, { ...shape(t), application, otherTickets: others.map(shape) });
}));

// PATCH /api/admin/support/:id  { status?, adminNote? }
adminSupportRouter.patch('/:id',
  requireRole(...CAN_WRITE),
  validate(z.object({
    status: z.enum(STATUSES).optional(),
    adminNote: z.string().trim().max(2000).nullable().optional(),
  }).refine((b) => b.status !== undefined || b.adminNote !== undefined, { message: 'Nothing to update' })),
  ah(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) throw new HttpError(404, 'Ticket not found');

    const data: Record<string, unknown> = {};
    if (req.body.status !== undefined) {
      data.status = req.body.status;
      data.resolvedAt = req.body.status === 'resolved' ? new Date() : null;
    }
    if (req.body.adminNote !== undefined) data.adminNote = req.body.adminNote || null;

    const t = await prisma.supportTicket.update({ where: { id }, data, include: { user: { select: userSelect } } });
    log.info('ticket updated', { id, ref: ticketRef(t.ticketNo), from: existing.status, to: t.status });
    return ok(res, shape(t), 'Ticket updated');
  }));

// POST /api/admin/support/:id/resend-email — retry the notification mail.
adminSupportRouter.post('/:id/resend-email', requireRole(...CAN_WRITE), ah(async (req, res) => {
  const id = String(req.params.id);
  const t = await prisma.supportTicket.findUnique({ where: { id }, include: { user: { select: userSelect } } });
  if (!t) throw new HttpError(404, 'Ticket not found');
  const application = t.applicationId
    ? await prisma.loanApplication.findUnique({ where: { id: t.applicationId }, select: { ref: true, amount: true, status: true } })
    : null;
  const result = await sendTicketNotification({
    ticketNo: t.ticketNo, id: t.id, type: t.type, category: t.category, subject: t.subject, body: t.body,
    status: t.status, createdAt: t.createdAt, user: t.user, application,
  });
  await prisma.supportTicket.update({
    where: { id },
    data: result.sent ? { emailSentAt: new Date(), emailError: null } : { emailError: (result.reason ?? 'not sent').slice(0, 300) },
  });
  if (!result.sent) throw new HttpError(502, `Email not sent: ${result.reason ?? 'unknown error'}`);
  return ok(res, { sent: true }, 'Email sent');
}));
