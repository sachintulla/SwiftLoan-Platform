/**
 * Admin customer segmentation — read-only. Mounted at /api/admin/segments
 * behind requireAdmin. Feeds the campaign "Segmentation" picker
 * (campaigns.routes.ts's /:id/contacts/from-segments actually adds members
 * to a campaign; this module only lists segments and previews membership).
 */
import { Router } from 'express';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
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

// GET /api/admin/segments/:key/preview?limit=50 — sample members, for an admin to sanity-check before adding to a campaign.
segmentsRouter.get('/:key/preview', ah(async (req, res) => {
  const { key } = req.params;
  if (!isSegmentKey(key)) return fail(res, 404, `Unknown segment "${key}"`);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const members = await getSegmentMembers(key);
  return ok(res, { total: members.length, members: members.slice(0, limit) }, 'OK');
}));
