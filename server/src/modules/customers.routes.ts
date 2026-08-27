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
    // "Inactive for > N minutes" = no genuine WEBSITE/APP activity in the last N
    // minutes (outbound calls / campaigns / admin touches don't count). Terminal
    // stages excluded; AND so an explicit ?stage= still applies.
    const cutoff = new Date(Date.now() - stalled * 60_000);
    where.events = { none: { channel: { in: ['website', 'app'] }, occurredAt: { gte: cutoff } } };
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

  // Many Customer rows have no name of their own (they were created from a lead
  // or an app session before the person typed one), yet the linked User row does
  // have it — so the list was showing "Unknown" for people we actually know.
  // Fall back to the registered user's name, matched by phone (batched).
  const needName = rows.filter((r) => !r.name || !r.name.trim());
  const phones = [...new Set(needName.map((r) => r.phone).filter(Boolean) as string[])];
  const namedUsers = phones.length
    ? await prisma.user.findMany({
        where: { phone: { in: phones } },
        select: { phone: true, fullName: true, firstName: true, lastName: true },
      })
    : [];
  const nameByPhone = new Map(
    namedUsers.map((u) => [u.phone, (u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ')).trim() || null]),
  );

  // "Last active" must mean the person actually used the WEBSITE or MOBILE APP —
  // not an outbound call, a campaign send, or an admin/system touch (all of which
  // otherwise bump Customer.lastActivityAt). Derive it from the latest
  // website/app journey event for each customer on this page.
  const ids = rows.map((r) => r.id);
  const activity = ids.length
    ? await prisma.journeyEvent.groupBy({
        by: ['customerId'],
        where: { customerId: { in: ids }, channel: { in: ['website', 'app'] } },
        _max: { occurredAt: true },
      })
    : [];
  const lastActiveByCustomer = new Map(activity.map((a) => [a.customerId, a._max.occurredAt]));

  return ok(
    res,
    rows.map((r) => ({
      ...r,
      name: r.name && r.name.trim() ? r.name : (r.phone ? nameByPhone.get(r.phone) ?? null : null),
      // Overrides the raw Customer.lastActivityAt so the UI shows genuine
      // app/website activity only (null when they've never used either).
      lastActivityAt: lastActiveByCustomer.get(r.id) ?? null,
      stageLabel: STAGE_LABELS[r.currentStage],
      // "Inactive for" = time since last website/app activity, not stage dwell.
      stalledMinutes: minutesSince(lastActiveByCustomer.get(r.id) ?? null),
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
  const [timelineRows, calls, campaignContacts, outboundRequests] = await Promise.all([
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
    // A campaign upload sometimes lands a contact row before it is linked to a
    // Customer (or the link never happens if the two get created out of order),
    // so a customerId-only match silently drops real campaign history. Phone is
    // the same strong join key used everywhere else on this page.
    prisma.campaignContact.findMany({
      where: customer.phone ? { OR: [{ customerId: customer.id }, { phone: customer.phone }] } : { customerId: customer.id },
      include: { campaign: { select: { id: true, name: true, code: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Every nudge this customer was ever queued for, delivered or not — the
    // timeline's `nudge_sent` events only record that a send was *attempted*,
    // not whether Upshot actually accepted it.
    prisma.outboundRequest.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'asc' },
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

  // Most recent genuine website/app touchpoint — drives "Inactive for" so it
  // reflects real user activity, not how long they've sat in the current stage.
  let lastWebAppAt: Date | null = null;
  for (let i = timelineRows.length - 1; i >= 0; i--) {
    const ch = timelineRows[i].channel;
    if (ch === 'website' || ch === 'app') { lastWebAppAt = timelineRows[i].occurredAt; break; }
  }

  const dropOff = {
    stage: customer.currentStage,
    label: STAGE_LABELS[customer.currentStage],
    stalledMinutes: minutesSince(lastWebAppAt),
    lastActiveAt: lastWebAppAt,
    isTerminal: TERMINAL_STAGES.includes(customer.currentStage),
  };

  // Resolve the app-data user. The customer's PHONE is the strong identity, so
  // prefer the user registered with that phone. This both (a) covers a customer
  // only linked to its User at OTP verify, and (b) heals a customer mis-linked
  // to the wrong/older user id — the applications, loans and device all live
  // under the phone's user. Fall back to the explicit userId link when there is
  // no phone match.
  const phoneUser = customer.phone
    ? await prisma.user.findUnique({ where: { phone: customer.phone }, select: { id: true } }).catch(() => null)
    : null;
  const appUserId = phoneUser?.id ?? customer.userId ?? null;

  const [user, leads] = await Promise.all([
    appUserId
      ? prisma.user.findUnique({
          where: { id: appUserId },
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

  // Every app session the person has had (phone + OS shown in their profile
  // comes from the latest one). Falls back to nothing if they have only ever
  // used the website widget.
  const resolvedUserId = appUserId ?? user?.id ?? null;
  const [sessionRows, otpTokens, notifications] = await Promise.all([
    resolvedUserId
      ? prisma.session.findMany({
          where: { userId: resolvedUserId },
          orderBy: { startedAt: 'desc' },
          select: { id: true, deviceInfo: true, startedAt: true, endedAt: true, pagesVisited: true },
          take: 20,
        })
      : Promise.resolve([]),
    customer.phone
      ? prisma.otpToken.findMany({ where: { phone: customer.phone }, select: { purpose: true, consumed: true, createdAt: true } })
      : Promise.resolve([]),
    // Admin-facing alerts raised about this person (e.g. "stalled, needs help"),
    // keyed by whichever id the alert was filed under.
    prisma.notification.findMany({
      where: { entityId: { in: [customer.id, resolvedUserId].filter((v): v is string => !!v) } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  const session = sessionRows[0] ?? null;
  const di = (session?.deviceInfo ?? {}) as Record<string, unknown>;
  const device = session
    ? {
        os: di.platform ? `${di.platform}${di.osVersion ? ` ${di.osVersion}` : ''}` : null,
        model: di.model ? String(di.model) : null,
        appVersion: di.appVersion ? String(di.appVersion) : null,
        lastSeenAt: session.startedAt,
      }
    : null;
  const sessions = sessionRows.map((s) => ({
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    pagesVisited: s.pagesVisited,
    durationSec: s.endedAt ? Math.max(0, Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000)) : null,
  }));
  const otpSummary = { total: otpTokens.length, consumed: otpTokens.filter((t) => t.consumed).length };
  const nudgeSummary = {
    total: outboundRequests.length,
    delivered: outboundRequests.filter((r) => r.status === 'sent').length,
    failed: outboundRequests.filter((r) => r.status === 'failed').length,
    pending: outboundRequests.filter((r) => r.status === 'pending').length,
    lastError: [...outboundRequests].reverse().find((r) => r.lastError)?.lastError ?? null,
  };

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
    device,
    sessions,
    otpSummary,
    nudgeSummary,
    notifications,
    nextAction: nextActionFor(customer.currentStage),
  }, 'Customer 360');
}));

// GET /api/admin/customers/:id/timeline — paginated, newest first
customersRouter.get('/:id/timeline', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 50);
  const exists = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) throw new HttpError(404, 'Customer not found');

  const q = req.query as Record<string, string | undefined>;
  const where: Prisma.JourneyEventWhereInput = { customerId: req.params.id };
  if (q.channel) where.channel = q.channel;
  if (q.search && q.search.trim()) {
    const s = q.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { screen: { contains: s, mode: 'insensitive' } },
    ];
  }
  const [rows, total, channelGroups] = await Promise.all([
    prisma.journeyEvent.findMany({ where, orderBy: { occurredAt: 'desc' }, skip, take }),
    prisma.journeyEvent.count({ where }),
    // Channel counts for the whole customer (unfiltered) so the filter chips can
    // show how many of each there are.
    prisma.journeyEvent.groupBy({ by: ['channel'], where: { customerId: req.params.id }, _count: { _all: true } }),
  ]);

  return ok(
    res,
    {
      events: rows.map((e) => ({ ...e, stageLabel: e.stage ? STAGE_LABELS[e.stage] : null })),
      channels: channelGroups.map((g) => ({ channel: g.channel, count: g._count._all })),
    },
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
