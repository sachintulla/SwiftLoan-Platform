/**
 * WS5b — Ello agent directory, proxied for the campaign builder's picker.
 *
 * Server-side on purpose: the Ello API key must never reach the browser, and
 * the dashboard's own admin auth already gates this.
 */
import { Router } from 'express';
import { ah } from '../middleware/error.js';
import { ok } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { listElloAgents } from '../lib/integrations.js';

export const agentsRouter = Router();
agentsRouter.use(requireAdmin);
agentsRouter.use(requireActiveAdmin);
agentsRouter.use(auditAdmin);



// GET /api/admin/agents?search=&limit=
agentsRouter.get('/', ah(async (req, res) => {
  const search = req.query.search ? String(req.query.search) : undefined;
  const limit = Number(req.query.limit ?? 100);

  const result = await listElloAgents({ search, limit: Number.isFinite(limit) ? limit : 100 });

  // Always 200 with an `error` string rather than a 4xx/5xx: a missing or
  // misconfigured Ello key must not block campaign creation, since the builder
  // lets the operator type an agent id manually. The UI shows `error` inline.
  return ok(
    res,
    {
      agents: result.agents,
      error: result.ok ? null : (result.error ?? `Ello returned HTTP ${result.status}`),
      // Surfaced so the operator can tell a config problem from an empty
      // workspace without opening devtools.
      providerStatus: result.status,
    },
    result.ok ? 'Agents' : 'Agents unavailable',
  );
}));
