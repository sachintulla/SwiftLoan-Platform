/**
 * "Send me the link" asked for ON A CALL (the Ello outbound agent's `send_app_link` tool).
 *
 * Nothing new is authored here: it sends the SAME approved WhatsApp template and the SAME `/dl?ref=<token>` link the
 * drop-off messages already use (dropoffSteps.ts DEFAULT_DROPOFF_MESSAGES, merged under the Voxvalley `dropoffMessages`
 * setting), chosen from where the person actually stopped. The only difference is the trigger: the customer said "yes, send
 * it" on a call, so the automatic-send switch (`dropoff.sendEnabled`) and the stall delays do not apply. The safety checks
 * that protect a person still do: do-not-contact, the review phone, the QA test-number list, and one send per phone per hour.
 *
 * The pure choice (`planAgentLink`) is tested in agentLink.test.ts; `sendAgentLink` is the database + sending side.
 */
import { prisma } from './prisma.js';
import { downloads } from '../config/downloads.js';
import { getProviderConfig } from './integrations.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { isReviewPhone } from './reviewLogin.js';
import { normalisePhone } from './dialer.js';
import { alreadyInApp, notOnTestList, tidyName } from './installReminder.js';
import { buildInstallLink, DEFAULT_STEP_LABELS } from './reminderSchedule.js';
import { loadSnapshot } from './appDropoff.js';
import { scoped } from './log.js';
import {
  DEFAULT_DROPOFF_MESSAGES, DROPOFF_STEP_LABELS, deriveDropoff, includeAppLink, mergeDropoffMessages, messageKindFor, resolveWhatsappMessage,
  type DropoffMessageKind, type DropoffStatus,
} from './dropoffSteps.js';

const log = scoped('agent-link');

/** One link per phone per hour: an agent that calls the tool twice (or a customer who says "yes" twice) sends one message. */
const BUCKET_MS = 3_600_000;

export type AgentLinkSkip =
  | 'no_link_needed'      // no-offers / applied / finished: a link is not the next step
  | 'no_link_to_carry'    // not in the app and no website reference to put in the link
  | 'unknown_number'
  | 'do_not_contact'
  | 'review_phone'
  | 'not_on_test_list'
  | 'sent_recently'
  | 'template_missing'
  | 'whatsapp_not_configured';

export type AgentLinkPlan =
  | { ok: true; kind: DropoffMessageKind; withLink: boolean; status: DropoffStatus | null; stepLabel: string }
  | { ok: false; reason: Extract<AgentLinkSkip, 'no_link_needed' | 'no_link_to_carry'> };

/**
 * Which existing message fits where this person is. Pure.
 *   - stopped before PAN (OTP only): the "continue" message, calling the step "PAN verification" (website step 1)
 *   - PAN done / details filled: the "continue" message
 *   - offers came, none picked: the "offers ready" message
 *   - no offers / applied / finished / failed: nothing to send (the agent says so, never "sent")
 * The link goes only to someone who is not in the app yet (dropoffSteps.ts includeAppLink), and needs a reference to carry.
 */
export function planAgentLink(i: { status: DropoffStatus | null; inApp: boolean; hasToken: boolean; labels?: Partial<Record<DropoffStatus, string>> }): AgentLinkPlan {
  const labels = { ...DROPOFF_STEP_LABELS, ...(i.labels ?? {}) };
  let kind: DropoffMessageKind;
  let stepLabel: string;
  if (i.status === null) {
    kind = 'continue';
    stepLabel = DEFAULT_STEP_LABELS.otp_only;
  } else {
    const k = messageKindFor(i.status);
    if (!k || k === 'no_offers') return { ok: false, reason: 'no_link_needed' };
    kind = k;
    stepLabel = labels[i.status];
  }
  const withLink = includeAppLink(kind, i.inApp);
  if (withLink && !i.hasToken) return { ok: false, reason: 'no_link_to_carry' };
  return { ok: true, kind, withLink, status: i.status, stepLabel };
}

export interface AgentLinkResult {
  /** True ONLY when the provider accepted the message. The agent may say "sent" only then. */
  sent: boolean;
  status: 'sent' | 'skipped' | 'failed';
  reason?: AgentLinkSkip | 'send_failed';
  /** What the agent should tell the customer, in plain words (the prompt says to follow this). */
  say: string;
}

const SAY: Record<AgentLinkSkip | 'send_failed', string> = {
  no_link_needed: 'No link is needed for this person right now. Do not offer to send one; carry on with the call.',
  no_link_to_carry: 'The link could not be sent from here. Say the team will send it shortly; do not say it has been sent.',
  unknown_number: 'The link could not be sent. Say the team will send it shortly; do not say it has been sent.',
  do_not_contact: 'Do not send or promise anything. Respect their request and end politely.',
  review_phone: 'The link could not be sent. Say the team will send it shortly; do not say it has been sent.',
  not_on_test_list: 'The link could not be sent. Say the team will send it shortly; do not say it has been sent.',
  sent_recently: 'A link was already sent to this number a short while ago. Say it was sent earlier on WhatsApp, and they can use that one.',
  template_missing: 'The link could not be sent. Say the team will send it shortly; do not say it has been sent.',
  whatsapp_not_configured: 'The link could not be sent. Say the team will send it shortly; do not say it has been sent.',
  send_failed: 'The link could not be sent. Say the team will send it shortly; do not say it has been sent.',
};

const skipped = (reason: AgentLinkSkip): AgentLinkResult => ({ sent: false, status: 'skipped', reason, say: SAY[reason] });

/** Which phone to send to: the call's own number when the agent gives its conversation id (immune to a mis-filled phone), else the number given. */
export async function resolveAgentLinkPhone(i: { conversationId?: unknown; phone?: unknown }): Promise<string | null> {
  const cid = typeof i.conversationId === 'string' ? i.conversationId.trim() : '';
  if (cid) {
    const attempt = await prisma.callAttempt.findFirst({
      where: { OR: [{ providerConversationId: cid }, { id: cid }] }, select: { phone: true },
    });
    const p = normalisePhone(attempt?.phone);
    if (p) return p;
  }
  return normalisePhone(i.phone);
}

export async function sendAgentLink(phone: string, now: Date = new Date()): Promise<AgentLinkResult> {
  const customer = await prisma.customer.findUnique({ where: { phone }, select: { id: true, currentStage: true } });
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, firstName: true } });
  if (!customer && !user) return skipped('unknown_number');
  if (customer?.currentStage === 'lost') return skipped('do_not_contact');
  if (isReviewPhone(phone)) return skipped('review_phone');
  if (notOnTestList(phone)) return skipped('not_on_test_list');

  const snap = user ? await loadSnapshot(user.id) : null;
  const state = snap ? deriveDropoff(snap.snapshot) : { status: null, since: null, reason: null };
  const jr = await prisma.journeyReminder.findFirst({
    where: user ? { userId: user.id } : { phone }, orderBy: { createdAt: 'desc' }, select: { token: true, firstName: true },
  });

  const cfg = await getProviderConfig('voxvalley');
  const labels = (cfg.settings.dropoffStepLabels as Partial<Record<DropoffStatus, string>> | undefined) ?? undefined;
  const plan = planAgentLink({ status: state.status, inApp: await alreadyInApp(phone), hasToken: !!jr?.token, labels });
  if (!plan.ok) return skipped(plan.reason);

  const link = plan.withLink && jr?.token ? buildInstallLink(downloads.publicBase, jr.token) : '';
  const app = user
    ? await prisma.loanApplication.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, select: { ref: true, _count: { select: { offers: true } } } })
    : null;
  const msg = resolveWhatsappMessage(mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, cfg.settings.dropoffMessages), plan.kind, plan.withLink, {
    name: jr?.firstName ?? tidyName(user?.firstName) ?? 'there', step: plan.stepLabel, link, ref: app?.ref ?? null, offerCount: app?._count.offers ?? null,
  });
  if (!msg.ok) return skipped('template_missing');
  if (!(await whatsappConfigured())) return skipped('whatsapp_not_configured');

  // Claim BEFORE sending (unique key per phone per hour) so a repeated tool call cannot send twice. A refused or failed send releases it.
  const key = `agentlink:${phone}:${Math.floor(now.getTime() / BUCKET_MS)}`;
  try {
    await prisma.outboundRequest.create({
      data: { customerId: customer?.id ?? null, channel: 'whatsapp', kind: 'agent_link', idempotencyKey: key, status: 'sent', payload: { kind: plan.kind, withLink: plan.withLink } },
    });
  } catch {
    return skipped('sent_recently');
  }
  const release = () => prisma.outboundRequest.deleteMany({ where: { idempotencyKey: key } }).catch(() => undefined);

  const res = await sendWhatsAppTemplate({
    phone, templateName: msg.template, language: msg.language, placeholders: msg.placeholders, category: msg.category, referenceId: key,
    track: {
      kind: 'app_dropoff', customerId: customer?.id ?? null,
      trigger: { by: 'Voice agent (asked on the call)', stage: plan.stepLabel, step: `Link sent on request · ${plan.kind}` },
    },
  });
  if (!res.ok) {
    await release();
    log.warn('send failed', { phone, error: res.error });
    return { sent: false, status: 'failed', reason: 'send_failed', say: SAY.send_failed };
  }
  log.info('link sent', { phone, kind: plan.kind, withLink: plan.withLink });
  return {
    sent: true,
    status: 'sent',
    say: 'The WhatsApp message has been sent to this number. You may say so, and that it can take a minute to arrive.',
  };
}
