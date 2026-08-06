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

  // ---- THE status question -------------------------------------------------
  //
  // "what's the status of 9533232241?" is the single most common thing an
  // operator asks, and the old open_customer could only answer with a name and a
  // stage code. This opens the record AND returns everything needed to say it out
  // loud: where they are, how long they have been stuck, what happened on the
  // call, and what to do next. One round-trip, because the agent asking three
  // follow-up questions to assemble one sentence feels broken.
  agent.registerTool<{ query: string }>({
    name: 'get_customer_status',
    description:
      "Answer 'what is the status of this customer?' for a phone number, name or email — e.g. 'what's the status of 9533232241', 'where is Indra', 'what happened with 98765 00011'. Opens their journey page and returns their stage, how long they have been there, their website enquiry, the last call and its outcome, and the recommended next action. Use this FIRST whenever someone asks about a specific person; only fall back to open_customer if this finds nothing.",
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'phone number, name or email' } },
      required: ['query'],
    },
    // Two sequential API calls; the default would cut it off and the agent would
    // apologise for something that was merely slow.
    timeoutMs: 15000,
    handler: async ({ query }) => {
      // Spoken numbers arrive as "98765 00011" or "+91 98765-00011"; the API
      // stores bare 10 digits, so a raw search would miss.
      const digits = String(query ?? '').replace(/\D/g, '');
      const term = digits.length >= 10 ? digits.slice(-10) : String(query ?? '').trim();
      if (!term) return { success: false, reason: 'No name or number given' };

      try {
        const list = await apiFetch<any>(`/api/admin/customers?pageSize=1&search=${encodeURIComponent(term)}`);
        const rows = Array.isArray(list.data) ? list.data : (list.data?.items ?? []);
        const hit = rows[0];
        if (!hit) return { success: false, reason: `Nobody found matching "${query}"` };

        // Fetch the detail BEFORE navigating. Navigating first re-renders the
        // tree, which can abort an in-flight request — and worse, if the detail
        // call then failed we would have already opened the page while telling
        // the agent the whole thing failed. That mismatch is exactly the
        // "it opened the page but said it couldn't" behaviour.
        let d: any = {};
        try {
          const detail = await apiFetch<any>(`/api/admin/customers/${hit.id}`);
          d = detail.data ?? {};
        } catch {
          // Detail is a bonus, not a requirement: we still know who they are and
          // their stage from the search row, so answer with that rather than
          // pretending we found nobody.
          d = {};
        }

        deps.navigate(`/customers/${hit.id}`);
        const c = d.customer ?? hit;
        const call = Array.isArray(d.calls) ? d.calls[0] : null;
        const lead = Array.isArray(d.leads) ? d.leads[0] : null;

        return {
          success: true,
          name: c.name ?? 'unnamed customer',
          phone: c.phone ?? null,
          city: c.city ?? null,
          stage: d.dropOff?.label ?? hit.stageLabel ?? c.currentStage ?? null,
          stalledMinutes: d.dropOff?.stalledMinutes ?? hit.stalledMinutes ?? null,
          isStuck: (d.dropOff?.stalledMinutes ?? 0) > 60 && !d.dropOff?.isTerminal,
          source: c.firstSource ?? null,
          campaign: c.campaignId ?? null,
          enquiry: lead
            ? { product: lead.productInterest ?? null, amountRupees: lead.amount != null ? Math.round(lead.amount / 100) : null }
            : null,
          lastCall: call
            ? {
                status: call.status,
                outcome: call.outcome ?? 'not known',
                // The agent must not state a guessed outcome as fact — the source
                // is included so it can hedge when we only inferred it.
                outcomeIsConfirmed: call.outcomeSource === 'agent',
                answered: call.answered,
                durationSeconds: call.durationSec ?? null,
                summary: call.summary ?? null,
              }
            : null,
          callCount: Array.isArray(d.calls) ? d.calls.length : 0,
          hasAppAccount: !!d.user,
          nextAction: d.nextAction ?? null,
        };
      } catch (e) {
        return { success: false, reason: (e as Error).message };
      }
    },
  });

  // ---- today's numbers -----------------------------------------------------
  agent.registerTool({
    name: 'get_dashboard_summary',
    description:
      "Read out the current headline numbers — e.g. 'how are we doing today', 'how many leads', 'what's the summary', 'give me the numbers'. Returns lead, customer and call counts without navigating anywhere.",
    schema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const [leads, customers, calls] = await Promise.all([
          apiFetch<any>('/api/admin/leads?pageSize=1'),
          apiFetch<any>('/api/admin/customers?pageSize=1'),
          apiFetch<any>('/api/admin/calls?pageSize=1'),
        ]);
        return {
          success: true,
          leads: leads.pagination?.total ?? null,
          customers: customers.pagination?.total ?? null,
          calls: calls.pagination?.total ?? null,
        };
      } catch (e) {
        return { success: false, reason: (e as Error).message };
      }
    },
  });

  // ---- recent calls --------------------------------------------------------
  agent.registerTool<{ outcome?: string }>({
    name: 'show_recent_calls',
    description:
      "Open the call list, optionally filtered by outcome — e.g. 'show me recent calls', 'who was interested', 'any do-not-call requests', 'failed calls'. Outcome may be interested, not_interested, callback_requested, wrong_number, do_not_call, unreachable, installed_app.",
    schema: {
      type: 'object',
      properties: { outcome: { type: 'string', description: 'optional outcome filter' } },
    },
    handler: async ({ outcome }) => {
      const qs = new URLSearchParams({ pageSize: '20' });
      if (outcome) qs.set('outcome', outcome.toLowerCase().replace(/[\s-]+/g, '_'));
      try {
        const res = await apiFetch<any>(`/api/admin/calls?${qs.toString()}`);
        const rows = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
        deps.navigate(`/customers`); // call detail lives on the customer record
        return {
          success: true,
          total: res.pagination?.total ?? rows.length,
          filteredBy: outcome ?? 'none',
          sample: rows.slice(0, 5).map((r: any) => ({
            phone: r.phone,
            status: r.status,
            outcome: r.outcome ?? 'not known',
            confirmed: r.outcomeSource === 'agent',
          })),
        };
      } catch (e) {
        return { success: false, reason: (e as Error).message };
      }
    },
  });

  // ---- which agent handles what -------------------------------------------
  agent.registerTool({
    name: 'get_agent_roles',
    description:
      "Explain which Ello voice agent is used for which job — e.g. 'which agent handles callbacks', 'are the agents configured', 'what agent is on the website'. Opens the Agents page.",
    schema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const res = await apiFetch<any>('/api/admin/agents/roles');
        const roles = res.data?.roles ?? [];
        deps.navigate('/agents');
        return {
          success: true,
          sharingDefault: res.data?.shared ?? 0,
          roles: roles.map((r: any) => ({ role: r.role, label: r.label, dedicated: r.dedicated })),
        };
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
