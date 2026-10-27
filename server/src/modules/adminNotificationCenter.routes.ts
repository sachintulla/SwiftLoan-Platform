/**
 * Admin Notifications page backend.
 *
 * GET  /api/admin/notification-center        filtered list, counts by type and severity, drill-down targets
 * POST /api/admin/notification-center/read   mark chosen rows (or the unread rows matching a filter) as read
 *
 * The older PATCH /api/admin/notifications/:id/read and POST .../read-all in
 * admin.routes.ts stay for compatibility; this page no longer calls read-all,
 * which marked every unread row in the system whatever was on screen.
 *
 * Marking single rows as read is open to every admin (read state is cosmetic and every POST is
 * audited). Marking every unread row that matches a filter needs an admin or super admin, because
 * read state is shared by the whole team.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, CAN_WRITE } from '../middleware/adminAuth.js';
import {
  buildBulkReadWhere, buildNotificationWhere, invalidBulkFilter, entityKind, needsAttention, severityLabel, targetFor, typeLabel, SEVERITIES,
} from '../lib/notificationCenter.js';

export const adminNotificationCenterRouter = Router();
adminNotificationCenterRouter.use(requireAdmin);
adminNotificationCenterRouter.use(requireActiveAdmin);
adminNotificationCenterRouter.use(auditAdmin);

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

// GET /api/admin/notification-center?state=unread|all&type=&severity=&page=&pageSize=
adminNotificationCenterRouter.get('/', ah(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const { page, pageSize, skip, take } = pageParams(q);
  const where = buildNotificationWhere({ state: str(q.state), type: str(q.type), severity: str(q.severity) });

  const [rows, total, filteredUnread, byTypeRead, bySeverityRead] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.notification.count({ where }),
    // Unread rows matching the type and severity filters: what 'Mark these as read' would change.
    prisma.notification.count({ where: buildBulkReadWhere({ type: str(q.type), severity: str(q.severity) }) }),
    // Counts ignore the filters on purpose, so the chips keep showing the real totals while one is selected.
    prisma.notification.groupBy({ by: ['type', 'read'], _count: { _all: true } }),
    prisma.notification.groupBy({ by: ['severity', 'read'], _count: { _all: true } }),
  ]);

  // Resolve each row's entity with one query per table, not per row.
  const loanIds = new Set<string>();
  const userIds = new Set<string>();
  for (const n of rows) {
    if (!n.entityId) continue;
    const kind = entityKind(n.type);
    if (kind === 'loan') loanIds.add(n.entityId);
    else if (kind === 'user') userIds.add(n.entityId);
  }
  const [loans, customers, users] = await Promise.all([
    loanIds.size
      ? prisma.loanApplication.findMany({
          where: { id: { in: [...loanIds] } },
          select: { id: true, ref: true, user: { select: { fullName: true, firstName: true, phone: true } } },
        })
      : Promise.resolve([]),
    userIds.size
      ? prisma.customer.findMany({ where: { userId: { in: [...userIds] } }, select: { id: true, userId: true, name: true, phone: true } })
      : Promise.resolve([]),
    userIds.size
      ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, fullName: true, firstName: true, phone: true } })
      : Promise.resolve([]),
  ]);
  const loanById = new Map(loans.map((l) => [l.id, l]));
  const customerByUser = new Map(customers.map((c) => [c.userId!, c]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const data = rows.map((n) => {
    const kind = entityKind(n.type);
    const loan = kind === 'loan' && n.entityId ? loanById.get(n.entityId) : undefined;
    const customer = kind === 'user' && n.entityId ? customerByUser.get(n.entityId) : undefined;
    const user = kind === 'user' && n.entityId ? userById.get(n.entityId) : undefined;

    let subject: { name: string | null; phone: string | null; ref: string | null } | null = null;
    if (loan) subject = { name: loan.user?.fullName ?? loan.user?.firstName ?? null, phone: loan.user?.phone ?? null, ref: loan.ref };
    else if (customer || user) {
      subject = { name: customer?.name ?? user?.fullName ?? user?.firstName ?? null, phone: customer?.phone ?? user?.phone ?? null, ref: null };
    }

    return {
      id: n.id,
      type: n.type,
      typeLabel: typeLabel(n.type),
      title: n.title,
      body: n.body ?? null,
      severity: n.severity,
      severityLabel: severityLabel(n.severity),
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      entityId: n.entityId ?? null,
      target: targetFor(n.type, n.entityId, { loan: loan ? { id: loan.id } : null, customer: customer ? { id: customer.id } : null }),
      subject,
    };
  });

  // Counts by type and by severity, built from the (type|severity, read) groups.
  const typeMap = new Map<string, { unread: number; total: number }>();
  for (const g of byTypeRead) {
    const cur = typeMap.get(g.type) ?? { unread: 0, total: 0 };
    cur.total += g._count._all;
    if (!g.read) cur.unread += g._count._all;
    typeMap.set(g.type, cur);
  }
  const sevUnread = new Map<string, number>(SEVERITIES.map((s) => [s, 0]));
  for (const g of bySeverityRead) if (!g.read) sevUnread.set(g.severity, (sevUnread.get(g.severity) ?? 0) + g._count._all);

  const byType = [...typeMap.entries()]
    .map(([type, c]) => ({ type, label: typeLabel(type), unread: c.unread, total: c.total }))
    .sort((a, b) => b.unread - a.unread || b.total - a.total || a.label.localeCompare(b.label));
  const bySeverity = SEVERITIES.map((s) => ({ severity: s, unread: sevUnread.get(s) ?? 0 }));
  const unread = byType.reduce((n, t) => n + t.unread, 0);
  const attention = bySeverity.filter((s) => needsAttention(s.severity)).reduce((n, s) => n + s.unread, 0);

  return ok(
    res,
    { rows: data, unread, needsAttention: attention, filteredUnread, counts: { byType, bySeverity } },
    'Notifications',
    paginate(page, pageSize, total),
  );
}));

const markReadBody = z.object({
  ids: z.array(z.string().min(1).max(64)).max(200).optional(),
  filter: z.object({ type: z.string().max(64).optional(), severity: z.string().max(16).optional() }).optional(),
});

// POST /api/admin/notification-center/read  { ids?: string[] (max 200), filter?: { type?, severity? } }
// ids marks just those rows; filter marks every UNREAD row matching it. Rows already read are never touched.
adminNotificationCenterRouter.post('/read', validate(markReadBody), ah(async (req, res) => {
  const body = req.body as z.infer<typeof markReadBody>;
  const ids = body.ids ?? [];
  const hasFilter = !!body.filter;
  const badFilter = invalidBulkFilter(body.filter);
  if (badFilter) throw new HttpError(400, badFilter);
  if (ids.length === 0 && !hasFilter) {
    throw new HttpError(400, 'Send ids or a filter. Nothing was marked as read.');
  }
  // A bulk clear changes what the whole team sees as unread, so it is not open to read-only roles.
  if (ids.length === 0 && !CAN_WRITE.includes(req.admin?.role ?? '')) {
    throw new HttpError(403, 'Marking many notifications as read needs an admin or super admin.');
  }

  const where = { ...(hasFilter ? buildBulkReadWhere(body.filter!) : { read: false }), ...(ids.length ? { id: { in: ids } } : {}) };
  const { count } = await prisma.notification.updateMany({ where, data: { read: true } });
  return ok(res, { updated: count }, count === 1 ? 'Marked 1 notification as read' : `Marked ${count} notifications as read`);
}));
