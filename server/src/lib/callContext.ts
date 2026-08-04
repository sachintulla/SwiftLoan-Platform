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
export async function buildLeadCallContext(
  customer: Customer,
  opts: { purpose?: string; now?: Date } = {},
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
  };
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
