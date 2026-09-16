import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah } from '../middleware/error.js';
import { scoped } from '../lib/log.js';

const log = scoped('support');

export const supportRouter = Router();
supportRouter.use(requireAuth);

supportRouter.post('/tickets',
  validate(z.object({ type: z.enum(['query', 'grievance']).default('query'), subject: z.string().min(3), body: z.string().optional() })),
  ah(async (req, res) => {
    const ticket = await prisma.supportTicket.create({ data: { ...req.body, userId: req.user!.sub } });
    log.info('ticket created', { id: ticket.id, userId: req.user!.sub, type: ticket.type });
    res.status(201).json({ ticket });
  }));

supportRouter.get('/tickets', ah(async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({ where: { userId: req.user!.sub }, orderBy: { createdAt: 'desc' } });
  res.json({ tickets });
}));
