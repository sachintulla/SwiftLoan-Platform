/**
 * WS7 — which Ello agent plays which role.
 *
 * The platform has several distinct conversations, and they need different
 * prompts, voices and (usually) different agents:
 *
 *   leadCallback   — outbound: calls a website lead ~1 min after they submit
 *   campaign       — outbound: bulk campaign dialling from an uploaded sheet
 *   companion      — inbound/in-app: the mobile app's voice copilot
 *   adminNavigator — in-dashboard: drives the admin UI by voice
 *
 * Resolution order per role, first hit wins:
 *   1. IntegrationConfig.settings.agents[role]   — set from the dashboard
 *   2. ELLO_AGENT_<ROLE> env var                 — set per deployment
 *   3. IntegrationConfig.settings.assistantId    — the workspace default
 *
 * The fallback chain is what makes this safe to ship before the agents exist:
 * every role silently uses the default agent until a real id is filled in, so
 * the flow works end to end today and gets better prompts later.
 */
import { getProviderConfig } from './integrations.js';

export const AGENT_ROLES = [
  'leadCallback', 'campaign', 'companion', 'websiteCompanion', 'adminNavigator',
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Human descriptions, surfaced in the admin UI and the handover doc. */
export const AGENT_ROLE_INFO: Record<AgentRole, { label: string; direction: string; purpose: string }> = {
  leadCallback: {
    label: 'Website lead callback',
    direction: 'outbound',
    purpose: 'Calls a visitor ~1 minute after they submit the rate form, already knowing what they asked for.',
  },
  campaign: {
    label: 'Campaign dialler',
    direction: 'outbound',
    purpose: 'Works an uploaded contact list on the campaign schedule and cadence.',
  },
  companion: {
    label: 'Mobile app companion',
    direction: 'in-app (WebRTC)',
    purpose: 'The mobile app copilot that can navigate screens and fill fields by voice.',
  },
  websiteCompanion: {
    label: 'Website companion',
    direction: 'in-browser (swiftloan.ai)',
    purpose: 'The voice widget on the marketing site that answers questions and captures a lead.',
  },
  adminNavigator: {
    label: 'Admin dashboard navigator',
    direction: 'in-browser',
    purpose: 'Drives the admin dashboard by voice for the ops team.',
  },
};

const ENV_KEY: Record<AgentRole, string> = {
  leadCallback: 'ELLO_AGENT_LEAD_CALLBACK',
  campaign: 'ELLO_AGENT_CAMPAIGN',
  companion: 'ELLO_AGENT_COMPANION',
  websiteCompanion: 'ELLO_AGENT_WEBSITE_COMPANION',
  adminNavigator: 'ELLO_AGENT_ADMIN_NAVIGATOR',
};

/** Reject a placeholder so a half-filled config fails loudly rather than dialling the wrong agent. */
function clean(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^(todo|tbd|changeme|your[_-]?agent|xxx+|<.*>)$/i.test(s)) return null;
  return s;
}

/**
 * Resolve the agent id for a role, or null when nothing is configured at all
 * (in which case the dialler surfaces "No Ello agent id configured").
 */
export async function agentIdFor(role: AgentRole): Promise<string | null> {
  const cfg = await getProviderConfig('ello').catch(() => null);
  const settings = (cfg?.settings ?? {}) as Record<string, any>;

  const fromDashboard = clean(settings.agents?.[role]);
  if (fromDashboard) return fromDashboard;

  const fromEnv = clean(process.env[ENV_KEY[role]]);
  if (fromEnv) return fromEnv;

  // Deliberate final fallback: better to place the call with the default agent
  // and a generic prompt than to place no call at all.
  return clean(settings.assistantId);
}

/** Which roles have a dedicated agent vs. are still on the shared default. */
export async function agentRoleStatus(): Promise<
  Array<{ role: AgentRole; agentId: string | null; dedicated: boolean; source: string }>
> {
  const cfg = await getProviderConfig('ello').catch(() => null);
  const settings = (cfg?.settings ?? {}) as Record<string, any>;
  const fallback = clean(settings.assistantId);

  return AGENT_ROLES.map((role) => {
    const dash = clean(settings.agents?.[role]);
    const env = clean(process.env[ENV_KEY[role]]);
    const agentId = dash ?? env ?? fallback;
    return {
      role,
      agentId,
      dedicated: !!(dash ?? env),
      source: dash ? 'dashboard' : env ? ENV_KEY[role] : agentId ? 'workspace default' : 'unconfigured',
    };
  });
}
