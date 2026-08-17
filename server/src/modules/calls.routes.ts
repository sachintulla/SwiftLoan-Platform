/**
 * WS5 — admin-facing outbound call routes. Mounted at /api/admin/calls behind
 * requireAdmin. The actual dialling lives in lib/dialer.ts so the campaign
 * runner and this ad-hoc trigger share one implementation.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created, fail, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { resolveCustomer } from '../lib/journey.js';
import { placeCall, normalisePhone } from '../lib/dialer.js';
import { buildLeadCallContext, compactContext, stallReasonFor, stallHelpFor } from '../lib/callContext.js';
import { agentIdFor } from '../lib/agents.js';
import { scoped } from '../lib/log.js';

const log = scoped('calls');

export const callsRouter = Router();
callsRouter.use(requireAdmin);
callsRouter.use(requireActiveAdmin);
callsRouter.use(auditAdmin);



const CALL_STATUSES = ['queued', 'dialing', 'in_progress', 'completed', 'failed', 'no_answer', 'busy', 'cancelled'] as const;
const CALL_OUTCOMES = [
  'interested', 'not_interested', 'callback_requested', 'wrong_number',
  'voicemail', 'unreachable', 'do_not_call', 'installed_app', 'other',
] as const;

const customerSelect = { select: { id: true, name: true, phone: true } };

// POST /api/admin/calls/trigger — place one call now.
callsRouter.post('/trigger', requireRole(...CAN_ADMINISTER),
  validate(z.object({
    customerId: z.string().min(1).optional(),
    phone: z.string().min(6).optional(),
    campaignId: z.string().min(1).optional(),
    assistantId: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    // Optional journey stage the operator called from, so the agent can open
    // with that specific drop-off rather than a generic follow-up.
    lastStep: z.string().min(1).optional(),
    expectedStep: z.string().min(1).optional(),
  }).refine((b) => Boolean(b.customerId || b.phone), {
    message: 'customerId or phone is required',
  })),
  ah(async (req, res) => {
    const { customerId, phone, campaignId, assistantId, metadata } = req.body as {
      customerId?: string; phone?: string; campaignId?: string; assistantId?: string;
      metadata?: Record<string, any>;
    };

    // Prefer an explicit customer; otherwise find-or-create from the phone.
    let customer = customerId
      ? await prisma.customer.findUnique({ where: { id: customerId } })
      : null;
    if (customerId && !customer) return fail(res, 404, 'Customer not found');

    if (!customer) {
      const clean = normalisePhone(phone);
      if (!clean) return fail(res, 400, 'phone must contain a valid 10-digit mobile number');
      customer = await resolveCustomer({ phone: clean, source: 'phone_call' });
      if (!customer) return fail(res, 400, 'Could not resolve a customer for this phone');
    }

    const dialPhone = normalisePhone(phone ?? customer.phone);
    if (!dialPhone) return fail(res, 400, 'No dialable phone number for this customer');

    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
      if (!campaign) return fail(res, 404, 'Campaign not found');
    }

    // Build the same context an automatic call gets — including the
    // cross-channel conversation brief — so a one-click call from the dashboard
    // opens knowing the history rather than as a cold call. Without this the
    // manual button would be the *worst* of the four ways we ring someone.
    //
    // When the operator called from a specific journey stage ("call them about
    // KYC"), that stage is turned into the same drop-off wording an automatic
    // stall call uses — so the agent opens with "you started your KYC but did not
    // finish it" instead of a generic follow-up.
    const b = req.body as { lastStep?: string; expectedStep?: string };
    const lastStep = String(b.lastStep ?? '').trim();
    const expectedStep = String(b.expectedStep ?? '').trim();
    const stageAware = !!(lastStep && expectedStep);

    const context = compactContext(
      await buildLeadCallContext(customer, {
        purpose: stageAware ? 'app_dropoff_followup' : 'manual_dashboard_call',
        ...(stageAware
          ? {
              stall: {
                reason: stallReasonFor(lastStep, expectedStep),
                help: stallHelpFor(lastStep, expectedStep),
                lastStep: lastStep.replace(/_/g, ' '),
                expectedStep: expectedStep.replace(/_/g, ' '),
                minutes: 0,
                channel: lastStep.startsWith('lead_') ? 'the website' : 'the app',
              },
            }
          : {}),
      }).catch(() => ({}) as Record<string, string>),
    );

    const result = await placeCall({
      customerId: customer.id,
      phone: dialPhone,
      campaignId: campaignId ?? null,
      // Fall back to the configured outbound agent rather than the workspace
      // default, so a manual call uses the same prompt as an automatic one.
      assistantId: assistantId ?? (await agentIdFor('leadCallback')),
      metadata: {
        ...context,
        ...(metadata ?? {}),
        name: customer.name ?? undefined,
        reason: 'manual_dashboard_call',
        triggeredBy: req.admin?.sub ?? 'admin',
      },
    });

    const attempt = await prisma.callAttempt.findUnique({
      where: { id: result.attempt.id },
      include: { customer: customerSelect },
    });

    log[result.ok ? 'info' : 'warn']('manual trigger', {
      customerId: customer.id, phone: dialPhone, campaignId: campaignId ?? null,
      triggeredBy: req.admin?.sub ?? 'admin', ok: result.ok, error: result.error ?? null,
    });

    // A provider failure is a recorded outcome, not a request error: the caller
    // still gets the CallAttempt row (status `failed`, with `error` set).
    return created(res, attempt, result.ok ? 'Call queued' : `Call failed: ${result.error ?? 'provider error'}`);
  }));

// GET /api/admin/calls — paginated, newest first.
callsRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const status = req.query.status ? String(req.query.status) : undefined;
  const outcome = req.query.outcome ? String(req.query.outcome) : undefined;
  const campaignId = req.query.campaignId ? String(req.query.campaignId) : undefined;
  const search = req.query.search ? String(req.query.search).replace(/\D/g, '') : '';

  const where: Prisma.CallAttemptWhereInput = {
    ...(status && (CALL_STATUSES as readonly string[]).includes(status)
      ? { status: status as (typeof CALL_STATUSES)[number] } : {}),
    ...(outcome && (CALL_OUTCOMES as readonly string[]).includes(outcome)
      ? { outcome: outcome as (typeof CALL_OUTCOMES)[number] } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(search ? { phone: { contains: search } } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.callAttempt.count({ where }),
    prisma.callAttempt.findMany({
      where,
      include: { customer: customerSelect },
      orderBy: { queuedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return ok(res, items, 'Calls', paginate(page, pageSize, total));
}));

// GET /api/admin/calls/:id
callsRouter.get('/:id', ah(async (req, res) => {
  const attempt = await prisma.callAttempt.findUnique({
    where: { id: req.params.id },
    include: { customer: customerSelect },
  });
  if (!attempt) return fail(res, 404, 'Call not found');
  return ok(res, attempt, 'Call');
}));
