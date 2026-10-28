/**
 * WS6 — admin operations: audit log, CSV export, and Ello reconciliation.
 *
 * Mounted at /api/admin/ops.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import {
  requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER, CAN_WRITE,
} from '../middleware/adminAuth.js';
import { reconcileStaleCalls, CALL_STALE_MINUTES } from '../lib/callReconcile.js';
import { scoped } from '../lib/log.js';
import { toCsv } from '../lib/csv.js';
import { auditExport, sendCsv, csvFilename } from '../lib/exportAudit.js';
import { EXPORT_LIMIT, buildCustomerExportWhere, qStr } from '../lib/listFilters.js';

const log = scoped('admin-ops');

export const adminOpsRouter = Router();
adminOpsRouter.use(requireAdmin);
adminOpsRouter.use(requireActiveAdmin);
adminOpsRouter.use(auditAdmin);

/* ─────────────────────────── audit log ─────────────────────────── */

// GET /api/admin/ops/audit?adminId=&action=&entity=&page=
adminOpsRouter.get('/audit', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 50);
  const q = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (q.adminId) where.adminId = q.adminId;
  if (q.action) where.action = { contains: q.action };
  if (q.entity) where.entity = q.entity;
  if (q.entityId) where.entityId = q.entityId;

  const [rows, total, actions] = await Promise.all([
    prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.adminAuditLog.count({ where }),
    // Distinct actions, so the UI filter offers only what actually occurs.
    prisma.adminAuditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 40 }),
  ]);

  return ok(
    res,
    { entries: rows, actions: actions.map((a) => ({ action: a.action, count: a._count._all })) },
    'Audit log',
    paginate(page, pageSize, total),
  );
}));

/* ─────────────────────────── CSV export ─────────────────────────── */

// Both exports need CAN_WRITE (the analyst role cannot take customer data out) and are
// audited: auditAdmin skips GET, so each export records itself with auditExport.

// GET /api/admin/ops/export/customers.csv?stage=&source=&campaignId=&search=&from=&to=&stalledMinutes=
// Follows every filter the Customers page has, through the same builder rules as the list.
adminOpsRouter.get('/export/customers.csv', requireRole(...CAN_WRITE), ah(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const where = buildCustomerExportWhere(q);

  const found = await prisma.customer.findMany({
    where, orderBy: { lastActivityAt: 'desc' }, take: EXPORT_LIMIT + 1,
  });
  const truncated = found.length > EXPORT_LIMIT;
  const rows = found.slice(0, EXPORT_LIMIT);

  const csv = toCsv(
    ['id', 'name', 'phone', 'email', 'city', 'source', 'campaign', 'stage',
     'stageEnteredAt', 'lastActivityAt', 'firstSeenAt', 'utmSource', 'utmCampaign'],
    rows.map((c) => [
      c.id, c.name, c.phone, c.email, c.city, c.firstSource, c.campaignId,
      c.currentStage, c.stageEnteredAt, c.lastActivityAt, c.firstSeenAt, c.utmSource, c.utmCampaign,
    ]),
  );
  await auditExport(req, {
    name: 'customers',
    filters: pickDefined(q, ['stage', 'source', 'campaignId', 'search', 'from', 'to', 'stalledMinutes']),
    rows: rows.length,
    truncated,
  });
  return sendCsv(res, csvFilename('customers'), csv);
}));

// GET /api/admin/ops/export/calls.csv?status=&campaignId=
adminOpsRouter.get('/export/calls.csv', requireRole(...CAN_WRITE), ah(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = { channel: { in: ['phone_outbound', 'phone_inbound'] } };
  if (q.status) where.status = q.status;
  if (q.campaignId) where.campaignId = q.campaignId;

  const found = await prisma.callAttempt.findMany({
    where,
    orderBy: { queuedAt: 'desc' },
    take: EXPORT_LIMIT + 1,
    include: { customer: { select: { name: true, firstSource: true } }, campaign: { select: { name: true, code: true } } },
  });
  const truncated = found.length > EXPORT_LIMIT;
  const rows = found.slice(0, EXPORT_LIMIT);

  const csv = toCsv(
    ['id', 'phone', 'customer', 'source', 'campaign', 'status', 'outcome',
     'answered', 'durationSec', 'attempt', 'queuedAt', 'endedAt', 'error'],
    rows.map((r) => [
      r.id, r.phone, r.customer?.name, r.customer?.firstSource, r.campaign?.code,
      r.status, r.outcome, r.answered, r.durationSec, r.attempt,
      r.queuedAt, r.endedAt, r.error,
    ]),
  );
  await auditExport(req, {
    name: 'calls_legacy',
    filters: pickDefined(q, ['status', 'campaignId']),
    rows: rows.length,
    truncated,
  });
  return sendCsv(res, csvFilename('calls'), csv);
}));

/** The named query params that were actually set, for the audit record. */
function pickDefined(q: Record<string, unknown>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = qStr(q[k]);
    if (v) out[k] = v;
  }
  return out;
}

/* ─────────────────── stale-call reconciliation ─────────────────── */

// POST /api/admin/ops/reconcile-calls  { olderThanMinutes? }
// The same sweep the `call-reconcile` job runs automatically; exposed so an
// operator can unwedge a campaign without waiting for the next tick.
adminOpsRouter.post('/reconcile-calls', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const raw = Number((req.body as Record<string, unknown> | undefined)?.olderThanMinutes);
  const r = await reconcileStaleCalls(Number.isFinite(raw) ? raw : CALL_STALE_MINUTES);
  log.info('manual reconcile run', r);

  return ok(
    res,
    r,
    r.checked
      ? `Closed ${r.updated} stale call(s); released ${r.contactsReleased} contact(s) for retry`
      : 'No stale calls to reconcile',
  );
}));
