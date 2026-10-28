/**
 * Stage outreach — the one page that configures every follow-up a customer gets
 * at each journey stage, on any channel (WhatsApp, SMS, email, Ello call, push).
 *
 * Mounted at /api/admin/stage-outreach behind requireAdmin. Timing and on/off
 * stay on the stall rules, so Notification Rules and this page can never
 * disagree. What the rule cannot hold is stored where the senders already read
 * it: WhatsApp templates and SMS overrides in the Voxvalley settings, the call's
 * agent and brief in the Ello settings. This router is the read model that joins
 * them, plus the writes for each.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { getProviderConfig, upsertProviderConfig, DEFAULT_SETTINGS } from '../lib/integrations.js';
import { AGENT_ROLES, AGENT_ROLE_INFO, agentRoleStatus } from '../lib/agents.js';
import { timing } from '../lib/timings.js';
import { nudgesDisabled } from '../jobs/tracking.jobs.js';
import {
  OUTREACH_STAGES, OUTREACH_CHANNELS, VARIABLE_LIST, MAX_BRIEF_LENGTH, isOutreachStage, normalizeStageCalls,
  cleanWhatsApp, cleanSms, defaultCooldownMinutes, FLOW_STEPS, RULE_SURFACES, type OutreachChannel, type RuleSurface,
} from '../lib/stageOutreach.js';
import { normalizeSummaryConfig, SUMMARY_TOKENS } from '../lib/conversationSummary.js';
import { OFFERS_NOTICE_TOKENS } from '../lib/offersNotice.js';
import { WHATSAPP_TEMPLATES, LEGACY_TEMPLATES, previewBody, toMetaPayload, recommendedForStage, templateByName } from '../lib/whatsappTemplates.js';
import { categoryForTemplate, readLibrary } from '../lib/voxTemplates.js';
import { scoped } from '../lib/log.js';

const log = scoped('stage-outreach');

export const stageOutreachRouter = Router();
stageOutreachRouter.use(requireAdmin);
stageOutreachRouter.use(requireActiveAdmin);
stageOutreachRouter.use(auditAdmin);

type Obj = Record<string, any>;

/** What the dashboard has actually saved for Voxvalley, without the shipped defaults merged in. */
async function savedVoxSettings(): Promise<Obj> {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: 'voxvalley' } });
  return ((row?.settings as Obj | undefined) ?? {});
}

function adminName(req: unknown): string | undefined {
  const a = (req as { admin?: { id?: string; email?: string } }).admin;
  return a?.email ?? a?.id;
}

function stageOr404(key: string) {
  const stage = OUTREACH_STAGES.find((s) => s.key === key);
  if (!stage) throw new HttpError(404, 'Unknown stage');
  return stage;
}

// GET /api/admin/stage-outreach
stageOutreachRouter.get('/', ah(async (_req, res) => {
  const keys = OUTREACH_STAGES.map((s) => s.key);
  const [rules, vox, meta, ello, agentStatus, savedVox] = await Promise.all([
    prisma.stallRule.findMany({ where: { triggerEvent: { in: keys } }, orderBy: [{ delayMinutes: 'asc' }, { createdAt: 'asc' }] }),
    getProviderConfig('voxvalley'),
    getProviderConfig('meta_whatsapp'),
    getProviderConfig('ello'),
    agentRoleStatus(),
    savedVoxSettings(),
  ]);

  const shippedWa = (DEFAULT_SETTINGS.voxvalley.stallTemplates ?? {}) as Obj;
  const savedWa = (savedVox.stallTemplates ?? {}) as Obj;
  const smsOverrides = (vox.settings.smsTemplates ?? {}) as Obj;
  const stageCalls = normalizeStageCalls(ello.settings.stageCalls);
  const agentIdByRole = new Map(agentStatus.map((a) => [a.role, a.agentId]));
  const defaultAgentId = agentIdByRole.get('leadCallback') ?? null;

  const stages = OUTREACH_STAGES.map((stage) => {
    const call = stageCalls[stage.key] ?? {};
    const mine = rules.filter((r) => r.triggerEvent === stage.key);
    const activities = mine.map((r) => {
      const base = {
        ruleId: r.id,
        name: r.name,
        channel: r.channel,
        delayMinutes: r.delayMinutes,
        cooldownMinutes: r.cooldownMinutes,
        enabled: r.enabled,
        expectedEvent: r.expectedEvent,
        upshotEvent: r.upshotEvent,
        lastFiredAt: r.lastFiredAt,
        firedCount: r.firedCount,
        surface: r.surface,
      };
      if (r.channel === 'whatsapp') {
        const t = (savedWa[stage.key] ?? shippedWa[stage.key]) as Obj | undefined;
        const rec = recommendedForStage(stage.key);
        return {
          ...base,
          whatsapp: {
            template: String(t?.template ?? ''), language: String(t?.language ?? 'en'), placeholders: (t?.placeholders as string[] | undefined) ?? [], customised: stage.key in savedWa,
            // The utility-category template written for this stage (see lib/whatsappTemplates.ts), to switch to once Meta approves it.
            recommended: rec ? { name: rec.name, language: rec.language, placeholders: rec.placeholders, preview: previewBody(rec) } : null,
          },
        };
      }
      if (r.channel === 'sms') {
        const o = smsOverrides[stage.key] as Obj | undefined;
        const useOverride = !!(o && String(o.templateId ?? '').trim() && String(o.body ?? '').trim());
        return {
          ...base,
          sms: {
            templateId: String(useOverride ? o!.templateId : vox.settings.smsTemplateId ?? ''),
            body: String(useOverride ? o!.body : vox.settings.smsBody ?? ''),
            customised: useOverride,
          },
        };
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
      return base; // push / email: sent through Upshot; only the event name and timing are set here
    });
    const present = new Set(mine.map((r) => r.channel));
    return { ...stage, activities, missingChannels: OUTREACH_CHANNELS.filter((c) => !present.has(c)) };
  });

  return ok(res, {
    stages,
    // The two customer flows in their own order; each step names the stage its rules are stored under.
    flows: FLOW_STEPS,
    variables: VARIABLE_LIST,
    whatsappTokens: ['{name}', '{ref}', '{offerCount}', '{siteUrl}'],
    agentRoles: AGENT_ROLES.map((role) => ({ role, ...AGENT_ROLE_INFO[role] })),
    maxBriefLength: MAX_BRIEF_LENGTH,
    // WhatsApp messages that are not tied to one stage: each is off until a template is named.
    messages: {
      conversationSummary: { ...normalizeSummaryConfig(vox.settings.conversationSummary), tokens: SUMMARY_TOKENS },
      noOffers: { ...normalizeSummaryConfig(vox.settings.noOffers), tokens: OFFERS_NOTICE_TOKENS },
      eligibilityRetry: { ...normalizeSummaryConfig(vox.settings.eligibilityRetry), tokens: OFFERS_NOTICE_TOKENS },
    },
    templates: WHATSAPP_TEMPLATES.map((t) => ({ ...t, preview: previewBody(t), meta: toMetaPayload(t) })),
    legacyTemplates: LEGACY_TEMPLATES,
    gates: {
      callsAutomatic: timing.bool('calls.nudgeEnabled'),
      testNumbersOnly: timing.phones('calls.allowedNumbers').length,
      nudgesDisabled: nudgesDisabled(),
      elloConnected: ello.enabled,
      whatsappConnected: vox.enabled || meta.enabled,
      upshotConnected: (await getProviderConfig('upshot')).enabled,
      smsConnected: vox.enabled,
    },
  }, 'Stage outreach');
}));

// POST /api/admin/stage-outreach/:stage/activities — add a follow-up on one channel (starts switched off)
const addSchema = z.object({
  channel: z.enum(OUTREACH_CHANNELS as unknown as [OutreachChannel, ...OutreachChannel[]]),
  delayMinutes: z.number().int().min(1).max(20160),
  /** Who it applies to. Left out = both, which is how every earlier follow-up behaves. */
  surface: z.enum(RULE_SURFACES as unknown as [RuleSurface, ...RuleSurface[]]).default('all'),
});

const CHANNEL_NAME: Record<OutreachChannel, string> = { whatsapp: 'WHATSAPP', sms: 'SMS', email: 'EMAIL', voice: 'CALL', push: 'PUSH' };

stageOutreachRouter.post('/:stage/activities', requireRole(...CAN_ADMINISTER), validate(addSchema), ah(async (req, res) => {
  const stage = stageOr404(req.params.stage);
  const { channel, delayMinutes, surface } = req.body as z.infer<typeof addSchema>;
  try {
    const rule = await prisma.stallRule.create({
      data: {
        name: `${CHANNEL_NAME[channel]}${surface === 'all' ? '' : ` (${surface})`} — ${stage.label.toLowerCase()}: ${stage.description.replace(/\.$/, '').toLowerCase()}`.slice(0, 120),
        triggerEvent: stage.key,
        expectedEvent: stage.expectedEvent,
        delayMinutes,
        upshotEvent: `swiftloan_${stage.key}_${channel}${surface === 'all' ? '' : `_${surface}`}`,
        channel,
        surface,
        cooldownMinutes: defaultCooldownMinutes(channel),
        enabled: false, // a new follow-up never reaches a customer until someone switches it on
      },
    });
    log.info('activity added', { stage: stage.key, channel, updatedBy: adminName(req) ?? null });
    return created(res, { ruleId: rule.id }, 'Follow-up added');
  } catch (e: any) {
    if (e?.code === 'P2002') throw new HttpError(409, `This step already has a ${channel} follow-up${surface === 'all' ? '' : ` for the ${surface}`}`);
    throw e;
  }
}));

const callSchema = z.object({
  agentRole: z.enum(AGENT_ROLES).nullable().optional(),
  assistantId: z.string().trim().max(80).optional(),
  brief: z.string().max(MAX_BRIEF_LENGTH).optional(),
});

// PUT /api/admin/stage-outreach/:stage/call — which Ello agent rings, and what it is told
stageOutreachRouter.put('/:stage/call', requireRole(...CAN_ADMINISTER), validate(callSchema), ah(async (req, res) => {
  const { stage } = req.params;
  if (!isOutreachStage(stage)) throw new HttpError(404, 'Unknown stage');
  const body = req.body as z.infer<typeof callSchema>;

  const ello = await getProviderConfig('ello');
  const all = normalizeStageCalls(ello.settings.stageCalls);
  // Replace this stage wholesale; an all-empty body clears it back to the defaults.
  const next = normalizeStageCalls({ ...all, [stage]: body });
  await upsertProviderConfig('ello', { settings: { stageCalls: next } }, adminName(req));
  log.info('stage call saved', { stage, updatedBy: adminName(req) ?? null, cleared: !next[stage] });
  return ok(res, { stage, call: next[stage] ?? null }, 'Stage call saved');
}));

const waSchema = z.object({
  /** Blank = stop sending a template here and fall back to Upshot, as the sender already treats it. */
  template: z.string().trim().max(100),
  language: z.string().trim().max(10).optional(),
  placeholders: z.array(z.string().max(200)).max(10).optional(),
});

// PUT /api/admin/stage-outreach/:stage/whatsapp — the approved template and the values for its {{1}}, {{2}}…
stageOutreachRouter.put('/:stage/whatsapp', requireRole(...CAN_ADMINISTER), validate(waSchema), ah(async (req, res) => {
  const stage = stageOr404(req.params.stage);
  const body = req.body as z.infer<typeof waSchema>;
  const saved = ((await savedVoxSettings()).stallTemplates ?? {}) as Obj;
  let entry: Obj;
  if (body.template === '') {
    entry = { template: '' };
  } else {
    const clean = cleanWhatsApp(body);
    if (!clean) throw new HttpError(400, 'Template names use lowercase letters, numbers and underscores, for example offers_ready');
    // Send the template's own category with it (Meta's decision if recorded, else the catalogue's), not the card's single default.
    const category = categoryForTemplate(clean.template, readLibrary((await savedVoxSettings()).templateLibrary), templateByName(clean.template)?.category);
    entry = { ...(clean as unknown as Obj), ...(category ? { category } : {}) };
  }
  await upsertProviderConfig('voxvalley', { settings: { stallTemplates: { ...saved, [stage.key]: entry } } }, adminName(req));
  log.info('stage whatsapp saved', { stage: stage.key, template: entry.template || null, updatedBy: adminName(req) ?? null });
  return ok(res, { stage: stage.key, whatsapp: entry }, 'WhatsApp template saved');
}));

const smsSchema = z.object({ templateId: z.string().trim().max(40), body: z.string().max(1000) });

// PUT /api/admin/stage-outreach/:stage/sms — a per-stage override of the DLT-registered text (both blank = back to the default)
stageOutreachRouter.put('/:stage/sms', requireRole(...CAN_ADMINISTER), validate(smsSchema), ah(async (req, res) => {
  const stage = stageOr404(req.params.stage);
  const body = req.body as z.infer<typeof smsSchema>;
  const saved = ((await savedVoxSettings()).smsTemplates ?? {}) as Obj;
  const next: Obj = { ...saved };
  const clean = cleanSms(body);
  const blank = !body.templateId.trim() && !body.body.trim();
  if (blank) delete next[stage.key];
  else if (!clean) throw new HttpError(400, 'Enter both the DLT template ID and the exact registered text, or leave both blank to use the default');
  else next[stage.key] = clean;
  await upsertProviderConfig('voxvalley', { settings: { smsTemplates: next } }, adminName(req));
  log.info('stage sms saved', { stage: stage.key, cleared: blank, updatedBy: adminName(req) ?? null });
  return ok(res, { stage: stage.key, sms: next[stage.key] ?? null }, 'SMS saved');
}));

const summarySchema = z.object({
  enabled: z.boolean(),
  /** Blank is allowed while switched off; a switched-on summary needs a template. */
  template: z.string().trim().max(100),
  language: z.string().trim().max(10).optional(),
  placeholders: z.array(z.string().max(200)).max(10).optional(),
});

/** The WhatsApp messages that are not tied to one stage, and the Voxvalley setting each lives in. */
const MESSAGE_KINDS = ['conversationSummary', 'noOffers', 'eligibilityRetry'] as const;
type MessageKind = (typeof MESSAGE_KINDS)[number];

// PUT /api/admin/stage-outreach/messages/:kind — the recap after every conversation, and the two eligibility notices
stageOutreachRouter.put('/messages/:kind', requireRole(...CAN_ADMINISTER), validate(summarySchema), ah(async (req, res) => {
  const kind = req.params.kind as MessageKind;
  if (!MESSAGE_KINDS.includes(kind)) throw new HttpError(404, 'Unknown message');
  const body = req.body as z.infer<typeof summarySchema>;
  if (body.template && !/^[a-z0-9_]{1,100}$/.test(body.template)) {
    throw new HttpError(400, 'Template names use lowercase letters, numbers and underscores, for example conversation_summary');
  }
  if (body.enabled && !body.template) throw new HttpError(400, 'Enter the approved template name before switching this on');
  const next = normalizeSummaryConfig({ ...body, placeholders: body.placeholders ?? undefined });
  await upsertProviderConfig('voxvalley', { settings: { [kind]: next } }, adminName(req));
  log.info('message saved', { kind, enabled: next.enabled, template: next.template || null, updatedBy: adminName(req) ?? null });
  return ok(res, { kind, config: next }, 'Saved');
}));
