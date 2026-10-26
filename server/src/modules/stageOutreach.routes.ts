/**
 * Stage outreach — the "one screen per stage" view of every follow-up a customer
 * gets (WhatsApp, SMS, Ello call), when it goes out and what data goes with it.
 *
 * Mounted at /api/admin/stage-outreach behind requireAdmin. Timing and on/off
 * remain on the stall rules (PATCH /api/admin/stall-rules/:id); this adds the
 * read model that joins them to the templates and call settings, and the one
 * write that stall rules have no field for: the call's agent and stage brief.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { getProviderConfig, upsertProviderConfig } from '../lib/integrations.js';
import { AGENT_ROLES, AGENT_ROLE_INFO, agentRoleStatus } from '../lib/agents.js';
import { timing } from '../lib/timings.js';
import { nudgesDisabled } from '../jobs/tracking.jobs.js';
import {
  OUTREACH_STAGES, VARIABLE_LIST, MAX_BRIEF_LENGTH, isOutreachStage, normalizeStageCalls,
} from '../lib/stageOutreach.js';
import { scoped } from '../lib/log.js';

const log = scoped('stage-outreach');

export const stageOutreachRouter = Router();
stageOutreachRouter.use(requireAdmin);
stageOutreachRouter.use(requireActiveAdmin);
stageOutreachRouter.use(auditAdmin);

interface StallTemplate { template?: string; language?: string; placeholders?: string[] }

// GET /api/admin/stage-outreach
stageOutreachRouter.get('/', ah(async (_req, res) => {
  const keys = OUTREACH_STAGES.map((s) => s.key);
  const [rules, vox, meta, ello, agentStatus] = await Promise.all([
    prisma.stallRule.findMany({ where: { triggerEvent: { in: keys } }, orderBy: [{ delayMinutes: 'asc' }, { createdAt: 'asc' }] }),
    getProviderConfig('voxvalley'),
    getProviderConfig('meta_whatsapp'),
    getProviderConfig('ello'),
    agentRoleStatus(),
  ]);

  const stallTemplates = (vox.settings.stallTemplates ?? {}) as Record<string, StallTemplate>;
  const stageCalls = normalizeStageCalls(ello.settings.stageCalls);
  const agentIdByRole = new Map(agentStatus.map((a) => [a.role, a.agentId]));
  const defaultAgentId = agentIdByRole.get('leadCallback') ?? null;

  const stages = OUTREACH_STAGES.map((stage) => {
    const call = stageCalls[stage.key] ?? {};
    const activities = rules
      .filter((r) => r.triggerEvent === stage.key)
      .map((r) => {
        const base = {
          ruleId: r.id,
          name: r.name,
          channel: r.channel,
          delayMinutes: r.delayMinutes,
          cooldownMinutes: r.cooldownMinutes,
          enabled: r.enabled,
          expectedEvent: r.expectedEvent,
          lastFiredAt: r.lastFiredAt,
          firedCount: r.firedCount,
        };
        if (r.channel === 'whatsapp') {
          const t = stallTemplates[stage.key];
          return { ...base, whatsapp: t?.template ? { template: t.template, language: t.language ?? 'en', placeholders: t.placeholders ?? [] } : null };
        }
        if (r.channel === 'voice') {
          const role = call.agentRole ?? 'leadCallback';
          return {
            ...base,
            call: {
              agentRole: call.agentRole ?? null,
              assistantId: call.assistantId ?? '',
              brief: call.brief ?? '',
              effectiveAgentId: call.assistantId || agentIdByRole.get(role) || defaultAgentId,
            },
          };
        }
        if (r.channel === 'push') return { ...base, push: { upshotEvent: r.upshotEvent } };
        return base;
      });
    return { ...stage, activities };
  });

  return ok(res, {
    stages,
    variables: VARIABLE_LIST,
    agentRoles: AGENT_ROLES.map((role) => ({ role, ...AGENT_ROLE_INFO[role] })),
    maxBriefLength: MAX_BRIEF_LENGTH,
    gates: {
      callsAutomatic: timing.bool('calls.nudgeEnabled'),
      testNumbersOnly: timing.phones('calls.allowedNumbers').length,
      nudgesDisabled: nudgesDisabled(),
      elloConnected: ello.enabled,
      whatsappConnected: vox.enabled || meta.enabled,
    },
  }, 'Stage outreach');
}));

const callSchema = z.object({
  agentRole: z.enum(AGENT_ROLES).nullable().optional(),
  assistantId: z.string().trim().max(80).optional(),
  brief: z.string().max(MAX_BRIEF_LENGTH).optional(),
});

// PUT /api/admin/stage-outreach/:stage/call
stageOutreachRouter.put('/:stage/call', requireRole(...CAN_ADMINISTER), validate(callSchema), ah(async (req, res) => {
  const { stage } = req.params;
  if (!isOutreachStage(stage)) throw new HttpError(404, 'Unknown stage');
  const body = req.body as z.infer<typeof callSchema>;
  const admin = (req as unknown as { admin?: { id?: string; email?: string } }).admin;

  const ello = await getProviderConfig('ello');
  const all = normalizeStageCalls(ello.settings.stageCalls);
  // Replace this stage wholesale; an all-empty body clears it back to the defaults.
  const next = normalizeStageCalls({ ...all, [stage]: body });
  await upsertProviderConfig('ello', { settings: { stageCalls: next } }, admin?.email ?? admin?.id);
  log.info('stage call saved', { stage, updatedBy: admin?.email ?? admin?.id ?? null, cleared: !next[stage] });
  return ok(res, { stage, call: next[stage] ?? null }, 'Stage call saved');
}));
