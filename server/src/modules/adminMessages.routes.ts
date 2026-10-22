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

// GET /api/admin/messages?channel=&status=&kind=&stuck=1&search=&page=
adminMessagesRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 25);
  const q = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = {};
  if (q.channel && CHANNELS.includes(q.channel)) where.channel = q.channel;
  if (q.status && STATUSES.includes(q.status)) where.status = q.status;
  if (q.kind) where.kind = q.kind;
  if (q.stuck === '1') {
    where.channel = 'whatsapp';
    where.status = { in: ['queued', 'sent'] };
    where.createdAt = { lt: new Date(Date.now() - STUCK_AFTER_MS) };
  }
  const search = (q.search ?? '').trim();
  if (search) where.OR = [{ phone: { contains: search.replace(/\D/g, '') || search } }, { providerRef: { contains: search } }, { referenceId: { contains: search } }, { template: { contains: search } }];

  const [rows, total] = await Promise.all([
    prisma.messageDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.messageDelivery.count({ where }),
  ]);
  return ok(res, rows.map(withFlags), 'Messages', paginate(page, pageSize, total));
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
  return ok(res, withFlags(row), 'Message');
}));
