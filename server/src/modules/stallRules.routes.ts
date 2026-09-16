/**
 * WS5d — dashboard control over the step-stall rules that fire Upshot events.
 *
 * Mounted at /api/admin/stall-rules behind requireAdmin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created, fail } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { JOURNEY_EVENTS } from '../lib/journey.js';
import { seedStallRules, evaluateRule, stepStallDetector } from '../lib/stallRules.js';
import { scoped } from '../lib/log.js';

const log = scoped('stall-rules');

export const stallRulesRouter = Router();
stallRulesRouter.use(requireAdmin);
stallRulesRouter.use(requireActiveAdmin);
stallRulesRouter.use(auditAdmin);



const EVENT_NAMES = Object.values(JOURNEY_EVENTS) as [string, ...string[]];

const ruleShape = {
  name: z.string().min(1).max(120),
  triggerEvent: z.enum(EVENT_NAMES),
  expectedEvent: z.enum(EVENT_NAMES),
  delayMinutes: z.number().int().min(1).max(20160),
  upshotEvent: z.string().min(1).max(120),
  channel: z.enum(['push', 'whatsapp', 'sms', 'email', 'voice']).optional(),
  cooldownMinutes: z.number().int().min(1).max(20160).optional(),
  enabled: z.boolean().optional(),
};

// GET /api/admin/stall-rules — list + the event vocabulary the UI needs
stallRulesRouter.get('/', ah(async (_req, res) => {
  const rules = await prisma.stallRule.findMany({ orderBy: [{ enabled: 'desc' }, { delayMinutes: 'asc' }] });
  return ok(res, { rules, events: Object.values(JOURNEY_EVENTS) }, 'Stall rules');
}));

// POST /api/admin/stall-rules
stallRulesRouter.post('/', requireRole(...CAN_WRITE), validate(z.object(ruleShape)), ah(async (req, res) => {
  const b = req.body as Record<string, any>;
  if (b.triggerEvent === b.expectedEvent) {
    return fail(res, 400, 'The trigger and expected events must differ');
  }
  try {
    const rule = await prisma.stallRule.create({ data: b as any });
    log.info('rule created', { id: rule.id, name: rule.name, triggerEvent: rule.triggerEvent, expectedEvent: rule.expectedEvent });
    return created(res, rule, 'Rule created');
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return fail(res, 409, 'A rule for that trigger/expected pair already exists');
    }
    throw e;
  }
}));

// PATCH /api/admin/stall-rules/:id
stallRulesRouter.patch(
  '/:id',
  validate(z.object(Object.fromEntries(Object.entries(ruleShape).map(([k, v]) => [k, (v as any).optional()])) as any)),
  ah(async (req, res) => {
    const existing = await prisma.stallRule.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 404, 'Rule not found');
    const b = req.body as Record<string, any>;
    const trigger = b.triggerEvent ?? existing.triggerEvent;
    const expected = b.expectedEvent ?? existing.expectedEvent;
    if (trigger === expected) return fail(res, 400, 'The trigger and expected events must differ');
    const rule = await prisma.stallRule.update({ where: { id: existing.id }, data: b as any });
    log.info('rule updated', { id: rule.id, fields: Object.keys(b) });
    return ok(res, rule, 'Rule updated');
  }),
);

// DELETE /api/admin/stall-rules/:id
stallRulesRouter.delete('/:id', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const existing = await prisma.stallRule.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, 404, 'Rule not found');
  await prisma.stallRule.delete({ where: { id: existing.id } });
  log.info('rule deleted', { id: existing.id, name: existing.name });
  return ok(res, { id: existing.id }, 'Rule deleted');
}));

// POST /api/admin/stall-rules/seed — install the starter set
stallRulesRouter.post('/seed', ah(async (_req, res) => {
  const count = await seedStallRules();
  log.info('seeded', { created: count });
  return ok(res, { created: count }, count ? `Seeded ${count} rule(s)` : 'Rules already present');
}));

// POST /api/admin/stall-rules/:id/run — evaluate one rule immediately.
// Lets an operator prove a rule works without waiting for the next tick.
stallRulesRouter.post('/:id/run', ah(async (req, res) => {
  const rule = await prisma.stallRule.findUnique({ where: { id: req.params.id } });
  if (!rule) return fail(res, 404, 'Rule not found');
  const fired = await evaluateRule({ ...rule, enabled: true });
  log.info('rule run manually', { id: rule.id, name: rule.name, fired });
  return ok(res, { fired }, fired ? `Queued ${fired} event(s)` : 'Nobody is currently stuck on this rule');
}));

// POST /api/admin/stall-rules/run-all
stallRulesRouter.post('/run-all', ah(async (_req, res) => {
  const fired = await stepStallDetector();
  log.info('all rules run', { fired });
  return ok(res, { fired }, `Queued ${fired} event(s)`);
}));

// GET /api/admin/stall-rules/queue — what has actually been sent to Upshot
stallRulesRouter.get('/queue', ah(async (_req, res) => {
  const [rows, byStatus] = await Promise.all([
    prisma.outboundRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.outboundRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  return ok(
    res,
    {
      recent: rows,
      counts: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    },
    'Outbound queue',
  );
}));
