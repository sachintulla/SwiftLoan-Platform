/**
 * WS7 — the context handed to the voice agent when it calls a website lead.
 *
 * This is the piece that makes the call feel like a continuation rather than a
 * cold call: the agent already knows the name, the product, the amount and how
 * long ago the form was submitted, so it can open with "you asked about a
 * ₹3,00,000 personal loan a minute ago" instead of "may I know why you're
 * calling".
 *
 * ONE source of truth. `LEAD_CALL_VARIABLES` is both:
 *   - the list registered on the Ello agent (`dynamic_variables`, which the
 *     provider validates as an array of plain strings), and
 *   - the keys we send in `context_data` when triggering the call.
 * If the two ever drift, the agent's prompt renders `{{lead_name}}` literally
 * and reads a template out loud to a customer. Keeping them in one array is
 * what prevents that.
 */
import type { Customer } from '@prisma/client';
import { prisma } from './prisma.js';
import { STAGE_LABELS } from './journey.js';
import { nextActionFor } from './nextAction.js';

/**
 * Every variable the lead-callback agent may reference.
 *
 * Names are snake_case and prefixed by domain so they read unambiguously inside
 * a prompt. Adding one here is not enough on its own — re-run the agent sync
 * (`npm run ello:sync`) so Ello learns the new name.
 */
export const LEAD_CALL_VARIABLES = [
  'lead_name',
  'lead_first_name',
  'lead_city',
  'lead_phone',
  'lead_product',
  'lead_amount',
  'lead_amount_words',
  'lead_submitted_ago',
  'lead_source',
  'lead_campaign',
  'lead_stage',
  'lead_summary',
  'lead_next_action',
  'lead_prior_inquiries',
  'lead_is_returning',
  'agent_purpose',
  /**
   * The cross-channel conversation brief, pushed at dial time.
   *
   * The agent can also fetch this itself via the get_customer_history tool, but
   * sending it here means every outbound call carries the history even when that
   * tool has not been configured yet — and it removes a round-trip while a
   * customer is listening to silence.
   */
  'conversation_history',
  'conversation_count',
  // ── Drop-off follow-up (agent_purpose = app_dropoff_followup) ────────────
  // Only populated when the call was triggered by a stall rule. They are what
  // let the agent say "you entered your number but never reached the OTP screen"
  // instead of a generic "how can I help".
  'stall_reason',
  'stall_last_step',
  'stall_expected_step',
  'stall_minutes',
  'stall_channel',
] as const;

export type LeadCallVariable = (typeof LEAD_CALL_VARIABLES)[number];
export type LeadCallContext = Record<LeadCallVariable, string>;

/** ₹3,00,000 — Indian digit grouping, which is what a caller expects to hear. */
function inrWords(paise: number | null | undefined): string {
  if (paise == null) return '';
  const rupees = Math.round(paise / 100);
  if (rupees >= 10_000_000) return `${+(rupees / 10_000_000).toFixed(2)} crore rupees`;
  if (rupees >= 100_000) return `${+(rupees / 100_000).toFixed(2)} lakh rupees`;
  return `${rupees.toLocaleString('en-IN')} rupees`;
}

function inrDigits(paise: number | null | undefined): string {
  if (paise == null) return '';
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function agoWords(from: Date | null | undefined, now: Date): string {
  if (!from) return '';
  const mins = Math.round((now.getTime() - from.getTime()) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Build the full variable set for a customer.
 *
 * Every value is a string — `context_data` is flattened into prompt text by the
 * provider, and a null would render as "null" mid-sentence. Empty string is the
 * safe absent value: the prompt is written so a blank variable makes the agent
 * ask the question instead of asserting something false.
 */
export interface StallContext {
  reason: string;
  lastStep: string;
  expectedStep: string;
  minutes: number;
  /** Which surface they dropped off on, e.g. "the app". */
  channel?: string;
}

export async function buildLeadCallContext(
  customer: Customer,
  opts: { purpose?: string; now?: Date; stall?: StallContext } = {},
): Promise<LeadCallContext> {
  const now = opts.now ?? new Date();

  // The website's own wording for what they wanted, taken from the most recent
  // inquiry for this phone. Far better than anything we could synthesise.
  const lead = customer.phone
    ? await prisma.anonymousLead
        .findFirst({
          where: { phone: customer.phone },
          orderBy: { createdAt: 'desc' },
        })
        .catch(() => null)
    : null;

  // "Returning" changes the opening line, so count earlier inquiries excluding
  // the one that triggered this call.
  const priorCount = customer.phone
    ? await prisma.anonymousLead
        .count({ where: { phone: customer.phone, ...(lead ? { id: { not: lead.id } } : {}) } })
        .catch(() => 0)
    : 0;

  const amount = lead?.amount ?? null;
  const product = lead?.productInterest ?? '';
  const full = (customer.name ?? '').trim();

  // Everything we have already discussed with this number, on any channel.
  // Best-effort: a missing brief must not stop the call being placed.
  const memory = customer.phone
    ? await prisma.conversationSummary.findUnique({ where: { phone: customer.phone } }).catch(() => null)
    : null;

  const str = (v: unknown): string => (v == null ? '' : String(v));

  return {
    lead_name: full,
    lead_first_name: full ? full.split(/\s+/)[0] : '',
    lead_city: str(customer.city),
    lead_phone: str(customer.phone),
    lead_product: product,
    lead_amount: inrDigits(amount),
    lead_amount_words: inrWords(amount),
    lead_submitted_ago: agoWords(lead?.createdAt ?? customer.firstSeenAt, now),
    lead_source: str(customer.firstSource),
    lead_campaign: str(customer.campaignId ?? customer.utmCampaign),
    lead_stage: STAGE_LABELS[customer.currentStage] ?? str(customer.currentStage),
    lead_summary: str(lead?.note),
    lead_next_action: nextActionFor(customer.currentStage),
    lead_prior_inquiries: priorCount ? String(priorCount) : '',
    lead_is_returning: priorCount > 0 ? 'yes' : 'no',
    agent_purpose: opts.purpose ?? 'website_lead_followup',
    conversation_history: memory?.summary ?? '',
    conversation_count: memory?.conversationCount ? String(memory.conversationCount) : '',
    // Empty unless a stall rule triggered this call; compactContext() then drops
    // them, and the prompt's drop-off branch never activates.
    stall_reason: opts.stall?.reason ?? '',
    stall_last_step: opts.stall?.lastStep ?? '',
    stall_expected_step: opts.stall?.expectedStep ?? '',
    stall_minutes: opts.stall?.minutes != null ? String(opts.stall.minutes) : '',
    stall_channel: opts.stall?.channel ?? '',
  };
}

/**
 * Plain-English descriptions of each drop-off, spoken by the agent.
 *
 * SECOND PERSON, and no leading pronoun — the prompt says "I noticed you
 * {{stall_reason}}", so a third-person phrasing produced "I noticed you entered
 * THEIR phone number". Keep every entry grammatical after the word "you".
 *
 * Phrased as a question about a *problem*, not a chase: someone who abandoned a
 * loan form at the OTP screen most likely hit something that did not work, and
 * opening as if they were merely lazy is both wrong and off-putting.
 */
export const STALL_REASONS: Record<string, string> = {
  [`${'otp_requested'}→${'otp_verified'}`]:
    'entered your phone number in the app but never got past the OTP screen',
  [`${'app_opened'}→${'otp_requested'}`]:
    'opened the app but never entered your phone number',
  [`${'language_selected'}→${'otp_requested'}`]:
    'chose a language in the app but never entered your phone number',
  [`${'otp_verified'}→${'eligibility_started'}`]:
    'signed in to the app but never started the loan application',
  [`${'otp_verified'}→${'eligibility_completed'}`]:
    'signed in to the app but did not finish the eligibility check',
  [`${'eligibility_started'}→${'eligibility_completed'}`]:
    'started the eligibility form but did not finish it',
  [`${'offer_viewed'}→${'offer_selected'}`]:
    'saw your loan offers but did not choose one',
  [`${'kyc_started'}→${'kyc_completed'}`]:
    'started your KYC but did not complete it',
  [`${'app_installed'}→${'otp_verified'}`]:
    'installed the app but never signed in',
  [`${'lead_captured'}→${'app_installed'}`]:
    'enquired on our website but have not installed the app yet',
};

/** Fall back to a readable sentence for any rule we have no wording for. */
export function stallReasonFor(triggerEvent: string, expectedEvent: string): string {
  const key = `${triggerEvent}→${expectedEvent}`;
  if (STALL_REASONS[key]) return STALL_REASONS[key];
  // Also second person, for the same reason as the table above.
  const nice = (s: string) => s.replace(/_/g, ' ');
  return `got as far as "${nice(triggerEvent)}" but did not go on to "${nice(expectedEvent)}"`;
}

/**
 * Drop empty values before sending.
 *
 * An absent variable is better than an empty one: the prompt instructs the agent
 * to ask when a detail is missing, and a present-but-blank value can render as a
 * dangling "your  loan" in the middle of a sentence.
 */
export function compactContext(ctx: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== '' && v != null));
}
