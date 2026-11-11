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
  classifyConfidence, computeInstallStats, computeInstallFunnel, countBy, effectiveSentBy, normaliseRef, parseInstallLinkPayload, pickContext,
  refLookupVariants, applyInstallFilters, SENT_BY_TYPES, CHANNEL_FILTER_VALUES,
  type ContextSources, type InstallRow,
} from '../lib/installContextRead.js';

/** Bare 10-digit Indian mobile, the shared join key across User / Customer / CallAttempt / MessageDelivery. */
function norm10(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/\D/g, '');
  if (!d) return null;
  const ten = d.length > 10 && d.startsWith('91') ? d.slice(2) : d;
  return ten.length === 10 ? ten : null;
}

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

  // Wave 1 — everything keyed by the link's ref token. One query per table, never one per row.
  const [links, reminders, nudges, leads, referralCodes] = await Promise.all([
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
  ]);

  // The phone that travelled with each link (reminder/nudge/lead), indexed by ref token.
  // This is what makes Customer / Loan / Stage live even for installs that were never
  // tied to a user id: most installs carry no play-referrer, so matchedUserId stays null,
  // but the link always carried a phone we can resolve to the person's current record.
  const phoneByToken = new Map<string, string>();
  const addPhone = (token: string | null, phone: string | null) => {
    const k = normaliseRef(token); const p = norm10(phone);
    if (k && p && !phoneByToken.has(k)) phoneByToken.set(k, p);
  };
  for (const r of reminders) addPhone(r.token, r.phone);
  for (const n of nudges) addPhone(n.token, n.phone);
  for (const l of leads) addPhone(l.token, l.phone);

  // Wave 2 — resolve the people. Phones from links become users; matched users stay matched.
  const refPhones = [...new Set(phoneByToken.values())];
  const phoneUsers = refPhones.length
    ? await prisma.user.findMany({ where: { phone: { in: refPhones } }, select: { id: true, fullName: true, firstName: true, phone: true } })
    : [];
  const userByPhone = new Map(phoneUsers.map((u) => [norm10(u.phone)!, u]));

  // Effective user per download: the matched user, else the user the link's phone resolves to.
  const effUserId = new Map<string, string>(); // downloadId -> userId
  for (const d of downloads) {
    const key = normaliseRef(d.referrer);
    const viaPhone = key ? userByPhone.get(phoneByToken.get(key) ?? '') : undefined;
    const uid = d.matchedUserId ?? viaPhone?.id ?? null;
    if (uid) effUserId.set(d.id, uid);
  }
  const resolvedUserIds = [...new Set(effUserId.values())];
  // Every phone we might have reached this person on (matched user's own phone + link phones).
  const allPhones = [...new Set([...refPhones])];

  // Wave 3 — live state for the resolved people + the last time we reached them on any channel.
  const [customers, loans, messages, calls] = await Promise.all([
    resolvedUserIds.length
      ? prisma.customer.findMany({ where: { userId: { in: resolvedUserIds } }, select: { id: true, userId: true, name: true, phone: true, currentStage: true } })
      : Promise.resolve([]),
    resolvedUserIds.length
      ? prisma.loanApplication.findMany({
          where: { userId: { in: resolvedUserIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['userId'],
          select: { userId: true, amount: true, loanType: true, status: true, _count: { select: { offers: true } } },
        })
      : Promise.resolve([]),
    allPhones.length
      ? prisma.messageDelivery.findMany({
          where: { phone: { in: allPhones } },
          orderBy: { createdAt: 'desc' },
          select: { phone: true, channel: true, createdAt: true },
        })
      : Promise.resolve([]),
    allPhones.length
      ? prisma.callAttempt.findMany({
          where: { phone: { in: allPhones } },
          orderBy: { startedAt: 'desc' },
          select: { phone: true, channel: true, startedAt: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  // Matched users may have a phone the link never carried — fold those in for the name lookups.
  const userIdsForNames = [...new Set([...userIds, ...resolvedUserIds])];

  // Latest contact per bare phone, across SMS/WhatsApp (MessageDelivery) and calls (CallAttempt).
  const lastContactByPhone = new Map<string, { at: string; channel: string }>();
  const noteContact = (phone: string | null, when: Date | null | undefined, channel: string) => {
    const p = norm10(phone); if (!p || !when) return;
    const prev = lastContactByPhone.get(p);
    if (!prev || when.getTime() > new Date(prev.at).getTime()) lastContactByPhone.set(p, { at: when.toISOString(), channel });
  };
  for (const m of messages) noteContact(m.phone, m.createdAt, m.channel === 'whatsapp' ? 'WhatsApp' : 'SMS');
  for (const c of calls) noteContact(c.phone, c.startedAt ?? c.createdAt, 'Call');

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
  const nameUserIds = [...new Set([...userIdsForNames, ...ownerIds])];
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
    // The person, resolved live: the matched user, else whoever the link's phone belongs to.
    const uid = effUserId.get(d.id);
    const user = uid ? userById.get(uid) : undefined;
    const cust = uid ? custByUser.get(uid) : undefined;
    const loan = uid ? loanByUser.get(uid) : undefined;
    const phoneKey = (key ? phoneByToken.get(key) : null) ?? norm10(cust?.phone) ?? norm10(user?.phone);
    const lastContact = phoneKey ? lastContactByPhone.get(phoneKey) ?? null : null;

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
      signedIn: !!uid,
      application: loan ? { status: loan.status, offerCount: loan._count.offers } : null,
      lastContact,
    };
  });

  // Stats, the funnel and the source charts describe the whole date window; the filters narrow only the table.
  const stats = computeInstallStats(all);
  const funnel = computeInstallFunnel(all);
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
    { rows: filtered.slice(skip, skip + take), stats, funnel, bySource, byPlatform, truncated },
    'Installs',
    paginate(page, pageSize, filtered.length),
  );
}));
