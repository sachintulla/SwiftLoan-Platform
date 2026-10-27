/**
 * WhatsApp summary after a conversation.
 *
 * When an agent finishes talking to a customer (a call, the in-app companion or the
 * website widget), the customer gets a WhatsApp message recapping what was agreed
 * and what happens next. The template is an approved WhatsApp template with
 * variables, created in CPaaS (Vox Digitals) or Meta, and chosen on Configs → Stage
 * outreach → "After every conversation".
 *
 * Safety rules, because this goes to a real customer:
 *  - Off until an admin turns it on AND names a template.
 *  - Only the agent's `customer_summary` is ever sent. The internal `summary` is
 *    written for colleagues ("customer asked about rates") and must not reach the
 *    customer, so when the agent gave no customer-facing recap nothing is sent.
 *  - Nothing for conversations that ended in a refusal, a wrong number, voicemail
 *    or no answer.
 *  - Never to someone who asked us to stop, and in test mode only to the allowed
 *    test numbers.
 *  - Once per conversation, claimed before sending so a retry cannot double-send.
 */
import type { CallOutcome } from '@prisma/client';
import { prisma } from './prisma.js';
import { getProviderConfig } from './integrations.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { buildPlaceholders } from './stallWhatsapp.js';
import { withinTestAllowlist } from './callGate.js';
import { scoped } from './log.js';

const log = scoped('conversation-summary');

export interface ConversationSummaryConfig {
  enabled: boolean;
  /** The approved WhatsApp template name. Blank = nothing is sent. */
  template: string;
  language: string;
  /** Values for the template's {{1}}, {{2}}… Each entry may contain {tokens}. */
  placeholders: string[];
}

export const SUMMARY_TOKENS = ['{name}', '{summary}', '{actionPlan}', '{callbackTime}', '{outcome}'] as const;

export const DEFAULT_SUMMARY_CONFIG: ConversationSummaryConfig = {
  enabled: false,
  template: '',
  language: 'en',
  placeholders: ['{name}', '{summary}', '{actionPlan}'],
};

/** Clean whatever is stored or submitted. Never throws; a bad value drops a field, not the send. */
export function normalizeSummaryConfig(raw: unknown): ConversationSummaryConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const template = typeof r.template === 'string' && /^[a-z0-9_]{1,100}$/.test(r.template.trim()) ? r.template.trim() : '';
  const language = typeof r.language === 'string' && /^[a-zA-Z_]{2,10}$/.test(r.language.trim()) ? r.language.trim() : 'en';
  const placeholders = Array.isArray(r.placeholders)
    ? r.placeholders.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter(Boolean).slice(0, 10).map((p) => p.slice(0, 200))
    : DEFAULT_SUMMARY_CONFIG.placeholders;
  return { enabled: r.enabled === true, template, language, placeholders };
}

/** Outcomes where the customer had no real conversation, or does not want one. */
const NO_SUMMARY_OUTCOMES = new Set<string>(['do_not_call', 'wrong_number', 'voicemail', 'unreachable', 'not_interested']);

export function shouldSendSummary(outcome: string | null | undefined): boolean {
  return !outcome || !NO_SUMMARY_OUTCOMES.has(outcome);
}

const OUTCOME_LABEL: Record<string, string> = {
  interested: 'Interested',
  callback_requested: 'Callback requested',
  installed_app: 'App installed',
  other: 'Discussed',
};

/** What to tell the customer happens next when the agent did not say. */
export function defaultActionPlan(outcome: string | null | undefined, callbackTime?: string | null): string {
  if (outcome === 'callback_requested') return callbackTime ? `We will call you back on ${callbackTime}.` : 'We will call you back at the time you asked.';
  if (outcome === 'installed_app') return 'Open the SwiftLoan app to see your offers and continue your application.';
  if (outcome === 'interested') return 'Open the SwiftLoan app to view your offers and continue where you left off.';
  return 'Our team will follow up with you shortly.';
}

/**
 * A WhatsApp template value cannot hold line breaks, tabs or runs of more than
 * four spaces, and the whole body is capped, so flatten and trim.
 */
export function forWhatsApp(text: string | null | undefined, max = 400): string {
  const flat = String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function formatCallback(at: Date | null | undefined): string | null {
  if (!at) return null;
  return at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

export interface SummaryInput {
  /** The conversation row; the claim key is built from it so one conversation sends once. */
  conversationId: string;
  phone: string;
  customerId?: string | null;
  customerName?: string | null;
  /** Written for the customer, in the second person. Required to send anything. */
  customerSummary?: string | null;
  /** What happens next. A sensible default is used when the agent gave none. */
  actionPlan?: string | null;
  outcome?: CallOutcome | string | null;
  callbackAt?: Date | null;
  source: 'call' | 'app' | 'website';
}

/** The values a template may reference. Every one is non-empty, since WhatsApp rejects blanks. */
export function buildSummaryVars(i: SummaryInput): Record<string, string> {
  const callbackTime = formatCallback(i.callbackAt) ?? '';
  const first = String(i.customerName ?? '').trim().split(/\s+/)[0];
  return {
    name: first || 'there',
    summary: forWhatsApp(i.customerSummary, 500),
    actionPlan: forWhatsApp(i.actionPlan, 300) || defaultActionPlan(i.outcome ?? null, callbackTime),
    callbackTime: callbackTime || 'the time we agreed',
    outcome: OUTCOME_LABEL[String(i.outcome ?? '')] ?? 'Discussed',
  };
}

export type SummaryResult = 'sent' | 'failed' | `skipped:${string}`;

/** Send the recap. Never throws: a messaging problem must not break the webhook that triggered it. */
export async function sendConversationSummary(i: SummaryInput): Promise<SummaryResult> {
  try {
    const vox = await getProviderConfig('voxvalley');
    const cfg = normalizeSummaryConfig((vox.settings as Record<string, unknown>).conversationSummary);
    if (!cfg.enabled || !cfg.template) return 'skipped:off';
    if (!shouldSendSummary(i.outcome ?? null)) return 'skipped:outcome';
    if (!forWhatsApp(i.customerSummary)) {
      log.info('no customer-facing summary from the agent, nothing sent', { conversationId: i.conversationId });
      return 'skipped:no_customer_summary';
    }
    if (!withinTestAllowlist(i.phone)) return 'skipped:test_mode';
    if (!(await whatsappConfigured())) return 'skipped:whatsapp_not_configured';

    if (i.customerId) {
      const c = await prisma.customer.findUnique({ where: { id: i.customerId }, select: { currentStage: true } });
      if (c?.currentStage === 'lost') return 'skipped:do_not_contact';
    }

    const placeholders = buildPlaceholders(cfg.placeholders, buildSummaryVars(i));
    if (!placeholders) return 'skipped:missing_value';

    // Claim BEFORE sending, so a retried webhook cannot send a second copy.
    const key = `conv-summary:${i.conversationId}`;
    let claimId: string;
    try {
      const claim = await prisma.outboundRequest.create({
        data: {
          customerId: i.customerId ?? null,
          channel: 'whatsapp',
          kind: 'conversation_summary',
          idempotencyKey: key,
          status: 'pending',
          payload: { template: cfg.template, source: i.source, outcome: i.outcome ?? null },
        },
      });
      claimId = claim.id;
    } catch {
      return 'skipped:already_sent';
    }

    const result = await sendWhatsAppTemplate({
      phone: i.phone,
      templateName: cfg.template,
      language: cfg.language,
      placeholders,
      referenceId: claimId,
      track: { kind: 'conversation_summary', customerId: i.customerId ?? null },
    });

    await prisma.outboundRequest
      .update({
        where: { id: claimId },
        data: result.ok
          ? { status: 'sent', sentAt: new Date(), providerRef: result.messageId ?? null }
          : { status: 'failed', lastError: (result.error ?? 'send failed').slice(0, 500) },
      })
      .catch(() => undefined);

    if (!result.ok) {
      log.warn('summary not delivered', { conversationId: i.conversationId, error: result.error ?? null });
      return 'failed';
    }
    log.info('summary sent', { conversationId: i.conversationId, source: i.source });
    return 'sent';
  } catch (e) {
    log.error('summary failed', { conversationId: i.conversationId, error: (e as Error).message });
    return 'failed';
  }
}
