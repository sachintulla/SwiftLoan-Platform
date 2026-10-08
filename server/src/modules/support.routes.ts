import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, HttpError } from '../middleware/error.js';
import { scoped } from '../lib/log.js';
import { TICKET_CATEGORIES, ticketRef, sendTicketNotification } from '../lib/supportTickets.js';

const log = scoped('support');

export const supportRouter = Router();
supportRouter.use(requireAuth);

/** Shape returned to the customer — adds the public reference. */
function present<T extends { ticketNo: number }>(t: T) {
  return { ...t, ref: ticketRef(t.ticketNo) };
}

const MAX_PER_10_MIN = 3;
const MAX_PER_DAY = 10;

supportRouter.post('/tickets',
  validate(z.object({
    type: z.enum(['query', 'grievance']).default('query'),
    category: z.enum(TICKET_CATEGORIES).default('other'),
    subject: z.string().trim().min(3).max(200),
    // Optional for backward compatibility (the mobile app's createTicket sends only a subject);
    // the website form requires a real description client-side.
    body: z.string().trim().max(5000).optional(),
    applicationId: z.string().uuid().optional(),
  })),
  ah(async (req, res) => {
    const userId = req.user!.sub;

    // Cheap spam guard — a customer rarely needs more than a couple of open tickets.
    const now = Date.now();
    const [recent, today] = await Promise.all([
      prisma.supportTicket.count({ where: { userId, createdAt: { gte: new Date(now - 10 * 60_000) } } }),
      prisma.supportTicket.count({ where: { userId, createdAt: { gte: new Date(now - 24 * 3600_000) } } }),
    ]);
    if (recent >= MAX_PER_10_MIN || today >= MAX_PER_DAY) {
      throw new HttpError(429, 'You have raised several tickets recently. Please wait a little before raising another.');
    }

    // The linked application must be the caller's own.
    let application: { ref: string; amount: number; status: string } | null = null;
    if (req.body.applicationId) {
      const app = await prisma.loanApplication.findFirst({
        where: { id: req.body.applicationId, userId },
        select: { ref: true, amount: true, status: true },
      });
      if (!app) throw new HttpError(404, 'Application not found');
      application = app;
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        type: req.body.type,
        category: req.body.category,
        subject: req.body.subject,
        body: req.body.body,
        applicationId: req.body.applicationId ?? null,
      },
    });
    log.info('ticket created', { id: ticket.id, ref: ticketRef(ticket.ticketNo), userId, type: ticket.type, category: ticket.category });

    // Respond first; the notification email must never delay or fail the request.
    res.status(201).json({ ticket: present(ticket) });

    void (async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, fullName: true, phone: true, email: true },
        });
        if (!user) return;
        const result = await sendTicketNotification({
          ticketNo: ticket.ticketNo,
          id: ticket.id,
          type: ticket.type,
          category: ticket.category,
          subject: ticket.subject,
          body: ticket.body,
          status: ticket.status,
          createdAt: ticket.createdAt,
          user,
          application,
        });
        await prisma.supportTicket.update({
          where: { id: ticket.id },
          data: result.sent ? { emailSentAt: new Date(), emailError: null } : { emailError: (result.reason ?? 'not sent').slice(0, 300) },
        });
      } catch (e) {
        log.error('ticket notification failed', { id: ticket.id, error: (e as Error).message });
      }
    })();
  }));

supportRouter.get('/tickets', ah(async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: 'desc' },
    take: 50,
    // The customer doesn't need our email-delivery bookkeeping.
    select: { id: true, ticketNo: true, type: true, category: true, subject: true, body: true, status: true, applicationId: true, adminNote: true, createdAt: true, updatedAt: true, resolvedAt: true },
  });
  res.json({ tickets: tickets.map(present) });
}));

supportRouter.get('/tickets/:id', ah(async (req, res) => {
  const t = await prisma.supportTicket.findFirst({
    where: { id: String(req.params.id), userId: req.user!.sub },
    select: { id: true, ticketNo: true, type: true, category: true, subject: true, body: true, status: true, applicationId: true, adminNote: true, createdAt: true, updatedAt: true, resolvedAt: true },
  });
  if (!t) throw new HttpError(404, 'Ticket not found');
  res.json({ ticket: present(t) });
}));
