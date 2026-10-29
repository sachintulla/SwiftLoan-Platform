/**
 * Admin "App Downloads": installs with the context that travelled with the link.
 *
 * GET /api/admin/installs is read-only, so any signed-in admin may call it. It
 * leaves GET /api/admin/downloads (admin.routes.ts) untouched.
 *
 * AppDownload has no foreign keys, so the context filters (name, stage, sender,
 * channel) cannot be SQL filters. The handler loads the installs in the date
 * range (newest first, capped), enriches them with one batched query per table,
 * filters in memory and then paginates. The rules live in lib/installContextRead.ts.
 *
 * Nothing sensitive is read: the selects below name their columns, so no PAN,
 * Aadhaar or OTP value can reach the response.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin } from '../middleware/adminAuth.js';
import { STAGE_LABELS } from '../lib/journey.js';
import {
  classifyConfidence, computeInstallStats, countBy, effectiveSentBy, normaliseRef, parseInstallLinkPayload, pickContext,
  refLookupVariants, applyInstallFilters, SENT_BY_TYPES, CHANNEL_FILTER_VALUES,
  type ContextSources, type InstallRow,
} from '../lib/installContextRead.js';

export const adminInstallsRouter = Router();
adminInstallsRouter.use(requireAdmin);
adminInstallsRouter.use(requireActiveAdmin);

/** Most installs read per request. A window with more says so (`truncated`) instead of silently dropping rows. */
const MAX_ROWS = 2000;

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// GET /api/admin/installs?from=&to=&page=&pageSize=&search=&stage=&sentBy=&channel=&platform=&followUp=1
adminInstallsRouter.get('/', ah(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const { page, pageSize, skip, take } = pageParams(q);

  const installedAt: { gte?: Date; lte?: Date } = {};
  const from = parseDate(q.from);
  const to = parseDate(q.to);
  if (from) installedAt.gte = from;
  if (to) installedAt.lte = to;

  const downloads = await prisma.appDownload.findMany({
    where: Object.keys(installedAt).length ? { installedAt } : {},
    orderBy: { installedAt: 'desc' },
    take: MAX_ROWS,
    select: { id: true, platform: true, source: true, campaignId: true, referrer: true, matchedUserId: true, matchMethod: true, installedAt: true },
  });
  const truncated = downloads.length >= MAX_ROWS;

  // ── batch keys ──
  const userIds = [...new Set(downloads.map((d) => d.matchedUserId).filter((v): v is string => !!v))];
  const refSet = new Set<string>(); // every spelling to look up
  for (const d of downloads) for (const v of refLookupVariants(d.referrer)) refSet.add(v);
  const refs = [...refSet];
  const linkKeys = refs.map((r) => `install_link:${r}`);

  // One query per table, never one per row. Each is skipped when it has nothing to look up.
  const [links, reminders, nudges, leads, referralCodes, customers, loans] = await Promise.all([
    linkKeys.length
      ? prisma.outboundRequest.findMany({
          where: { kind: 'install_link', status: 'sent', idempotencyKey: { in: linkKeys } },
          select: { idempotencyKey: true, payload: true, sentAt: true, createdAt: true },
        })
      : Promise.resolve([]),
    refs.length
      ? prisma.journeyReminder.findMany({ where: { token: { in: refs } }, select: { token: true, firstName: true, phone: true, history: true, createdAt: true } })
      : Promise.resolve([]),
    refs.length
      ? prisma.lenderNudge.findMany({ where: { token: { in: refs } }, select: { token: true, firstName: true, phone: true, lenderName: true, history: true, createdAt: true } })
      : Promise.resolve([]),
    refs.length
      ? prisma.lead.findMany({ where: { token: { in: refs } }, select: { token: true, name: true, phone: true, productInterest: true, amount: true, source: true, createdAt: true } })
      : Promise.resolve([]),
    refs.length
      ? prisma.referralCode.findMany({ where: { code: { in: refs } }, select: { code: true, userId: true } })
      : Promise.resolve([]),
    userIds.length
      ? prisma.customer.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true, name: true, phone: true, currentStage: true } })
      : Promise.resolve([]),
    userIds.length
      ? prisma.loanApplication.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['userId'],
          select: { userId: true, amount: true, loanType: true },
        })
      : Promise.resolve([]),
  ]);

  // Second wave: names for the matched users, the admins who pushed links, and referral owners.
  const adminIds = new Set<string>();
  const parsedLinks = new Map<string, { info: ReturnType<typeof parseInstallLinkPayload>; recordedAt: string | null }>();
  for (const l of links) {
    const key = normaliseRef(l.idempotencyKey.slice('install_link:'.length));
    if (!key) continue;
    const info = parseInstallLinkPayload(l.payload);
    if (info.sentById) adminIds.add(info.sentById);
    parsedLinks.set(key, { info, recordedAt: iso(l.sentAt ?? l.createdAt) });
  }
  const ownerIds = [...new Set(referralCodes.map((r) => r.userId))];
  const nameUserIds = [...new Set([...userIds, ...ownerIds])];
  const [users, admins] = await Promise.all([
    nameUserIds.length
      ? prisma.user.findMany({ where: { id: { in: nameUserIds } }, select: { id: true, fullName: true, firstName: true, phone: true } })
      : Promise.resolve([]),
    adminIds.size
      ? prisma.adminUser.findMany({ where: { id: { in: [...adminIds] } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ]);

  // ── index everything by normalised ref / user ──
  const byToken = <T extends { token: string | null }>(arr: T[]) => {
    const m = new Map<string, T>();
    for (const x of arr) { const k = normaliseRef(x.token); if (k && !m.has(k)) m.set(k, x); }
    return m;
  };
  const reminderBy = byToken(reminders);
  const nudgeBy = byToken(nudges);
  const leadBy = byToken(leads);
  const codeOwner = new Map(referralCodes.map((r) => [r.code.toUpperCase(), r.userId]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const adminById = new Map(admins.map((a) => [a.id, a]));
  const custByUser = new Map(customers.map((c) => [c.userId!, c]));
  const loanByUser = new Map(loans.map((l) => [l.userId, l]));

  const all: InstallRow[] = downloads.map((d) => {
    const key = normaliseRef(d.referrer);
    const user = d.matchedUserId ? userById.get(d.matchedUserId) : undefined;
    const cust = d.matchedUserId ? custByUser.get(d.matchedUserId) : undefined;
    const loan = d.matchedUserId ? loanByUser.get(d.matchedUserId) : undefined;

    const link = key ? parsedLinks.get(key) : undefined;
    const reminder = key ? reminderBy.get(key) : undefined;
    const nudge = key ? nudgeBy.get(key) : undefined;
    const lead = key ? leadBy.get(key) : undefined;
    const ownerId = key ? codeOwner.get(key) : undefined;
    const owner = ownerId ? userById.get(ownerId) : undefined;
    const admin = link?.info.sentById ? adminById.get(link.info.sentById) : undefined;

    const sources: ContextSources = {
      ref: d.referrer,
      source: d.source,
      campaignId: d.campaignId,
      installLink: link ? { ...link.info, adminLabel: admin?.name ?? admin?.email ?? null, recordedAt: link.recordedAt } : null,
      reminder: reminder ? { firstName: reminder.firstName, phone: reminder.phone, history: reminder.history, createdAt: iso(reminder.createdAt) } : null,
      lenderNudge: nudge ? { firstName: nudge.firstName, phone: nudge.phone, lenderName: nudge.lenderName, history: nudge.history, createdAt: iso(nudge.createdAt) } : null,
      lead: lead ? { name: lead.name, phone: lead.phone, productInterest: lead.productInterest, amountRupees: lead.amount, source: lead.source, createdAt: iso(lead.createdAt) } : null,
      referral: ownerId ? { ownerName: owner?.firstName ?? owner?.fullName ?? null } : null,
      loan: loan ? { amountRupees: loan.amount, loanType: loan.loanType } : null,
    };

    return {
      id: d.id,
      installedAt: d.installedAt.toISOString(),
      platform: d.platform,
      source: d.source,
      campaignId: d.campaignId ?? null,
      matchMethod: d.matchMethod ?? null,
      confidence: classifyConfidence(d.matchMethod),
      customer: cust
        ? {
            id: cust.id,
            userId: cust.userId,
            name: cust.name ?? user?.fullName ?? user?.firstName ?? null,
            phone: cust.phone ?? user?.phone ?? null,
            stage: cust.currentStage,
            stageLabel: STAGE_LABELS[cust.currentStage] ?? cust.currentStage,
          }
        : null,
      context: pickContext(sources),
      signedIn: !!d.matchedUserId,
    };
  });

  // Stats and the source charts describe the whole date window; the filters narrow only the table.
  const stats = computeInstallStats(all);
  const bySource = countBy(all, (r) => effectiveSentBy(r.context)).map((g) => ({ source: g.key, count: g.count }));
  const byPlatform = countBy(all, (r) => r.platform).map((g) => ({ platform: g.key, count: g.count }));

  const filtered = applyInstallFilters(all, {
    search: typeof q.search === 'string' ? q.search.slice(0, 80) : null,
    stage: typeof q.stage === 'string' && q.stage in STAGE_LABELS ? q.stage : null,
    sentBy: oneOf(q.sentBy, SENT_BY_TYPES),
    channel: oneOf(q.channel, CHANNEL_FILTER_VALUES),
    platform: oneOf(q.platform, ['android', 'ios'] as const),
    followUp: q.followUp === '1' || q.followUp === 'true',
  });

  return ok(
    res,
    { rows: filtered.slice(skip, skip + take), stats, bySource, byPlatform, truncated },
    'Installs',
    paginate(page, pageSize, filtered.length),
  );
}));
