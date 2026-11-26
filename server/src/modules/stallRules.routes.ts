/**
 * WS5d — edit or delete one step-stall rule. Used by Configs → Stage outreach,
 * which lists and creates rules through its own API (stageOutreach.routes.ts).
 *
 * Mounted at /api/admin/stall-rules behind requireAdmin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, fail } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { JOURNEY_EVENTS } from '../lib/journey.js';
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
