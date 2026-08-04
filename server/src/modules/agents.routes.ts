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
import { prisma } from '../lib/prisma.js';
import { fail } from '../lib/http.js';
import { agentRoleStatus, AGENT_ROLE_INFO, AGENT_ROLES } from '../lib/agents.js';

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

/**
 * GET /api/admin/agents/roles
 *
 * Which Ello agent plays which role, and how that id was resolved (dashboard
 * override / env var / workspace default). Surfaced because "the call used the
 * wrong agent" is otherwise invisible — every role silently falls back to the
 * workspace default, which is the right behaviour but needs to be *visible*.
 */
agentsRouter.get('/roles', ah(async (_req, res) => {
  const roles = await agentRoleStatus();
  return ok(
    res,
    {
      roles: roles.map((r) => ({ ...r, ...AGENT_ROLE_INFO[r.role] })),
      dedicated: roles.filter((r) => r.dedicated).length,
      shared: roles.filter((r) => !r.dedicated && r.agentId).length,
      unconfigured: roles.filter((r) => !r.agentId).length,
    },
    'Agent roles',
  );
}));

/**
 * PUT /api/admin/agents/roles  { agents: { leadCallback?: string, ... } }
 *
 * Point a role at a specific agent without a redeploy — the path the operator
 * uses when new agent ids arrive. Stored in the Ello IntegrationConfig settings
 * so it sits with the rest of that provider's config.
 */
agentsRouter.put('/roles', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const incoming = (req.body?.agents ?? {}) as Record<string, unknown>;

  const next: Record<string, string> = {};
  for (const role of AGENT_ROLES) {
    const v = String(incoming[role] ?? '').trim();
    // An empty value clears the override and returns the role to the default,
    // which is a legitimate thing to want.
    if (v) next[role] = v;
  }

  const unknown = Object.keys(incoming).filter((k) => !AGENT_ROLES.includes(k as any));
  if (unknown.length) return fail(res, 400, `Unknown role(s): ${unknown.join(', ')}`);

  const existing = await prisma.integrationConfig.findUnique({ where: { provider: 'ello' } });
  if (!existing) return fail(res, 404, 'Ello integration is not configured yet');

  const settings = { ...((existing.settings as any) ?? {}), agents: next };
  await prisma.integrationConfig.update({ where: { provider: 'ello' }, data: { settings } });

  return ok(res, { agents: next }, 'Agent roles updated');
}));
