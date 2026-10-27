/**
 * WS5 — admin-facing outbound call routes. Mounted at /api/admin/calls behind
 * requireAdmin. The actual dialling lives in lib/dialer.ts so the campaign
 * runner and this ad-hoc trigger share one implementation.
 */
import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created, fail, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { resolveCustomer } from '../lib/journey.js';
import { placeCall, normalisePhone } from '../lib/dialer.js';
import { buildLeadCallContext, compactContext, stallReasonFor, stallHelpFor } from '../lib/callContext.js';
import { agentIdFor } from '../lib/agents.js';
import { getJobHeartbeats } from '../jobs/tracking.jobs.js';
import { scoped } from '../lib/log.js';
import { toCsv } from '../lib/csv.js';
import { withinTestAllowlist } from '../lib/callGate.js';
import { doNotContactCustomerIds, doNotContactPhones } from '../lib/doNotContact.js';
import { auditExport, sendCsv, csvFilename } from '../lib/exportAudit.js';
import {
  buildCallWhere, activeCallFilters, followUpIds, purposesFor, toCallListItem, overviewRange,
  CALL_LIST_SELECT, PHONE_CHANNELS,
} from '../lib/callFilters.js';

const log = scoped('calls');

export const callsRouter = Router();
callsRouter.use(requireAdmin);
callsRouter.use(requireActiveAdmin);
callsRouter.use(auditAdmin);

// Filter rules (status, outcome, purpose, search, dates, follow-up) and the enums
// they validate against live in lib/callFilters.ts, shared by the list, the stat
// strip and the CSV export so all three always agree.

/** Export cap, the same as the other CSV exports. */
const EXPORT_LIMIT = 10_000;

/** An error that carries a machine-readable code in `data.code`, so the page can word it for the person. */
function failCode(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, data: { code }, message, error: message });
}

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

    // Two hard stops that no admin can click past, both checked before anything
    // is queued or dialled. Do-not-contact: the customer asked us to stop (stage
    // "lost" or a past do_not_call outcome). Test allowlist: on a dev or staging
    // box only the listed numbers may ring; a no-op when the list is empty.
    const blocked = await doNotContactCustomerIds([customer.id]);
    if (blocked.has(customer.id)) {
      return failCode(res, 409, 'do_not_contact', 'This customer asked not to be contacted, so the call was not placed.');
    }
    // The number actually dialled can differ from the customer's own (a request may carry both a
    // customerId and a phone), so check the number itself as well.
    const blockedPhones = await doNotContactPhones([dialPhone]);
    if (blockedPhones.size > 0) {
      return failCode(res, 409, 'do_not_contact', 'This number belongs to someone who asked not to be contacted, so the call was not placed.');
    }
    if (!withinTestAllowlist(dialPhone)) {
      return failCode(res, 403, 'not_on_test_allowlist', 'This number is not on the test allowlist, so the call was not placed.');
    }

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

// GET /api/admin/calls — paginated, newest first. Filters: status, outcome,
// purpose, campaignId, search, from, to, answered, followUp (lib/callFilters.ts).
// List rows carry only what the list shows: no transcript, raw payload, call
// context or recording link. The full call is GET /:id.
callsRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const q = req.query as Record<string, unknown>;
  const ids = String(q.followUp ?? '') === '1' ? await followUpIds() : undefined;
  const where = buildCallWhere(q, { followUpIds: ids });

  const [total, rows] = await Promise.all([
    prisma.callAttempt.count({ where }),
    prisma.callAttempt.findMany({
      where,
      select: CALL_LIST_SELECT,
      orderBy: { queuedAt: 'desc' },
      skip,
      take,
    }),
  ]);
  // callContext is left out of the select on purpose; the reason is read for just this page.
  const purposes = await purposesFor(rows.map((r) => r.id));
  const items = rows.map((r) => toCallListItem(r, purposes.get(r.id)));

  return ok(res, items, 'Calls', paginate(page, pageSize, total));
}));

// GET /api/admin/calls/export.csv — the same filters as the list, no paging.
// Declared before '/:id' or "export.csv" would be read as a call id. Personal
// data leaves the system here, so it needs a role that can write, and every
// export is audited. The columns deliberately leave out the recording link, the
// summary and the transcript.
callsRouter.get('/export.csv', requireRole(...CAN_WRITE), ah(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const ids = String(q.followUp ?? '') === '1' ? await followUpIds() : undefined;
  const where = buildCallWhere(q, { followUpIds: ids });

  const [total, rows] = await Promise.all([
    prisma.callAttempt.count({ where }),
    prisma.callAttempt.findMany({
      where,
      orderBy: { queuedAt: 'desc' },
      take: EXPORT_LIMIT,
      select: {
        id: true, phone: true, status: true, outcome: true, answered: true, durationSec: true, attempt: true,
        queuedAt: true, endedAt: true, error: true, campaignId: true,
        customer: { select: { name: true, firstSource: true } },
        campaign: { select: { name: true, code: true } },
      },
    }),
  ]);
  const purposes = await purposesFor(rows.map((r) => r.id));

  const csv = toCsv(
    ['id', 'phone', 'customer', 'source', 'campaign', 'purpose', 'status', 'outcome',
     'answered', 'durationSec', 'attempt', 'queuedAt', 'endedAt', 'error'],
    rows.map((r) => [
      r.id, r.phone, r.customer?.name, r.customer?.firstSource, r.campaign?.code ?? r.campaign?.name,
      purposes.get(r.id) || (r.campaignId ? 'campaign' : ''), r.status, r.outcome,
      r.answered, r.durationSec, r.attempt, r.queuedAt, r.endedAt, r.error,
    ]),
  );
  await auditExport(req, { name: 'calls', filters: activeCallFilters(q), rows: rows.length, truncated: total > rows.length });
  return sendCsv(res, csvFilename('calls'), csv);
}));

// GET /api/admin/calls/overview — call volume + dialler-job heartbeats, so an
// operator can see how many calls happened and whether the jobs (and thus Ruby,
// the voice agent) are being triggered on their regular interval.
// `from` / `to` (ISO) set the range for `summary` and `byOutcome`; the default is
// today in IST. Every older field is unchanged.
// MUST be declared before '/:id', or 'overview' is parsed as a call id.
callsRouter.get('/overview', ah(async (req, res) => {
  const nowMs = Date.now();
  const since24 = new Date(nowMs - 24 * 3_600_000);
  const since7d = new Date(nowMs - 7 * 86_400_000);
  const range = overviewRange(req.query as Record<string, unknown>, new Date(nowMs));
  const inRange = { channel: { in: PHONE_CHANNELS }, queuedAt: { gte: range.from, lte: range.to } };

  const [
    count24, count7d, byStatus, recent, purposeRows, perDayRows,
    placed, answeredCount, durationAgg, outcomeGroups, failedCount, notAnsweredCount, callbacksDue, followUps,
  ] = await Promise.all([
    prisma.callAttempt.count({ where: { queuedAt: { gte: since24 } } }),
    prisma.callAttempt.count({ where: { queuedAt: { gte: since7d } } }),
    prisma.callAttempt.groupBy({ by: ['status'], where: { queuedAt: { gte: since7d } }, _count: { _all: true } }),
    prisma.callAttempt.findMany({
      where: { queuedAt: { gte: since7d } },
      orderBy: { queuedAt: 'desc' },
      take: 25,
      select: {
        id: true, phone: true, status: true, answered: true, outcome: true, queuedAt: true,
        startedAt: true, providerConversationId: true, error: true, callContext: true, summary: true,
      },
    }),
    prisma.$queryRaw<Array<{ purpose: string; n: bigint }>>`
      SELECT COALESCE("callContext"->>'reason', '(unknown)') AS purpose, count(*)::bigint AS n
      FROM "CallAttempt" WHERE "queuedAt" >= ${since7d} GROUP BY 1 ORDER BY n DESC`,
    prisma.$queryRaw<Array<{ d: string; n: bigint }>>`
      SELECT to_char("queuedAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d, count(*)::bigint AS n
      FROM "CallAttempt" WHERE "queuedAt" >= ${since7d} GROUP BY 1 ORDER BY d`,
    // ── summary for the chosen range (phone calls only) ──
    prisma.callAttempt.count({ where: inRange }),
    prisma.callAttempt.count({ where: { ...inRange, answered: true } }),
    prisma.callAttempt.aggregate({ where: { ...inRange, durationSec: { not: null } }, _avg: { durationSec: true } }),
    prisma.callAttempt.groupBy({ by: ['outcome'], where: inRange, _count: { _all: true } }),
    prisma.callAttempt.count({ where: { ...inRange, status: 'failed' } }),
    prisma.callAttempt.count({ where: { ...inRange, status: { in: ['no_answer', 'busy'] } } }),
    // Callbacks the customer asked for whose time has come. Not range-bound: an
    // overdue callback matters whichever day it was asked for.
    prisma.callAttempt.count({
      where: { channel: { in: PHONE_CHANNELS }, outcome: 'callback_requested', callbackAt: { not: null, lte: new Date(nowMs) } },
    }),
    followUpIds(),
  ]);

  const CALL_JOBS = ['status-call', 'step-stall', 'stage-stall', 'lead-autocaller', 'immediate-callback', 'call-reconcile'];
  const jobs = getJobHeartbeats().map((h) => ({
    ...h,
    isCallJob: CALL_JOBS.includes(h.name),
    healthy: h.lastRunAt ? nowMs - new Date(h.lastRunAt).getTime() <= h.everyMs * 2.5 : false,
    overdueMs: h.lastRunAt ? nowMs - new Date(h.lastRunAt).getTime() : null,
  }));

  const recentMapped = recent.map((r) => {
    const ctx = (r.callContext ?? {}) as Record<string, unknown>;
    return {
      id: r.id, phone: r.phone, status: r.status, answered: r.answered, outcome: r.outcome,
      purpose: (ctx.reason as string) ?? null,
      name: (ctx.lead_name as string) ?? null,
      queuedAt: r.queuedAt, startedAt: r.startedAt,
      providerConversationId: r.providerConversationId, error: r.error, summary: r.summary ?? null,
    };
  });

  const outcomeCount = (o: string) => outcomeGroups.find((g) => g.outcome === o)?._count._all ?? 0;
  const summary = {
    placed,
    answered: answeredCount,
    answerRate: placed ? Math.round((answeredCount / placed) * 100) : 0,
    avgDurationSec: durationAgg._avg.durationSec == null ? null : Math.round(durationAgg._avg.durationSec),
    interested: outcomeCount('interested'),
    callbacksDue,
    doNotCall: outcomeCount('do_not_call'),
    failed: failedCount,
    notAnswered: notAnsweredCount,
    // Not range-bound: see followUpIds() in lib/callFilters.ts for the definition.
    needsFollowUp: followUps.length,
  };

  return ok(res, {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    summary,
    byOutcome: outcomeGroups
      .map((g) => ({ outcome: g.outcome ?? 'none', count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    totals: { last24h: count24, last7d: count7d },
    byStatus: byStatus.map((s) => ({ status: s.status ?? 'unknown', count: s._count._all })),
    byPurpose: purposeRows.map((p) => ({ purpose: p.purpose, count: Number(p.n) })),
    perDay: perDayRows.map((d) => ({ day: d.d, count: Number(d.n) })),
    recent: recentMapped,
    jobs,
    generatedAt: new Date().toISOString(),
  });
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
