// Voice tools for the SwiftLoan admin dashboard.
//
// The agent is a NAVIGATION CO-PILOT for operators: it moves between dashboard
// pages ("take me to the loan pipeline", "open leads") and opens a specific
// record by name/ref ("open loan SL-800042", "show me Meera's lead"). One
// registerTool call per action, plus a page context so the model always knows
// which screen the operator is on and what they can do next.

import { ElloAgent } from './ello-agent';
import { apiFetch } from './api';

// Every navigable dashboard screen, with human labels + spoken aliases.
export const PAGES: { id: string; path: string; label: string; aliases: string[] }[] = [
  // Analytics was merged into Overview's "Trends" section, so its aliases live
  // here now — an operator saying "show analytics" should still land somewhere.
  { id: 'overview', path: '/overview', label: 'Master Overview', aliases: ['overview', 'home', 'dashboard', 'summary', 'main', 'start', 'analytics', 'charts', 'trends', 'reports', 'graphs'] },
  { id: 'loans', path: '/loans', label: 'Loan Pipeline', aliases: ['loans', 'loan pipeline', 'pipeline', 'applications', 'loan applications'] },
  { id: 'leads', path: '/leads', label: 'Leads & Contact', aliases: ['leads', 'contacts', 'enquiries', 'contact us', 'lead list'] },
  { id: 'downloads', path: '/downloads', label: 'App Downloads & Attribution', aliases: ['downloads', 'installs', 'app downloads', 'attribution'] },
  // "customers" deliberately belongs to the 360 view, not /users. Since WS5 an
  // operator saying "customers" means the cross-channel journey record, not the
  // list of registered app accounts — /users keeps the app-account wording.
  { id: 'users', path: '/users', label: 'All Users', aliases: ['users', 'app users', 'registered users', 'borrowers', 'all users', 'people', 'accounts'] },
  { id: 'notifications', path: '/notifications', label: 'Notifications', aliases: ['notifications', 'alerts', 'notification'] },
  // ── WS5: unified customer journey ──
  { id: 'customers', path: '/customers', label: 'Customers 360', aliases: ['customers', 'customer 360', '360', 'journeys', 'customer journeys', 'journey', 'drop offs', 'drop-offs', 'dropoffs', 'stalled', 'stuck customers', 'onboarding', 'signups', 'sign ups', 'onboarding funnel', 'steps'] },
  { id: 'campaigns', path: '/campaigns', label: 'Campaigns', aliases: ['campaigns', 'campaign', 'outbound', 'calling', 'call campaign', 'dialer', 'bulk calls'] },
  { id: 'integrations', path: '/integrations', label: 'Integrations', aliases: ['integrations', 'integration', 'settings', 'config', 'configuration', 'api keys', 'ello', 'upshot', 'providers'] },
];

function resolvePage(query: string): (typeof PAGES)[number] | null {
  const q = query.toLowerCase().trim();
  return (
    PAGES.find((p) => p.id === q || p.aliases.includes(q)) ??
    PAGES.find((p) => p.aliases.some((a) => a.includes(q) || q.includes(a)) || p.label.toLowerCase().includes(q)) ??
    null
  );
}

function currentPageId(path: string): string {
  const hit = PAGES.find((p) => path === p.path || path.startsWith(p.path + '/'));
  return hit?.id ?? 'overview';
}

export interface AdminToolDeps {
  navigate: (path: string) => void;
  currentPath: () => string;
}

export function registerAdminTools(agent: ElloAgent, deps: AdminToolDeps) {
  // ---- page context: what the model reasons over each turn ----------------
  agent.registerPageContext(() => {
    const path = deps.currentPath();
    const pageId = currentPageId(path);
    const page = PAGES.find((p) => p.id === pageId);
    return {
      app: 'SwiftLoan Admin — loan application tracking & operations dashboard',
      currentScreen: { id: pageId, label: page?.label ?? pageId, path },
      screens: PAGES.map((p) => ({ id: p.id, label: p.label })),
      interactionGuide: {
        role:
          'You are the SwiftLoan admin dashboard voice co-pilot. You help an operator navigate the dashboard hands-free and open specific records.',
        behaviour: [
          "Open by greeting the operator, say which screen they're on, and ask where they'd like to go.",
          "When they name a screen ('take me to the loan pipeline', 'open leads', 'show analytics'), CALL go_to_page immediately, then briefly confirm.",
          "When they name a specific record ('open loan SL-800042', 'show Meera's lead', 'find user Rahul'), CALL the matching open_* tool.",
          'Be concise and operational — this is an internal tool, not a sales pitch.',
          'If a request is ambiguous, ask which of the available screens they mean.',
        ],
      },
    };
  });

  // ---- navigation -----------------------------------------------------------
  agent.registerTool<{ page: string }>({
    name: 'go_to_page',
    description:
      "Navigate the dashboard to a screen the operator asks for — e.g. 'take me to the loan pipeline', 'open leads', 'go to analytics', 'show notifications', 'back to overview'. Use screen names/aliases from the page context's `screens` list.",
    schema: {
      type: 'object',
      properties: { page: { type: 'string', description: 'the screen the operator asked for' } },
      required: ['page'],
    },
    handler: ({ page }) => {
      const target = resolvePage(page);
      if (!target) return { success: false, reason: `Unknown screen "${page}"`, available: PAGES.map((p) => p.label) };
      deps.navigate(target.path);
      return { success: true, openedScreen: target.id, label: target.label };
    },
  });

  // ---- open a specific loan application -------------------------------------
  agent.registerTool<{ query: string }>({
    name: 'open_loan',
    description:
      "Open a specific loan application's full journey by its reference (e.g. 'SL-800042') or the applicant's name. Searches the pipeline and opens the best match.",
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'loan ref (SL-xxxxxx) or applicant name/phone' } },
      required: ['query'],
    },
    handler: async ({ query }) => {
      try {
        const res = await apiFetch<{ id: string; ref: string }[]>(`/api/admin/loans?pageSize=1&search=${encodeURIComponent(query)}`);
        const row = res.data?.[0];
        if (!row) return { success: false, reason: `No loan matching "${query}"` };
        deps.navigate(`/loans/${row.id}`);
        return { success: true, ref: row.ref };
      } catch (e) {
        return { success: false, reason: (e as Error).message };
      }
    },
  });

  // ---- open a specific lead journey ----------------------------------------
  agent.registerTool<{ query: string }>({
    name: 'open_lead',
    description:
      "Open a specific lead's journey by the lead's name, phone, or city (e.g. 'open Meera's lead', 'the lead from Pune'). Searches leads and opens the best match.",
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: "lead name, phone, or city" } },
      required: ['query'],
    },
    handler: async ({ query }) => {
      try {
        const res = await apiFetch<{ id: string; name?: string }[]>(`/api/admin/leads?pageSize=1&search=${encodeURIComponent(query)}`);
        const row = res.data?.[0];
        if (!row) return { success: false, reason: `No lead matching "${query}"` };
        deps.navigate(`/leads/${row.id}`);
        return { success: true, name: row.name ?? 'lead' };
      } catch (e) {
        return { success: false, reason: (e as Error).message };
      }
    },
  });

  // ---- open a specific user profile ----------------------------------------
  agent.registerTool<{ query: string }>({
    name: 'open_user',
    description:
      "Open a specific user's profile by name, phone, or email (e.g. 'find user Rahul', 'open the customer 98765...'). Searches users and opens the best match.",
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'user name, phone, or email' } },
      required: ['query'],
    },
    handler: async ({ query }) => {
      try {
        const res = await apiFetch<{ id: string; fullName?: string }[]>(`/api/admin/users?pageSize=1&search=${encodeURIComponent(query)}`);
        const row = res.data?.[0];
        if (!row) return { success: false, reason: `No user matching "${query}"` };
        deps.navigate(`/users/${row.id}`);
        return { success: true, name: row.fullName ?? 'user' };
      } catch (e) {
        return { success: false, reason: (e as Error).message };
      }
    },
  });

  // ---- open a specific customer's 360 journey (WS5) -------------------------
  agent.registerTool<{ query: string }>({
    name: 'open_customer',
    description:
      "Open a customer's full cross-channel journey (the 360 view) by name, phone or email — e.g. 'open Demo Kumar', 'show me the journey for 9876500011', 'what happened to Anita'. This is the record that spans website, calls, campaign and app activity, so prefer it over open_user whenever someone asks about a person's journey, where they came from, or where they dropped off.",
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'customer name, phone, or email' } },
      required: ['query'],
    },
    handler: async ({ query }) => {
      try {
        const res = await apiFetch<{ id: string; name?: string; currentStage?: string }[]>(
          `/api/admin/customers?pageSize=1&search=${encodeURIComponent(query)}`,
        );
        const row = res.data?.[0];
        if (!row) return { success: false, reason: `No customer matching "${query}"` };
        deps.navigate(`/customers/${row.id}`);
        return { success: true, name: row.name ?? 'customer', stage: row.currentStage };
      } catch (e) {
        return { success: false, reason: (e as Error).message };
      }
    },
  });

  // ---- show customers stalled at a stage (the drop-off question) ------------
  agent.registerTool<{ minutes?: number; stage?: string }>({
    name: 'show_stalled_customers',
    description:
      "List customers who have been stuck at their current stage for a while — e.g. 'who's stalled?', 'show me drop-offs from the last hour', 'anyone stuck in KYC?'. Opens the Customers 360 list filtered accordingly.",
    schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'stalled for at least this many minutes (default 60)' },
        stage: { type: 'string', description: "optional journey stage, e.g. 'kyc_started', 'lead_captured'" },
      },
    },
    handler: ({ minutes, stage }) => {
      const qs = new URLSearchParams({ stalledMinutes: String(minutes && minutes > 0 ? Math.round(minutes) : 60) });
      if (stage) qs.set('stage', stage);
      deps.navigate(`/customers?${qs.toString()}`);
      return { success: true, stalledMinutes: qs.get('stalledMinutes'), stage: stage ?? 'any' };
    },
  });

  // ---- go back --------------------------------------------------------------
  agent.registerTool({
    name: 'go_back',
    description: "Go back to the previous screen (e.g. 'go back', 'return')",
    schema: { type: 'object', properties: {} },
    handler: () => {
      if (typeof window !== 'undefined') window.history.back();
      return { success: true };
    },
  });
}
