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
  requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER,
} from '../middleware/adminAuth.js';
import { reconcileStaleCalls, CALL_STALE_MINUTES } from '../lib/callReconcile.js';
import { scoped } from '../lib/log.js';

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

/** RFC 4180 escaping, plus a guard against spreadsheet formula injection. */
function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // A cell starting =, +, - or @ is executed as a formula by Excel/Sheets when
  // the file is opened — a lead named "=cmd|..." would run on the operator's
  // machine. Prefixing a quote neutralises it.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}

function sendCsv(res: import('express').Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel reads UTF-8 correctly — without it Indian names with
  // non-ASCII characters render as mojibake.
  return res.send('﻿' + csv);
}

/** Export cap — a full table dump would time out and blow memory. */
const EXPORT_LIMIT = 10_000;

// GET /api/admin/ops/export/customers.csv
adminOpsRouter.get('/export/customers.csv', ah(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = {};
  if (q.stage) where.currentStage = q.stage;
  if (q.source) where.firstSource = q.source;
  if (q.campaignId) where.campaignId = q.campaignId;

  const rows = await prisma.customer.findMany({
    where, orderBy: { lastActivityAt: 'desc' }, take: EXPORT_LIMIT,
  });

  const csv = toCsv(
    ['id', 'name', 'phone', 'email', 'city', 'source', 'campaign', 'stage',
     'stageEnteredAt', 'lastActivityAt', 'firstSeenAt', 'utmSource', 'utmCampaign'],
    rows.map((c) => [
      c.id, c.name, c.phone, c.email, c.city, c.firstSource, c.campaignId,
      c.currentStage, c.stageEnteredAt, c.lastActivityAt, c.firstSeenAt, c.utmSource, c.utmCampaign,
    ]),
  );
  return sendCsv(res, `customers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}));

// GET /api/admin/ops/export/calls.csv
adminOpsRouter.get('/export/calls.csv', ah(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = { channel: { in: ['phone_outbound', 'phone_inbound'] } };
  if (q.status) where.status = q.status;
  if (q.campaignId) where.campaignId = q.campaignId;

  const rows = await prisma.callAttempt.findMany({
    where,
    orderBy: { queuedAt: 'desc' },
    take: EXPORT_LIMIT,
    include: { customer: { select: { name: true, firstSource: true } }, campaign: { select: { name: true, code: true } } },
  });

  const csv = toCsv(
    ['id', 'phone', 'customer', 'source', 'campaign', 'status', 'outcome',
     'answered', 'durationSec', 'attempt', 'queuedAt', 'endedAt', 'error', 'recordingUrl'],
    rows.map((r) => [
      r.id, r.phone, r.customer?.name, r.customer?.firstSource, r.campaign?.code,
      r.status, r.outcome, r.answered, r.durationSec, r.attempt,
      r.queuedAt, r.endedAt, r.error, r.recordingUrl,
    ]),
  );
  return sendCsv(res, `calls-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}));

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
