/**
 * Stage outreach — one place that describes, per journey stage, every follow-up
 * the customer gets (WhatsApp, SMS, Ello call), when it goes out and what data
 * travels with it.
 *
 * The timing and on/off state of each activity stay on the existing StallRule
 * rows, so the Notification Rules page and this view can never disagree. What
 * this file adds is the part a StallRule cannot hold: which Ello agent places
 * the call, the stage-specific brief the agent speaks to, and a description of
 * every variable the agent receives.
 */
import { JOURNEY_EVENTS } from './journey.js';
import { LEAD_CALL_VARIABLES, type LeadCallVariable } from './callContext.js';
import { AGENT_ROLES, type AgentRole } from './agents.js';
import { getProviderConfig } from './integrations.js';

export type Surface = 'Website' | 'Website and app' | 'App';

/** Which customers a rule applies to. 'all' keeps the behaviour every rule had before sides existed. */
export type RuleSurface = 'all' | 'app' | 'website';
export const RULE_SURFACES: readonly RuleSurface[] = ['all', 'app', 'website'];

export interface OutreachStage {
  /** The journey event the customer got stuck AT; also the stallTemplates key. */
  key: string;
  label: string;
  description: string;
  /** Where the customer is when they stop. Journey events are shared, so a stage can cover both. */
  surface: Surface;
  /** The next step they did not take; a new follow-up added here watches for it. */
  expectedEvent: string;
}

/**
 * The whole customer journey, in order. Website visitors and app users share these
 * events (the app's own telemetry is mapped onto them in appEventMap.ts), so one
 * list configures both. The first stage and the five that have a WhatsApp template
 * are the ones the dashboard shipped with; the rest give the app its own stages.
 */
export const OUTREACH_STAGES: readonly OutreachStage[] = [
  { key: JOURNEY_EVENTS.LEAD_CAPTURED, label: 'Lead captured', surface: 'Website', expectedEvent: JOURNEY_EVENTS.APP_INSTALLED, description: 'Left their number on the website but has not installed the app.' },
  { key: JOURNEY_EVENTS.APP_INSTALLED, label: 'App installed', surface: 'App', expectedEvent: JOURNEY_EVENTS.OTP_VERIFIED, description: 'Installed the app but never signed in.' },
  { key: JOURNEY_EVENTS.OTP_REQUESTED, label: 'OTP requested', surface: 'Website and app', expectedEvent: JOURNEY_EVENTS.OTP_VERIFIED, description: 'Asked for an OTP but never entered it.' },
  { key: JOURNEY_EVENTS.OTP_VERIFIED, label: 'Signed in', surface: 'Website and app', expectedEvent: JOURNEY_EVENTS.ELIGIBILITY_STARTED, description: 'Verified the OTP but never started an application.' },
  { key: JOURNEY_EVENTS.ELIGIBILITY_STARTED, label: 'Application started', surface: 'Website and app', expectedEvent: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED, description: 'Started the application form but did not finish it.' },
  { key: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED, label: 'Eligibility done', surface: 'Website and app', expectedEvent: JOURNEY_EVENTS.OFFER_VIEWED, description: 'Finished the eligibility check but did not open the offers.' },
  { key: JOURNEY_EVENTS.OFFER_VIEWED, label: 'Offers viewed', surface: 'Website and app', expectedEvent: JOURNEY_EVENTS.OFFER_SELECTED, description: 'Saw their offers but did not choose one.' },
  { key: JOURNEY_EVENTS.OFFER_SELECTED, label: 'Offer chosen', surface: 'Website and app', expectedEvent: JOURNEY_EVENTS.APPLICATION_SUBMITTED, description: 'Chose an offer but did not submit the application.' },
  // A lender turned the application down. The follow-up waits for the customer to choose another offer.
  { key: JOURNEY_EVENTS.LOAN_REJECTED, label: 'Rejected by lender', surface: 'Website and app', expectedEvent: JOURNEY_EVENTS.OFFER_SELECTED, description: 'A lender turned down their application and they have not chosen another offer.' },
];

/* ───────────────────────────── the two flows ─────────────────────────────
 * The customer does different things on the website and in the app, so Stage outreach shows two lists in the order each
 * flow really goes. Both sit on the same journey events (the website and the app now record the same ones), so a step
 * here is a plain-words name for one of the stages above. "Basic details" and "More details" are one step on purpose.
 */
export type FlowKey = 'app' | 'website';

export interface FlowStep {
  /** The stage (journey event) this step stands on; the rules, templates and schedules are stored under it. */
  key: string;
  label: string;
  description: string;
}

export const FLOW_STEPS: Readonly<Record<FlowKey, readonly FlowStep[]>> = Object.freeze({
  app: [
    { key: JOURNEY_EVENTS.APP_INSTALLED, label: 'Install the app', description: 'Installed, never signed in.' },
    { key: JOURNEY_EVENTS.OTP_REQUESTED, label: 'Sign in', description: 'Asked for an OTP, never entered it.' },
    { key: JOURNEY_EVENTS.OTP_VERIFIED, label: 'PAN verification', description: 'Signed in, PAN not verified.' },
    { key: JOURNEY_EVENTS.ELIGIBILITY_STARTED, label: 'Basic details', description: 'PAN verified, stopped on details.' },
    { key: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED, label: 'Fetching offers', description: 'Check done, offers not opened.' },
    { key: JOURNEY_EVENTS.OFFER_VIEWED, label: 'Selecting an offer', description: 'Saw offers, picked none.' },
    { key: JOURNEY_EVENTS.OFFER_SELECTED, label: 'Applying', description: 'Picked an offer, did not submit.' },
    { key: JOURNEY_EVENTS.LOAN_REJECTED, label: 'Rejected by a lender', description: 'A lender said no.' },
  ],
  website: [
    { key: JOURNEY_EVENTS.LEAD_CAPTURED, label: 'Enquiry form', description: 'Left a number, app not installed.' },
    { key: JOURNEY_EVENTS.OTP_REQUESTED, label: 'Sign in', description: 'Asked for an OTP, never entered it.' },
    { key: JOURNEY_EVENTS.OTP_VERIFIED, label: 'PAN verification', description: 'Signed in, PAN not verified.' },
    { key: JOURNEY_EVENTS.ELIGIBILITY_STARTED, label: 'Basic details', description: 'PAN verified, stopped on details.' },
    { key: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED, label: 'Finding offers', description: 'Check done, offers not opened.' },
    { key: JOURNEY_EVENTS.OFFER_VIEWED, label: 'Choosing an offer', description: 'Saw offers, picked none.' },
    { key: JOURNEY_EVENTS.OFFER_SELECTED, label: 'Compare and apply', description: 'Picked an offer, did not submit.' },
    { key: JOURNEY_EVENTS.LOAN_REJECTED, label: 'Rejected by a lender', description: 'A lender said no.' },
  ],
});

/** The stage keys a flow covers, in its own order. */
export function flowKeys(flow: FlowKey): string[] {
  return FLOW_STEPS[flow].map((x) => x.key);
}

/** True when a rule limited to `surface` belongs on the `flow` tab ('all' belongs on both). */
export function ruleBelongsTo(surface: string | null | undefined, flow: FlowKey): boolean {
  return !surface || surface === 'all' || surface === flow;
}

export type OutreachChannel = 'whatsapp' | 'sms' | 'email' | 'voice' | 'push';
export const OUTREACH_CHANNELS: readonly OutreachChannel[] = ['whatsapp', 'sms', 'email', 'voice', 'push'];

/** Cooldown a freshly added follow-up starts with: a call is a bigger intrusion than a message. */
export function defaultCooldownMinutes(channel: OutreachChannel): number {
  return channel === 'voice' ? 4320 : 1440;
}

/** A WhatsApp template for one stage, as stored in the Voxvalley settings. */
export interface StageWhatsApp { template: string; language: string; placeholders: string[] }

/** Template names are lowercase letters, digits and underscores (Meta's rule). */
export function cleanWhatsApp(raw: unknown): StageWhatsApp | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const template = typeof r.template === 'string' ? r.template.trim() : '';
  if (!/^[a-z0-9_]{1,100}$/.test(template)) return null;
  const language = typeof r.language === 'string' && /^[a-zA-Z_]{2,10}$/.test(r.language.trim()) ? r.language.trim() : 'en';
  const placeholders = Array.isArray(r.placeholders)
    ? r.placeholders.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter(Boolean).slice(0, 10).map((p) => p.slice(0, 200))
    : [];
  return { template, language, placeholders };
}

/** A per-stage SMS text, which must match what is registered on the DLT portal. */
export interface StageSms { templateId: string; body: string }

export function cleanSms(raw: unknown): StageSms | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const templateId = typeof r.templateId === 'string' ? r.templateId.trim().slice(0, 40) : '';
  const body = typeof r.body === 'string' ? r.body.trim().slice(0, 1000) : '';
  return templateId && body ? { templateId, body } : null;
}

export function isOutreachStage(key: string): boolean {
  return OUTREACH_STAGES.some((s) => s.key === key);
}

/** What an admin can set for the call placed at one stage. */
export interface StageCallSetting {
  /** Which Ello agent role places the call (see agents.ts). Blank = lead callback agent. */
  agentRole?: AgentRole;
  /** A specific Ello agent id; wins over the role. */
  assistantId?: string;
  /** Stage-specific instructions, with {variables}, sent to the agent as `stage_brief`. */
  brief?: string;
}

export const MAX_BRIEF_LENGTH = 1500;
const MAX_ASSISTANT_ID_LENGTH = 80;

/**
 * Clean whatever was stored or submitted: only known stages, only known roles,
 * trimmed and length-capped strings, nothing empty. Never throws, so a bad value
 * in the database can only ever drop a field, not break a call.
 */
export function normalizeStageCalls(raw: unknown): Record<string, StageCallSetting> {
  const out: Record<string, StageCallSetting> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [stage, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isOutreachStage(stage) || !v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const s: StageCallSetting = {};
    if (typeof r.agentRole === 'string' && (AGENT_ROLES as readonly string[]).includes(r.agentRole)) s.agentRole = r.agentRole as AgentRole;
    const id = typeof r.assistantId === 'string' ? r.assistantId.trim().slice(0, MAX_ASSISTANT_ID_LENGTH) : '';
    if (id) s.assistantId = id;
    const brief = typeof r.brief === 'string' ? r.brief.trim().slice(0, MAX_BRIEF_LENGTH) : '';
    if (brief) s.brief = brief;
    if (Object.keys(s).length) out[stage] = s;
  }
  return out;
}

/** The saved call setting for a stage, or null when nothing is set. */
export async function stageCallSetting(stage: string): Promise<StageCallSetting | null> {
  const cfg = await getProviderConfig('ello').catch(() => null);
  const all = normalizeStageCalls((cfg?.settings as Record<string, unknown> | undefined)?.stageCalls);
  return all[stage] ?? null;
}

/**
 * Fill `{variable}` slots with the call's real values. An unknown or empty
 * variable becomes nothing (never the literal braces, which the agent would read
 * aloud), and the gap it leaves is tidied.
 */
export function renderBrief(template: string, vars: Record<string, string | undefined>): string {
  return template
    .replace(/\{([a-z][a-z0-9_]*)\}/gi, (_m, name: string) => vars[name] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .trim();
}

export type VariableGroup = 'Customer' | 'Journey' | 'Lead' | 'Drop-off' | 'Agent';

export interface VariableInfo {
  group: VariableGroup;
  description: string;
  /** Representative value, shown in the admin so nobody has to guess what the agent hears. */
  example: string;
}

/** Documentation for every variable the agent receives. A test keeps this in step with LEAD_CALL_VARIABLES. */
export const VARIABLE_INFO: Record<LeadCallVariable, VariableInfo> = {
  user_name: { group: 'Customer', description: 'Name on their SwiftLoan account, if they registered', example: 'Rahul Sharma' },
  lead_name: { group: 'Customer', description: 'Name they gave on the website form', example: 'Rahul Sharma' },
  lead_first_name: { group: 'Customer', description: 'First name only, for a natural greeting', example: 'Rahul' },
  lead_city: { group: 'Customer', description: 'City they are in', example: 'Hyderabad' },
  lead_phone: { group: 'Customer', description: 'Phone number being called', example: '9876543210' },
  phone: { group: 'Customer', description: 'Same number under the name the history tool expects', example: '9876543210' },
  lead_product: { group: 'Lead', description: 'Loan type they asked about', example: 'Personal loan' },
  lead_amount: { group: 'Lead', description: 'Amount requested, in figures', example: '₹3,00,000' },
  lead_amount_words: { group: 'Lead', description: 'Amount requested, as spoken', example: '3 lakh rupees' },
  lead_submitted_ago: { group: 'Lead', description: 'How long ago the form was submitted', example: '2 hours ago' },
  lead_source: { group: 'Lead', description: 'Where they came from', example: 'website' },
  lead_campaign: { group: 'Lead', description: 'Campaign that brought them', example: 'diwali_offer' },
  lead_stage: { group: 'Journey', description: 'Where they are now, in words', example: 'Offers viewed' },
  lead_stage_key: { group: 'Journey', description: 'Where they are now, as a code', example: 'offer_viewed' },
  lead_stage_number: { group: 'Journey', description: 'Step number in the journey', example: '7' },
  lead_stage_total: { group: 'Journey', description: 'Total steps in the journey', example: '12' },
  lead_journey: { group: 'Journey', description: 'The whole journey with their position marked', example: 'Lead > OTP > Application > Offers ...' },
  lead_journey_done: { group: 'Journey', description: 'Steps already completed', example: 'Lead captured, OTP verified, Eligibility done' },
  lead_journey_next: { group: 'Journey', description: 'The next step they should take', example: 'Choose an offer' },
  lead_summary: { group: 'Lead', description: 'Free-text note from the inquiry', example: 'Needs funds for a wedding' },
  lead_next_action: { group: 'Journey', description: 'What we want them to do next', example: 'Pick the offer that suits you' },
  lead_prior_inquiries: { group: 'Lead', description: 'Earlier inquiries from this number', example: '1' },
  lead_is_returning: { group: 'Lead', description: 'Whether they have asked before', example: 'yes' },
  agent_purpose: { group: 'Agent', description: 'Why this call is happening', example: 'app_dropoff_followup' },
  stage_brief: { group: 'Agent', description: 'Stage instructions written on this page, with variables filled in', example: 'Ask if the offers were unclear and offer to compare them' },
  conversation_history: { group: 'Agent', description: 'Summary of earlier chats and calls on any channel', example: 'Called on 24 Oct, asked about interest rates' },
  conversation_count: { group: 'Agent', description: 'Number of earlier conversations', example: '2' },
  stall_reason: { group: 'Drop-off', description: 'What they did and did not do', example: 'saw your offers but did not choose one' },
  stall_last_step: { group: 'Drop-off', description: 'The last step they reached', example: 'offer viewed' },
  stall_expected_step: { group: 'Drop-off', description: 'The step they did not reach', example: 'offer selected' },
  stall_minutes: { group: 'Drop-off', description: 'Minutes since they stopped', example: '35' },
  stall_channel: { group: 'Drop-off', description: 'Where they stopped', example: 'the app' },
  stall_help: { group: 'Drop-off', description: 'What the agent should offer to do', example: 'help compare the offers' },
};

export const VARIABLE_LIST: Array<VariableInfo & { name: LeadCallVariable }> = LEAD_CALL_VARIABLES.map((name) => ({ name, ...VARIABLE_INFO[name] }));
