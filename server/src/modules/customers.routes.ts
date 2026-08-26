/**
 * WS5 — customer 360.
 *
 * The dashboard's single view of a human: where they came from, everything
 * they have done across website / voice / app, where they are stuck, and what
 * the operator should do about it.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { JourneyStage, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { STAGE_ORDER, STAGE_LABELS, TERMINAL_STAGES, CHANNEL_ENTRY_STAGES } from '../lib/journey.js';
import { nudgeCustomer } from '../lib/dispatch.js';
import { NEXT_ACTION_BY_STAGE, nextActionFor } from '../lib/nextAction.js';
import { scoped } from '../lib/log.js';

const log = scoped('customers');

export const customersRouter = Router();
customersRouter.use(requireAdmin);
customersRouter.use(requireActiveAdmin);
customersRouter.use(auditAdmin);



// Re-exported so the dashboard's copy and the nudge payload stay in one place.
export { NEXT_ACTION_BY_STAGE };

const ALL_STAGES: string[] = [...STAGE_ORDER, 'rejected', 'lost'];

function minutesSince(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
}

// ─────────────────────────── list ───────────────────────────

// GET /api/admin/customers?stage=&source=&campaignId=&search=&stalledMinutes=
customersRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const q = req.query as Record<string, string | undefined>;

  const where: Prisma.CustomerWhereInput = {};
  if (q.stage && ALL_STAGES.includes(q.stage)) where.currentStage = q.stage as JourneyStage;
  if (q.source) where.firstSource = q.source;
  if (q.campaignId) where.campaignId = q.campaignId;
  if (q.search) {
    const s = q.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }
  const stalled = parseInt(String(q.stalledMinutes ?? ''), 10);
  if (Number.isFinite(stalled) && stalled > 0) {
    // "Stalled" only means anything for a customer still in play, so terminal
    // stages are excluded — as an AND so an explicit ?stage= still applies.
    where.stageEnteredAt = { lt: new Date(Date.now() - stalled * 60_000) };
    where.AND = [{ currentStage: { notIn: TERMINAL_STAGES } }];
  }

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { lastActivityAt: 'desc' },
      skip,
      take,
      select: {
        id: true, name: true, phone: true, firstSource: true, campaignId: true,
        currentStage: true, stageEnteredAt: true, lastActivityAt: true,
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return ok(
    res,
    rows.map((r) => ({
      ...r,
      stageLabel: STAGE_LABELS[r.currentStage],
      stalledMinutes: minutesSince(r.stageEnteredAt),
    })),
    'Customers',
    paginate(page, pageSize, total),
  );
}));

// ─────────────────────────── 360 view ───────────────────────────

// GET /api/admin/customers/:id
customersRouter.get('/:id', ah(async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw new HttpError(404, 'Customer not found');

  // Bounded: a long-lived customer accumulates hundreds of journey events, and
  // this endpoint renders one page. The paginated /timeline endpoint below is
  // the way to read the full history.
  const [timelineRows, calls, campaignContacts] = await Promise.all([
    prisma.journeyEvent.findMany({
      where: { customerId: customer.id },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    }),
    prisma.callAttempt.findMany({
      where: { customerId: customer.id, channel: { in: ['phone_outbound', 'phone_inbound'] } },
      orderBy: { queuedAt: 'desc' },
      take: 50,
    }),
    prisma.campaignContact.findMany({
      where: { customerId: customer.id },
      include: { campaign: { select: { id: true, name: true, code: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  // Fetched newest-first so the cap keeps the *recent* events, then flipped
  // back to chronological order for the tracker UI.
  timelineRows.reverse();

  const timeline = timelineRows.map((e) => ({
    ...e,
    stageLabel: e.stage ? STAGE_LABELS[e.stage] : null,
  }));

  // First time each stage was reached, from the timeline.
  const firstAt = new Map<JourneyStage, Date>();
  for (const e of timelineRows) {
    if (e.stage && !firstAt.has(e.stage)) firstAt.set(e.stage, e.occurredAt);
  }
  const currentRank = STAGE_ORDER.indexOf(customer.currentStage);
  const stageProgress = STAGE_ORDER.map((stage, i) => {
    const at = firstAt.get(stage) ?? null;
    // A stage with a real event is confirmed. Otherwise it may be INFERRED from
    // having reached a later stage — but only for genuine prerequisites. Channel
    // entry points (website lead, outreach call) are never inferred: an
    // app-origin customer never had either, and claiming they did invents a
    // website enquiry and a phone call that do not exist.
    const confirmed = at != null;
    const inferred =
      !confirmed &&
      currentRank >= 0 &&
      i <= currentRank &&
      !CHANNEL_ENTRY_STAGES.includes(stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      reached: confirmed || inferred,
      /** True when nothing was recorded and this is implied by a later stage. */
      inferred,
      at,
    };
  });

  const dropOff = {
    stage: customer.currentStage,
    label: STAGE_LABELS[customer.currentStage],
    stalledMinutes: minutesSince(customer.stageEnteredAt),
    isTerminal: TERMINAL_STAGES.includes(customer.currentStage),
  };

  const [user, leads] = await Promise.all([
    customer.userId
      ? prisma.user.findUnique({
          where: { id: customer.userId },
          include: {
            applications: {
              orderBy: { createdAt: 'desc' },
              include: {
                loan: true,
                _count: { select: { offers: true } },
                // Per-lender applications live on the offers: an offer with
                // applied=true is one submitted lender application, and its
                // lenderStatus is that lender's own progress (independent of the
                // parent application's eligibility status). Surfaced so the admin
                // can show one journey per lender after submission.
                offers: {
                  orderBy: [{ applied: 'desc' }, { recommended: 'desc' }],
                  include: { partner: { select: { name: true, logoUrl: true } } },
                },
              },
            },
            loans: { orderBy: { disbursedAt: 'desc' } },
            kyc: true,
          },
        })
      : Promise.resolve(null),
    customer.phone
      ? prisma.lead.findMany({ where: { phone: customer.phone }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve([]),
  ]);

  // Roll-up across every lender the customer applied to. One "submitted
  // application" = one applied offer; its lenderStatus is that lender's own
  // outcome. A customer with 3 lender applications can be approved by one,
  // rejected by another and still under review at a third — so these are
  // independent counts, not a single status.
  const appliedOffers = (user?.applications ?? []).flatMap((a) =>
    (a.offers ?? []).filter((o) => o.applied),
  );
  const countStatus = (statuses: string[]) =>
    appliedOffers.filter((o) => o.lenderStatus && statuses.includes(o.lenderStatus)).length;
  const approved = countStatus(['approved']);
  const rejected = countStatus(['rejected', 'failed']);
  const disbursed = countStatus(['disbursed']);
  const applicationSummary = {
    lenders: appliedOffers.length,          // how many lender applications submitted
    submitted: appliedOffers.length,
    approved,
    rejected,
    disbursed,
    // Still-open applications: submitted but no terminal outcome yet.
    inProgress: appliedOffers.length - approved - rejected - disbursed,
  };

  return ok(res, {
    customer,
    timeline,
    stageProgress,
    dropOff,
    calls,
    campaigns: campaignContacts,
    user,
    leads,
    applicationSummary,
    nextAction: nextActionFor(customer.currentStage),
  }, 'Customer 360');
}));

// GET /api/admin/customers/:id/timeline — paginated, newest first
customersRouter.get('/:id/timeline', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 50);
  const exists = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) throw new HttpError(404, 'Customer not found');

  const where = { customerId: req.params.id };
  const [rows, total] = await Promise.all([
    prisma.journeyEvent.findMany({ where, orderBy: { occurredAt: 'desc' }, skip, take }),
    prisma.journeyEvent.count({ where }),
  ]);

  return ok(
    res,
    rows.map((e) => ({ ...e, stageLabel: e.stage ? STAGE_LABELS[e.stage] : null })),
    'Timeline',
    paginate(page, pageSize, total),
  );
}));

// ─────────────────────────── manual nudge ───────────────────────────

const nudgeSchema = z.object({
  channel: z.enum(['push', 'whatsapp', 'sms', 'email', 'voice']).default('push'),
  eventName: z.string().min(1).optional(),
});

// POST /api/admin/customers/:id/nudge
customersRouter.post('/:id/nudge', requireRole(...CAN_WRITE), validate(nudgeSchema), ah(async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw new HttpError(404, 'Customer not found');

  const requests = await nudgeCustomer(customer, customer.currentStage);

  // An operator-supplied event name overrides the stage mapping on the queued
  // event row (it is still pending, so this is safe).
  const body = req.body as z.infer<typeof nudgeSchema>;
  let out = requests;
  if (body.eventName || body.channel !== 'push') {
    out = await Promise.all(
      requests.map(async (r) => {
        if (r.status !== 'pending') return r;
        const payload = (r.payload ?? {}) as Record<string, unknown>;
        return prisma.outboundRequest.update({
          where: { id: r.id },
          data: {
            channel: body.channel,
            ...(body.eventName && r.kind === 'upshot_event'
              ? { payload: { ...payload, eventName: body.eventName } as object }
              : {}),
          },
        });
      }),
    );
  }

  await prisma.customer.update({ where: { id: customer.id }, data: { lastNudgedAt: new Date() } }).catch(() => undefined);

  log.info('manual nudge queued', { customerId: customer.id, channel: body.channel, eventName: body.eventName ?? null, count: out.length });
  return created(res, out.length === 1 ? out[0] : out, 'Nudge queued');
}));
