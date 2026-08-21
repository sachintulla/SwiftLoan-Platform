/**
 * Admin customer segmentation — read-only. Mounted at /api/admin/segments
 * behind requireAdmin. Feeds the campaign "Segmentation" picker
 * (campaigns.routes.ts's /:id/contacts/from-segments actually adds members
 * to a campaign; this module only lists segments and previews membership).
 */
import { Router } from 'express';
import { ah } from '../middleware/error.js';
import { ok, fail, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin } from '../middleware/adminAuth.js';
import { SEGMENT_KEYS, SEGMENT_DEFS, getSegmentCounts, getSegmentMembers, type SegmentKey } from '../lib/segments.js';

export const segmentsRouter = Router();
segmentsRouter.use(requireAdmin);
segmentsRouter.use(requireActiveAdmin);
segmentsRouter.use(auditAdmin);

function isSegmentKey(v: string): v is SegmentKey {
  return (SEGMENT_KEYS as string[]).includes(v);
}

// GET /api/admin/segments — the default segments with live counts.
segmentsRouter.get('/', ah(async (_req, res) => {
  const counts = await getSegmentCounts();
  const segments = SEGMENT_KEYS.map((key) => ({ key, ...SEGMENT_DEFS[key], count: counts[key] }));
  return ok(res, { segments }, 'OK');
}));

// GET /api/admin/segments/:key/members?search=&sinceDays=&page=&pageSize=
// Paginated, filterable membership listing — feeds the "choose specific
// contacts" picker so an admin can narrow a large segment down by name/phone
// and recency before selecting individuals.
segmentsRouter.get('/:key/members', ah(async (req, res) => {
  const { key } = req.params;
  if (!isSegmentKey(key)) return fail(res, 404, `Unknown segment "${key}"`);
  const search = req.query.search ? String(req.query.search) : undefined;
  const sinceDays = req.query.sinceDays != null && req.query.sinceDays !== '' ? Number(req.query.sinceDays) : undefined;
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 50);

  const members = await getSegmentMembers(key, { search, sinceDays: Number.isFinite(sinceDays) ? sinceDays : undefined });
  const total = members.length;
  const pageRows = members.slice(skip, skip + take);
  return ok(res, { members: pageRows }, 'OK', paginate(page, pageSize, total));
}));

// GET /api/admin/segments/:key/preview?limit=50 — kept for a quick unpaginated
// sample (e.g. a summary tooltip); the picker modal uses /members instead.
segmentsRouter.get('/:key/preview', ah(async (req, res) => {
  const { key } = req.params;
  if (!isSegmentKey(key)) return fail(res, 404, `Unknown segment "${key}"`);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const members = await getSegmentMembers(key);
  return ok(res, { total: members.length, members: members.slice(0, limit) }, 'OK');
}));
