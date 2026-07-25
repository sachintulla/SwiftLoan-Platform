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
  { id: 'overview', path: '/overview', label: 'Master Overview', aliases: ['overview', 'home', 'dashboard', 'summary', 'main', 'start'] },
  { id: 'onboarding', path: '/onboarding', label: 'Onboarding Journeys', aliases: ['onboarding', 'signups', 'sign ups', 'onboarding funnel', 'steps'] },
  { id: 'loans', path: '/loans', label: 'Loan Pipeline', aliases: ['loans', 'loan pipeline', 'pipeline', 'applications', 'loan applications'] },
  { id: 'leads', path: '/leads', label: 'Leads & Contact', aliases: ['leads', 'contacts', 'enquiries', 'contact us', 'lead list'] },
  { id: 'downloads', path: '/downloads', label: 'App Downloads & Attribution', aliases: ['downloads', 'installs', 'app downloads', 'attribution'] },
  { id: 'users', path: '/users', label: 'All Users', aliases: ['users', 'customers', 'borrowers', 'all users', 'people'] },
  { id: 'analytics', path: '/analytics', label: 'Analytics', aliases: ['analytics', 'charts', 'trends', 'reports', 'graphs'] },
  { id: 'notifications', path: '/notifications', label: 'Notifications', aliases: ['notifications', 'alerts', 'notification'] },
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
