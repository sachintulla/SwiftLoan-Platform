/**
 * Admin "API & Webhook Errors" page backend.
 *
 * GET /api/admin/api-errors        → failed rows from ApiLog (paginated) + facet counts
 * GET /api/admin/api-errors/facets → just the counts (targets, status classes, totals)
 *
 * Read-only over the existing ApiLog table (lib/apiLog.ts), which already records
 * every inbound request/response — webhook payloads received from Aurix / Yubi /
 * the app included — and every outbound call to Aurix / Yubi / Revasure, with its
 * error. This page surfaces only the failures (4xx/5xx or a captured error),
 * inside the admin dashboard and behind admin auth. Bodies are already redacted
 * for sensitive keys by lib/apiLog.ts; only failed calls are saved, and kept for `tracking.apiLogKeepDays` (Admin → Timings, default 30).
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin } from '../middleware/adminAuth.js';
import { baseErrorWhere, buildApiErrorWhere, classifyRow, IS_ERROR, IS_NOISE, STATUS_CLASSES, type ApiErrorFilters, type StatusClass } from '../lib/apiErrors.js';

export const adminApiErrorsRouter = Router();
adminApiErrorsRouter.use(requireAdmin);
adminApiErrorsRouter.use(requireActiveAdmin);

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function filtersFrom(q: Record<string, unknown>): ApiErrorFilters {
  return {
    direction: oneOf(q.direction, ['inbound', 'outbound'] as const),
    target: str(q.target),
    statusClass: oneOf(q.statusClass, STATUS_CLASSES),
    q: str(q.q)?.slice(0, 120) ?? null,
    from: parseDate(q.from),
    to: parseDate(q.to),
    includeNoise: q.includeNoise === '1',
  };
}

/**
 * Counts that drive the tiles and filter options: over all errors in the window, ignoring the chosen filters, except
 * that routine refusals (our own 401 / 429) are left out unless the page asked for them. `noise` is always their count,
 * so the page can say how many it is hiding.
 */
async function facets(includeNoise = false) {
  const base = baseErrorWhere(includeNoise);
  const [total, byTarget, byDirection, rows, noise] = await Promise.all([
    prisma.apiLog.count({ where: base }),
    prisma.apiLog.groupBy({ by: ['target'], where: base, _count: { _all: true } }),
    prisma.apiLog.groupBy({ by: ['direction'], where: base, _count: { _all: true } }),
    // Status class needs the raw status/error, so count in memory from a capped scan.
    prisma.apiLog.findMany({ where: base, select: { status: true, error: true }, take: 2000 }),
    prisma.apiLog.count({ where: { AND: [IS_ERROR, IS_NOISE] } }),
  ]);
  const byClass: Record<StatusClass, number> = { '4xx': 0, '5xx': 0, errored: 0 };
  for (const r of rows) {
    const c = classifyRow(r);
    if (c !== 'ok') byClass[c]++;
  }
  return {
    total,
    noise,
    includesNoise: includeNoise,
    byTarget: byTarget.map((t) => ({ target: t.target, count: t._count._all })).sort((a, b) => b.count - a.count),
    byDirection: byDirection.map((d) => ({ direction: d.direction, count: d._count._all })),
    byClass: STATUS_CLASSES.map((c) => ({ statusClass: c, count: byClass[c] })),
  };
}

// GET /api/admin/api-errors?direction=&target=&statusClass=&q=&from=&to=&page=&pageSize=
adminApiErrorsRouter.get('/', ah(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const { page, pageSize, skip, take } = pageParams(q);
  const where = buildApiErrorWhere(filtersFrom(q));

  const [rows, total, facet] = await Promise.all([
    prisma.apiLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true, createdAt: true, direction: true, source: true, target: true,
        method: true, url: true, status: true, durationMs: true,
        requestBody: true, responseBody: true, error: true, meta: true,
      },
    }),
    prisma.apiLog.count({ where }),
    facets(q.includeNoise === '1'),
  ]);

  const data = rows.map((r) => ({ ...r, statusClass: classifyRow(r) }));
  return ok(res, { rows: data, facets: facet }, 'API errors', paginate(page, pageSize, total));
}));

// GET /api/admin/api-errors/facets — counts only (for a sidebar badge / quick glance).
adminApiErrorsRouter.get('/facets', ah(async (_req, res) => {
  return ok(res, await facets((_req.query as Record<string, unknown>).includeNoise === '1'), 'API error facets');
}));
