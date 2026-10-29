/**
 * Admin view of outbound messages and what happened to them. Mounted at /api/admin/messages.
 * A 200 from the send API only means "queued"; this shows whether each WhatsApp message was then sent, delivered,
 * read, or failed (and why), and flags the ones the gateway accepted but never reported on.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin } from '../middleware/adminAuth.js';
import { getProviderConfig } from '../lib/integrations.js';
import { defaultCallbackUrl } from '../lib/messageCallback.js';
import { STUCK_AFTER_MS, isStuck } from '../lib/messageStatus.js';
import type { MessageMeta } from '../lib/messageDelivery.js';
import { isSeeded, readLibrary, renderTemplateText, starterLibrary } from '../lib/voxTemplates.js';

export const adminMessagesRouter = Router();
adminMessagesRouter.use(requireAdmin);
adminMessagesRouter.use(requireActiveAdmin);
adminMessagesRouter.use(auditAdmin);

const STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'];
const CHANNELS = ['whatsapp', 'sms'];

const withFlags = <T extends { status: string; channel: string; createdAt: Date }>(r: T) => ({
  ...r,
  // SMS has no delivery callback here, so only WhatsApp can be "stuck".
  stuck: r.channel === 'whatsapp' && isStuck(r),
});

const RANGES: Record<string, number> = { '24h': 24 * 3_600_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };

/** Add what the sent-messages table needs: the person's name, the message text (when the template text is recorded), and what triggered it. */
async function enrich<T extends { customerId: string | null; template: string | null; meta: unknown }>(rows: T[]) {
  const [cfg, customers] = await Promise.all([
    getProviderConfig('voxvalley').catch(() => null),
    prisma.customer.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
  ]);
  // Until someone opens the Templates tab nothing is saved yet; the starter list (with the texts we already know) stands in.
  const stored = cfg?.settings?.templateLibrary;
  const bodies = new Map(readLibrary(isSeeded(stored) ? stored : starterLibrary()).map((t) => [t.name, t.body]));
  const names = new Map(customers.map((c) => [c.id, c.name]));
  return rows.map((r) => {
    const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as MessageMeta;
    const body = r.template ? bodies.get(r.template) : undefined;
    return {
      ...r,
      name: r.customerId ? names.get(r.customerId) ?? null : null,
      language: meta.language ?? null,
      category: meta.category ?? null,
      variables: meta.placeholders ?? null,
      trigger: meta.trigger ?? null,
      text: meta.text ? meta.text : body && body.trim() ? renderTemplateText(body, meta.placeholders ?? []) : null,
    };
  });
}

// GET /api/admin/messages?channel=&status=&kind=&template=&range=24h|7d|30d&stuck=1&search=&page=
adminMessagesRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 25);
  const q = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = {};
  if (q.channel && CHANNELS.includes(q.channel)) where.channel = q.channel;
  if (q.status) {
    const list = q.status.split(',').filter((x) => STATUSES.includes(x));
    if (list.length === 1) where.status = list[0];
    else if (list.length > 1) where.status = { in: list };
  }
  if (q.kind) where.kind = q.kind;
  if (q.template) where.template = q.template;
  if (q.range && RANGES[q.range]) where.createdAt = { gte: new Date(Date.now() - RANGES[q.range]) };
  if (q.stuck === '1') {
    where.channel = 'whatsapp';
    where.status = { in: ['queued', 'sent'] };
    // "No report" can be combined with a date range: both bounds apply.
    where.createdAt = { ...((where.createdAt as object | undefined) ?? {}), lt: new Date(Date.now() - STUCK_AFTER_MS) };
  }
  const search = (q.search ?? '').trim();
  if (search) where.OR = [{ phone: { contains: search.replace(/\D/g, '') || search } }, { providerRef: { contains: search } }, { referenceId: { contains: search } }, { template: { contains: search } }];

  const [rows, total] = await Promise.all([
    prisma.messageDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.messageDelivery.count({ where }),
  ]);
  return ok(res, (await enrich(rows)).map(withFlags), 'Messages', paginate(page, pageSize, total));
}));

// GET /api/admin/messages/facets — what the filter menus can offer: the templates and triggers that actually appear.
adminMessagesRouter.get('/facets', ah(async (req, res) => {
  const channel = CHANNELS.includes(String(req.query.channel)) ? String(req.query.channel) : undefined;
  const [templates, kinds] = await Promise.all([
    prisma.messageDelivery.groupBy({ by: ['template'], where: { ...(channel ? { channel } : {}), template: { not: null } }, _count: { _all: true }, orderBy: { template: 'asc' } }),
    prisma.messageDelivery.groupBy({ by: ['kind'], where: channel ? { channel } : {}, _count: { _all: true } }),
  ]);
  return ok(res, {
    templates: templates.map((t) => ({ name: t.template as string, count: t._count._all })),
    kinds: kinds.map((k) => ({ kind: k.kind, count: k._count._all })),
  }, 'Message filters');
}));

// GET /api/admin/messages/summary — last 24 h by status, how many are stuck, and whether reports can arrive at all.
adminMessagesRouter.get('/summary', ah(async (_req, res) => {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const grouped = await prisma.messageDelivery.groupBy({ by: ['channel', 'status'], where: { createdAt: { gte: since } }, _count: { _all: true } });
  const counts: Record<string, Record<string, number>> = { whatsapp: {}, sms: {} };
  for (const g of grouped) (counts[g.channel] ??= {})[g.status] = g._count._all;
  const stuck = await prisma.messageDelivery.count({
    where: { channel: 'whatsapp', status: { in: ['queued', 'sent'] }, createdAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
  });
  const cfg = await getProviderConfig('voxvalley').catch(() => null);
  const explicitCallback = String(cfg?.settings?.callbackUrl ?? '').trim();
  return ok(res, {
    counts, stuck,
    // Without a callback URL the gateway has nowhere to report delivery, so every message would sit at "queued".
    callbackConfigured: !!explicitCallback || !!defaultCallbackUrl(),
    webhookKeySet: !!(process.env.WHATSAPP_WEBHOOK_KEY ?? '').trim(),
    publicBaseIsHttps: (process.env.PUBLIC_BASE_URL ?? '').toLowerCase().startsWith('https://'),
  }, 'Message summary');
}));

// GET /api/admin/messages/:id — one message with every status report received.
adminMessagesRouter.get('/:id', ah(async (req, res) => {
  const row = await prisma.messageDelivery.findUnique({ where: { id: req.params.id } });
  if (!row) throw new HttpError(404, 'Message not found');
  return ok(res, withFlags((await enrich([row]))[0]), 'Message');
}));
