/**
 * WS5 — external provider integrations (Ello telephony, Upshot messaging).
 *
 * Everything here is driven by `IntegrationConfig` rows, not env vars, so the
 * admin dashboard can change endpoints, paths, auth headers and field mappings
 * without a redeploy. That is deliberate: the exact request shapes for Ello and
 * Upshot are supplied by the operator, so this module treats them as data.
 *
 * This is the first outbound HTTP this backend performs. Every call is
 * timeout-bounded and returns a result object rather than throwing, so a
 * provider outage can never take down a request path or a job tick.
 */
import { prisma } from './prisma.js';

const DEFAULT_TIMEOUT_MS = 15_000;

/* ────────────────────────────── config ────────────────────────────── */

export type ProviderName = 'ello' | 'upshot' | 'infobip';

export interface ProviderConfig {
  enabled: boolean;
  settings: Record<string, any>;
  secrets: Record<string, any>;
}

/**
 * Shipped defaults. The dashboard overlays its own values on top, so an
 * operator only has to fill in what differs. `*_path` and `*_map` entries exist
 * so a provider-shape change is a config edit, not a code change.
 */
export const DEFAULT_SETTINGS: Record<ProviderName, Record<string, any>> = {
  // Ello — https://docs.getello.ai/api-reference/calls/create-call
  // POST {baseUrl}/api/agents/{agentId}/calls with an `X-API-Key` header.
  ello: {
    baseUrl: 'https://api-in.getello.ai',
    /** `{agentId}` is substituted per call (campaign agent, else the default). */
    triggerPath: '/api/agents/{agentId}/calls',
    /// Agent listing, used by the campaign builder's picker.
    agentsPath: '/api/agents',
    triggerMethod: 'POST',
    authHeader: 'X-API-Key',
    /** Default agent used when a campaign does not name its own. */
    assistantId: '',
    /** Ello requires these to place a real PSTN call rather than a web call. */
    agentType: 'telephonic',
    callType: 'outbound',
    source: 'swiftloan-admin',
    /**
     * Sent as `hook_url`; Ello POSTs call events here. Deliberately no
     * default — a `localhost` fallback used to ship here, which silently
     * became every environment's real webhook URL until someone noticed
     * every call sat at "dialing" forever. This MUST be set per-environment
     * from the admin dashboard (a scheme mismatch is just as fatal: an
     * `http://` URL that the host redirects to `https://` drops the POST
     * body on most webhook senders, so this has to be `https://` on a real
     * deployment). triggerElloCall() below refuses to place a call at all
     * without it, rather than dial one that can never report back.
     */
    webhookUrl: '',
    /** Optional opening line; blank lets the agent's own greeting play. */
    message: '',
    /** Dotted path to the provider's call id in the trigger response. */
    responseMap: {
      providerCallId: 'data.conversation_id',
    },
    /**
     * Webhook payload paths. Ello sends `call.started`, `call.completed`,
     * `call.processed` and `call.recording`; duration arrives as
     * `call_duration` on completed and `duration` on processed, so both are
     * tried in order.
     */
    webhookMap: {
      providerCallId: 'conversation_id',
      event: 'event',
      status: 'status',
      summary: 'call_insights',
      transcript: 'transcripts',
      recordingUrl: 'recording_url',
      durationSec: 'call_duration',
      durationSecAlt: 'duration',
      contextData: 'context_data',
      errorCode: 'error_code',
      errorReason: 'error_reason',
    },
  },
  // Upshot — https://www.upshot.ai/documentation/enterpriseaccess
  // Auth travels in the BODY as { auth: { appId, accountId, apiKey } }, not in
  // a header, and the payload is nested (`data` / `updateSet`). That shape is
  // provider-specific enough that it is built explicitly below rather than by
  // generic field mapping.
  upshot: {
    /**
     * India region host. Upshot is region-partitioned and the docs are behind a
     * JS-rendered Swagger UI, so this MUST be confirmed by the operator before
     * anything will send — a wrong region silently writes to the wrong tenant.
     */
    baseUrl: '',
    eventPath: '/event/add',
    eventMethod: 'POST',
    userUpsertPath: '/userprofile/add',
    userUpsertMethod: 'POST',
    /** Which profile key identifies the user in /userprofile/add's filter. */
    filterKey: 'appuid',
    platform: 'Android',
    /** IST. Upshot wants the offset in milliseconds. */
    tzoffset: 19800000,
    /** Journey stage → Upshot event name fired for the stall nudge. */
    stageEventMap: {},
    /** Event name used when no stage-specific mapping exists. */
    defaultEventName: 'swiftloan_journey_nudge',
  },
  // Infobip — WhatsApp Business. https://www.infobip.com/docs/api
  // Auth is `Authorization: App {apiKey}` (verified: `App` returns 403 on an
  // unpermitted endpoint while Bearer/none return 401 — i.e. `App` is the scheme
  // that actually authenticates).
  infobip: {
    /**
     * Region-specific host — Infobip issues one per account and a wrong host
     * simply will not authenticate. India: jrv2lk.api-in.infobip.com
     */
    baseUrl: 'https://jrv2lk.api-in.infobip.com',
    /** Business-initiated messages. Requires a pre-approved template. */
    templatePath: '/whatsapp/1/message/template',
    /**
     * Free-form text. Only valid INSIDE the 24-hour customer service window —
     * i.e. after the customer messaged us. Outside it WhatsApp rejects the
     * message, so anything we initiate must go through templatePath.
     */
    textPath: '/whatsapp/1/message/text',
    /** Registered WhatsApp sender number (E.164, no +). Set in the dashboard. */
    sender: '',
    /** Default approved template + its registered language code. */
    defaultTemplate: '',
    defaultLanguage: 'en',
    /** Where Infobip POSTs delivery reports, if configured. */
    notifyUrl: '',
  },
};

export async function getProviderConfig(provider: ProviderName): Promise<ProviderConfig> {
  const row = await prisma.integrationConfig.findUnique({ where: { provider } });
  return {
    enabled: row?.enabled ?? false,
    settings: { ...DEFAULT_SETTINGS[provider], ...((row?.settings as Record<string, any>) ?? {}) },
    secrets: (row?.secrets as Record<string, any>) ?? {},
  };
}

export async function upsertProviderConfig(
  provider: ProviderName,
  patch: { enabled?: boolean; settings?: Record<string, any>; secrets?: Record<string, any> },
  updatedBy?: string,
) {
  const existing = await prisma.integrationConfig.findUnique({ where: { provider } });
  // Merge rather than replace, so a partial save never silently drops a secret.
  const settings = { ...((existing?.settings as Record<string, any>) ?? {}), ...(patch.settings ?? {}) };
  const secrets = { ...((existing?.secrets as Record<string, any>) ?? {}) };
  for (const [k, v] of Object.entries(patch.secrets ?? {})) {
    // An empty string means "leave the stored secret alone"; null clears it.
    if (v === '' || v === undefined) continue;
    if (v === null) delete secrets[k];
    else secrets[k] = v;
  }
  return prisma.integrationConfig.upsert({
    where: { provider },
    create: { provider, enabled: patch.enabled ?? false, settings, secrets, updatedBy },
    update: { ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }), settings, secrets, updatedBy },
  });
}

/** Which secret keys a provider has set — never the values themselves. */
export function describeSecrets(secrets: Record<string, any>): Record<string, boolean> {
  return Object.fromEntries(Object.keys(secrets).map((k) => [k, true]));
}

/* ────────────────────────────── helpers ────────────────────────────── */

/** Read "data.call_id" style dotted paths out of an arbitrary provider body. */
export function pick(obj: any, path?: string): any {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

/** Rename our canonical keys to whatever the provider expects. */
function applyFieldMap(source: Record<string, any>, map: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [ours, theirs] of Object.entries(map)) {
    const v = source[ours];
    if (v !== undefined && v !== null) out[theirs || ours] = v;
  }
  // Pass through anything not covered by the map so operators can add fields
  // in config without us needing to know about them.
  for (const [k, v] of Object.entries(source)) {
    if (!(k in map) && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

export interface HttpResult {
  ok: boolean;
  status: number;
  body: any;
  error?: string;
}

async function httpJson(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* provider returned non-JSON; keep the raw text for debugging */
    }
    return { ok: res.ok, status: res.status, body: parsed, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    const aborted = e?.name === 'AbortError';
    return { ok: false, status: 0, body: null, error: aborted ? `timed out after ${timeoutMs}ms` : String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${(base || '').replace(/\/+$/, '')}/${(path || '').replace(/^\/+/, '')}`;
}

/* ────────────────────────────── Ello ────────────────────────────── */

export interface TriggerCallInput {
  phone: string;
  /** Our CallAttempt id, echoed back by the webhook so we can match it. */
  callId: string;
  assistantId?: string | null;
  /** Context handed to the agent: name, product, amount, campaign, … */
  metadata?: Record<string, any>;
}

/**
 * Place one outbound call through Ello. Returns the provider's call id when it
 * can be located via `responseMap.providerCallId`.
 */
export async function triggerElloCall(input: TriggerCallInput): Promise<HttpResult & { providerCallId?: string }> {
  const cfg = await getProviderConfig('ello');
  if (!cfg.enabled) return { ok: false, status: 0, body: null, error: 'Ello integration is disabled' };

  const apiKey = cfg.secrets.apiKey ?? cfg.secrets.api_key;
  if (!apiKey) return { ok: false, status: 0, body: null, error: 'Ello apiKey is not configured' };

  const s = cfg.settings;
  const agentId = input.assistantId || s.assistantId;
  if (!agentId) return { ok: false, status: 0, body: null, error: 'No Ello agent id configured' };

  // A call placed without a real, reachable webhookUrl can never report its
  // outcome back — it just sits at "dialing" until the reconcile job times
  // it out 30 minutes later. Refuse to dial rather than do that silently.
  if (!s.webhookUrl) {
    return { ok: false, status: 0, body: null, error: 'Ello webhookUrl is not configured — see settings.webhookUrl' };
  }
  if (!/^https:\/\//i.test(s.webhookUrl)) {
    return {
      ok: false, status: 0, body: null,
      error: `Ello webhookUrl must be https:// (got "${s.webhookUrl}") — an http:// URL that redirects to https drops the webhook body on most senders`,
    };
  }

  // Ello expects E.164. Our phones are bare 10-digit Indian numbers.
  const toNumber = /^\+/.test(input.phone) ? input.phone : `+91${input.phone.replace(/\D/g, '').slice(-10)}`;

  const body: Record<string, any> = {
    to_number: toNumber,
    agent_type: s.agentType || 'telephonic',
    call_type: s.callType || 'outbound',
    source: s.source || 'swiftloan-admin',
    hook_url: s.webhookUrl,
    // Echoed back verbatim on every webhook, so our own CallAttempt id rides
    // along and the outcome can be matched even before we know Ello's id.
    context_data: { ...(input.metadata ?? {}), swiftloan_call_id: input.callId },
  };
  if (input.metadata?.name) body.name = input.metadata.name;
  if (s.message) body.message = s.message;
  if (s.workspaceId) body.workspace_id = s.workspaceId;
  if (s.siptrunkId) body.siptrunk_id = s.siptrunkId;
  if (s.greetingDescription) body.greeting_description = s.greetingDescription;

  const path = String(s.triggerPath || '/api/agents/{agentId}/calls').replace(
    /\{agent_?[Ii]d\}/g,
    encodeURIComponent(agentId),
  );

  const fullUrl = joinUrl(s.baseUrl, path);
  console.log('[ello-trigger] → POST', fullUrl, 'agentId=', agentId, 'body=', JSON.stringify(body));

  const res = await httpJson(
    fullUrl,
    s.triggerMethod || 'POST',
    { [s.authHeader || 'X-API-Key']: String(apiKey) },
    body,
  );

  console.log('[ello-trigger] ← HTTP', res.status, 'ok=', res.ok, 'body=', JSON.stringify(res.body));

  const providerCallId = pick(res.body, s.responseMap?.providerCallId) ?? pick(res.body, 'data.conversation_id');
  return { ...res, providerCallId: providerCallId ? String(providerCallId) : undefined };
}

export interface ElloAgent {
  id: string;
  name: string;
  type: string | null;
  status: boolean;
  voiceEngine: string | null;
  phoneNumber: string | null;
}

/**
 * List the agents on the configured Ello workspace, for the campaign builder's
 * agent picker.
 *
 * Proxied through the server rather than called from the browser so the API key
 * never reaches the client. Per Ello's docs this is `GET /api/agents`.
 */
export async function listElloAgents(
  opts: { search?: string; limit?: number } = {},
): Promise<HttpResult & { agents: ElloAgent[] }> {
  const empty: ElloAgent[] = [];
  const cfg = await getProviderConfig('ello');
  if (!cfg.enabled) {
    return { ok: false, status: 0, body: null, error: 'Ello integration is disabled', agents: empty };
  }
  const apiKey = cfg.secrets.apiKey ?? cfg.secrets.api_key;
  if (!apiKey) {
    return { ok: false, status: 0, body: null, error: 'Ello apiKey is not configured', agents: empty };
  }

  const s = cfg.settings;
  const qs = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, opts.limit ?? 100))) });
  if (opts.search) qs.set('search', opts.search);
  if (s.workspaceId) qs.set('workspace_id', String(s.workspaceId));

  const res = await httpJson(
    `${joinUrl(s.baseUrl, s.agentsPath || '/api/agents')}?${qs.toString()}`,
    'GET',
    { [s.authHeader || 'X-API-Key']: String(apiKey) },
  );

  const rows = Array.isArray(res.body?.data) ? res.body.data : [];
  const agents: ElloAgent[] = rows.map((a: any) => ({
    id: String(a.id ?? ''),
    name: String(a.name ?? '(unnamed)'),
    type: a.type ?? null,
    status: Boolean(a.status),
    voiceEngine: a.voiceEngine ?? null,
    phoneNumber: a.phoneNumber ?? null,
  }));

  return { ...res, agents };
}

/**
 * Normalise an inbound Ello webhook body.
 *
 * Ello sends four call events — `call.started`, `call.completed`,
 * `call.processed`, `call.recording` — each carrying a different subset of
 * fields, so every value is optional and callers must merge rather than
 * overwrite. `clientCallId` is recovered from `context_data.swiftloan_call_id`,
 * which we set when placing the call; that is what lets us match an outcome
 * even if the trigger response never yielded a conversation id.
 */
export async function parseElloWebhook(raw: any) {
  const cfg = await getProviderConfig('ello');
  const m = cfg.settings.webhookMap ?? {};
  const get = (key: string) => pick(raw, m[key]) ?? raw?.[key];

  const ctx = get('contextData') ?? raw?.context_data ?? {};
  const durationRaw = get('durationSec') ?? pick(raw, m.durationSecAlt) ?? raw?.duration;

  // `transcripts` is an array of { role, content }; flatten to readable text
  // for the summary column while keeping the structured form.
  const transcript = get('transcript') ?? null;
  let summary = get('summary');
  if (summary && typeof summary === 'object') summary = JSON.stringify(summary);

  const event = get('event') != null ? String(get('event')) : null;
  const status = get('status') != null ? String(get('status')) : null;

  return {
    event,
    providerCallId: get('providerCallId') != null ? String(get('providerCallId')) : null,
    clientCallId: ctx?.swiftloan_call_id != null ? String(ctx.swiftloan_call_id) : null,
    status,
    // Ello has no single "outcome" field; the webhook route derives one from
    // the event + status + error_reason via its tolerant mapper.
    outcome: raw?.outcome != null ? String(raw.outcome) : null,
    summary: summary != null ? String(summary) : null,
    transcript,
    recordingUrl: get('recordingUrl') != null ? String(get('recordingUrl')) : null,
    durationSec: Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : null,
    // A call that connected has a connected_at and a non-zero duration. An
    // explicit `answered` boolean is honoured too — without it, a provider that
    // reports connection that way (and omits duration) has an answered call
    // recorded as `no_answer`, which then reads as `unreachable` in the funnel.
    answered:
      raw?.answered === true ||
      raw?.answered === 'true' ||
      Boolean(raw?.connected_at) ||
      Number(durationRaw) > 0,
    errorCode: get('errorCode') ?? null,
    errorReason: get('errorReason') != null ? String(get('errorReason')) : null,
  };
}

/* ────────────────────────────── Upshot ────────────────────────────── */

/**
 * Which Upshot app a message belongs to.
 *
 * There are two separate Upshot apps sharing one Account ID — one for the
 * mobile app, one for the website. A push can only reach someone through the
 * app they actually installed, so sending under the wrong appId means the
 * message is accepted and then delivered to nobody.
 */
export type UpshotPlatform = 'mobile' | 'web';

/**
 * Upshot authenticates in the request body, not via headers. Every payload
 * carries this block.
 */
function upshotAuth(cfg: ProviderConfig, platform: UpshotPlatform = 'mobile') {
  const appId =
    (platform === 'web' ? cfg.secrets.appIdWeb : cfg.secrets.appIdMobile) ??
    // Fall back to the other app rather than sending an empty appId, which
    // Upshot would reject outright.
    cfg.secrets.appIdMobile ??
    cfg.secrets.appIdWeb ??
    cfg.secrets.appId ??
    '';
  return {
    appId,
    accountId: cfg.secrets.accountId ?? '',
    apiKey: cfg.secrets.apiKey ?? '',
  };
}

function upshotReady(cfg: ProviderConfig, path: string): string | null {
  if (!cfg.enabled) return 'Upshot integration is disabled';
  if (!cfg.settings.baseUrl) return 'Upshot baseUrl (India region host) is not configured';
  if (!path) return 'Upshot endpoint path is not configured';
  const a = upshotAuth(cfg);
  if (!a.appId || !a.accountId || !a.apiKey) {
    return 'Upshot appId / accountId / apiKey are not all configured';
  }
  return null;
}

export interface UpshotUser {
  userId: string;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  city?: string | null;
  [k: string]: any;
}

/** Split a display name into the First/Last fields Upshot's profile expects. */
function splitName(name?: string | null): { FirstName?: string; LastName?: string; Name?: string } {
  if (!name) return {};
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return { Name: name, FirstName: parts[0] };
  return { Name: name, FirstName: parts[0], LastName: parts.slice(1).join(' ') };
}

/**
 * Create/update the user profile on Upshot (`POST /userprofile/add`).
 *
 * Shape per the enterprise-access docs: a `filter` selecting the user, an
 * `updateSet.profile` of capitalised attributes, and body-level `auth`. Called
 * only the first time we contact a customer; the dispatcher tracks that.
 */
export async function upshotUserUpsert(user: UpshotUser, platform: UpshotPlatform = 'mobile'): Promise<HttpResult> {
  const cfg = await getProviderConfig('upshot');
  const s = cfg.settings;
  const notReady = upshotReady(cfg, s.userUpsertPath);
  if (notReady) return { ok: false, status: 0, body: null, error: notReady };

  const profile: Record<string, any> = {
    ...splitName(user.name),
    Platform: s.platform || 'Android',
    Country: 'India',
  };
  // Upshot wants E.164 for Phone.
  if (user.phone) profile.Phone = /^\+/.test(user.phone) ? user.phone : `+91${String(user.phone).replace(/\D/g, '').slice(-10)}`;
  if (user.email) profile.Email = user.email;
  if (user.city) profile.City = user.city;

  const body = {
    filter: { key: s.filterKey || 'appuid', value: user.userId, operator: 'eq' },
    updateSet: {
      profile,
      others: user.others ?? {},
    },
    auth: upshotAuth(cfg, platform),
  };

  return httpJson(joinUrl(s.baseUrl, s.userUpsertPath), s.userUpsertMethod || 'POST', {}, body);
}

/**
 * Fire an Upshot event (`POST /event/add`) — this is what actually triggers the
 * push / WhatsApp / SMS on Upshot's side.
 *
 * `eventId` MUST be unique per event, per the docs; callers pass their
 * OutboundRequest id so a retry of the same dispatch is idempotent upstream
 * rather than sending the customer a duplicate message.
 */
export async function upshotEvent(
  userId: string,
  eventName: string,
  properties: Record<string, any> = {},
  eventId?: string,
  platform: UpshotPlatform = 'mobile',
): Promise<HttpResult> {
  const cfg = await getProviderConfig('upshot');
  const s = cfg.settings;
  const notReady = upshotReady(cfg, s.eventPath);
  if (notReady) return { ok: false, status: 0, body: null, error: notReady };

  const now = Date.now();
  const body = {
    auth: upshotAuth(cfg, platform),
    data: {
      appuid: userId,
      userId,
      eventId: eventId ?? `${userId}-${eventName}-${now}`,
      platform: s.platform || 'Android',
      eventName,
      eventAttributes: properties,
      startTime: now,
      endTime: now,
      tzoffset: typeof s.tzoffset === 'number' ? s.tzoffset : 19800000,
    },
  };

  return httpJson(joinUrl(s.baseUrl, s.eventPath), s.eventMethod || 'POST', {}, body);
}

/** Which Upshot event to fire for a customer stalled at a given stage. */
export async function upshotEventNameForStage(stage: string): Promise<string> {
  const cfg = await getProviderConfig('upshot');
  const map = (cfg.settings.stageEventMap as Record<string, string>) ?? {};
  return map[stage] || cfg.settings.defaultEventName || 'swiftloan_journey_nudge';
}
