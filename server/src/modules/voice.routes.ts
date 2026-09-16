/**
 * WS9 — server-side proxy for starting an Ello voice session.
 *
 * Two independent reasons this must not happen in the browser:
 *
 * 1. IT CANNOT. Ello's api-in returns no `Access-Control-Allow-Origin` at all,
 *    sets `Cross-Origin-Resource-Policy: same-origin`, and omits `X-API-Key`
 *    from `Access-Control-Allow-Headers`. A browser therefore fails the preflight
 *    and the widget dies with the opaque "Failed to fetch".
 *
 * 2. IT SHOULDN'T. Doing it client-side means shipping the Ello API key to every
 *    visitor as `NEXT_PUBLIC_ELLO_API_KEY` — readable in devtools by anyone, and
 *    usable to run up call charges on the account or to reconfigure agents.
 *
 * The browser therefore asks us for a session by ROLE, never by agent id or key.
 * Accepting an arbitrary `assistant_id` would let a caller point our key at any
 * agent in the workspace, so the id is resolved server-side from the same
 * registry the dialler uses.
 *
 * PUBLIC by necessity — the marketing site has no login. That makes it a spend
 * surface, so it is rate-limited and only the three in-session roles are allowed.
 */
import { Router } from 'express';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { getProviderConfig } from '../lib/integrations.js';
import { agentIdFor, type AgentRole } from '../lib/agents.js';
import { scoped } from '../lib/log.js';

const log = scoped('voice');

export const voiceRouter = Router();

/**
 * Roles reachable from a browser/app session.
 *
 * Deliberately excludes `leadCallback` and `campaign`: those place *outbound
 * telephone calls*, and must never be startable by an anonymous web visitor.
 */
const SESSION_ROLES = ['websiteCompanion', 'companion', 'adminNavigator'] as const;
type SessionRole = (typeof SESSION_ROLES)[number];

function isSessionRole(v: unknown): v is SessionRole {
  return typeof v === 'string' && (SESSION_ROLES as readonly string[]).includes(v);
}

// POST /api/voice/session  { role }
voiceRouter.post('/session', ah(async (req, res) => {
  const role = (req.body as { role?: unknown })?.role;
  if (!isSessionRole(role)) {
    return fail(res, 400, `role must be one of: ${SESSION_ROLES.join(', ')}`);
  }

  const cfg = await getProviderConfig('ello');
  if (!cfg.enabled) return fail(res, 503, 'Voice is currently disabled');

  const apiKey = String((cfg.secrets as Record<string, unknown>).apiKey ?? (cfg.secrets as Record<string, unknown>).api_key ?? '');
  if (!apiKey) return fail(res, 503, 'Voice is not configured');

  const assistantId = await agentIdFor(role as AgentRole);
  if (!assistantId) return fail(res, 503, `No Ello agent configured for "${role}"`);

  const base = String(cfg.settings.baseUrl ?? '').replace(/\/+$/, '');

  let r: Response;
  try {
    r = await fetch(`${base}/api/agents/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ assistant_id: assistantId, agent_type: 'webcall', source: 'sdk' }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    // A provider timeout is a 502, not a 500: nothing is wrong on our side and
    // the client should feel free to retry.
    return fail(res, 502, `Could not reach the voice provider: ${(e as Error).message}`);
  }

  const body = (await r.json().catch(() => null)) as Record<string, any> | null;
  const conversationId = body?.data?.conversation_id ?? body?.conversation_id;

  if (!r.ok || !conversationId) {
    // Unwrap the provider's reason. Ello nests `message` as a STRING on 401 but
    // as an OBJECT on 402 ("No active subscription"), which is what previously
    // surfaced to users as the meaningless "[object Object]".
    const reason = readProviderError(body) ?? `provider returned HTTP ${r.status}`;
    log.warn('publish failed', { role, reason, status: r.status });
    // 502 — the failure is upstream, and the status shouldn't imply the caller
    // sent something wrong.
    return fail(res, 502, reason);
  }

  log.info('session started', { role, conversationId, assistantId });
  return ok(
    res,
    {
      conversationId,
      // Handed back so the client needs no Ello config of its own — one source of
      // truth for which environment we are on.
      wsUrl: String(cfg.settings.wsUrl ?? 'wss://connect-in.getello.ai/ws-ello'),
      role,
    },
    'Session started',
  );
}));

/** Dig the first human-readable string out of an arbitrarily nested error body. */
function readProviderError(json: unknown, depth = 0): string | null {
  if (json == null || depth > 5) return null;
  if (typeof json === 'string') return json.trim() || null;
  if (typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  for (const k of ['message', 'error_message', 'detail', 'error', 'reason']) {
    if (k in o) {
      const found = readProviderError(o[k], depth + 1);
      if (found) {
        const code = (o.error_code ?? (o.message as any)?.error_code) as string | undefined;
        return code && !found.includes(code) ? `${found} (${code})` : found;
      }
    }
  }
  return null;
}
