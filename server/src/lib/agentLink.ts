/**
 * "I'll send you the link on WhatsApp and SMS" said ON A CALL (the Ello agent's `send_app_link` tool, owner 2026-11-04).
 *
 * The agent calls POST /api/conversations/send-link with the number; we send the app link by SMS AND WhatsApp, both with the
 * same three values — name, status, link:
 *   - SMS: the registered link text (smsRoute.ts LINK_SMS, DLT 1277179300146510723) "Dear {name} , … incomplete at {step}… :{link}"
 *   - WhatsApp: the approved `install_app_resume_step` template ({{1}} name, {{2}} step, {{3}} link), the drop-off "continue / with link"
 *     message (saved Voxvalley `dropoffMessages` win over the default)
 * The number is looked up first: a known person gets their own name and a link carrying their reference (/dl?ref=<token>, so an
 * install is matched back to them and the app resumes with their number); an unknown number gets "Customer" and the plain app link.
 * The status is always "Starting a Loan Application" (Voxvalley setting `callLinkStep` overrides it).
 *
 * The customer asked for it on the call, so the drop-off switches, stall delays and the daily/weekly touch limit do not apply.
 * What still protects a person: do-not-contact, the review phone, the QA test-number list, and one send per phone per hour.
 *
 * The pure choice (`planCallLink`) is tested in agentLink.test.ts; `sendAgentLink` is the database + sending side.
 */
import { prisma } from './prisma.js';
import { downloads } from '../config/downloads.js';
import { getProviderConfig } from './integrations.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { isReviewPhone } from './reviewLogin.js';
import { normalisePhone } from './dialer.js';
import { notOnTestList, tidyName } from './installReminder.js';
import { buildInstallLink, renderSmsBody } from './reminderSchedule.js';
import { newReferralCode } from './attribution.js';
import { LINK_SMS, sendRegisteredSms } from './smsRoute.js';
import { loadSnapshot } from './appDropoff.js';
import { scoped } from './log.js';
import { DEFAULT_DROPOFF_MESSAGES, deriveDropoff, mergeDropoffMessages, pickSms, resolveWhatsappMessage, type DropoffStatus } from './dropoffSteps.js';

const log = scoped('agent-link');

/** One send per phone per hour: an agent that calls the tool twice (or a customer who says "yes" twice) sends once. */
const BUCKET_MS = 3_600_000;
/** The {step} value in both messages. */
export const CALL_LINK_STEP = 'Starting a Loan Application';
/** Message kind for Admin → Messages and the contact limit (exempt: the customer asked for it). */
export const AGENT_LINK_KIND = 'agent_link';

export type AgentLinkSkip = 'do_not_contact' | 'review_phone' | 'not_on_test_list' | 'sent_recently';

/** The three values both messages carry. Pure. A name we hold is used as the person spells it (tidied); otherwise "Customer". */
export function planCallLink(i: {
  userName?: string | null; reminderName?: string | null; customerName?: string | null;
  token?: string | null; publicBase: string; step?: string | null;
}): { name: string; step: string; link: string; known: boolean } {
  const name = tidyName(i.userName) ?? tidyName(i.reminderName) ?? tidyName(i.customerName);
  const base = i.publicBase.replace(/\/$/, '');
  return {
    name: name ?? 'Customer',
    step: i.step?.trim() || CALL_LINK_STEP,
    link: i.token ? buildInstallLink(base, i.token) : `${base}/dl?campaign=voice_agent`,
    known: !!name,
  };
}

/** The website step the app resumes at, for a reference made here (journeyResume.ts reads `lastStep`). */
function resumeStepFor(status: DropoffStatus | null): string {
  if (status === 'pan_verified') return 'pan_done';
  if (status === 'application_filled' || status === 'offers_not_applied' || status === 'rejected') return 'application_started';
  return 'otp_only';
}

export interface AgentLinkResult {
  /** True when at least one channel was accepted by the provider. The agent may say "sent" only then. */
  sent: boolean;
  status: 'sent' | 'skipped' | 'failed';
  reason?: AgentLinkSkip | 'send_failed';
  sms: 'sent' | 'failed' | 'not_sent';
  whatsapp: 'sent' | 'failed' | 'not_sent';
  /** Whether the number belongs to someone we know (their name was used). */
  known_customer: boolean;
  /** What the agent should tell the customer, in plain words (the prompt says to follow this). */
  say: string;
}

const NOT_SENT = 'The link could not be sent right now. Say the team will send it shortly; do not say it has been sent.';
const SAY: Record<AgentLinkSkip | 'send_failed', string> = {
  do_not_contact: 'Do not send or promise anything. Respect their request and end politely.',
  review_phone: NOT_SENT,
  not_on_test_list: NOT_SENT,
  send_failed: NOT_SENT,
  sent_recently: 'The link was already sent to this number a short while ago. Say it was sent earlier by SMS and WhatsApp, and they can use that one.',
};

const skipped = (reason: AgentLinkSkip, known = false): AgentLinkResult =>
  ({ sent: false, status: 'skipped', reason, sms: 'not_sent', whatsapp: 'not_sent', known_customer: known, say: SAY[reason] });

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

/** The person's newest link reference; one is made (as an ended reminder row, so no reminder job picks it up) if they have none. */
async function linkTokenFor(user: { id: string; phone: string; firstName: string | null }, customerId: string | null, now: Date): Promise<{ token: string; firstName: string | null } | null> {
  const jr = await prisma.journeyReminder.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { token: true, firstName: true } });
  if (jr) return jr;
  const snap = await loadSnapshot(user.id);
  const status = snap ? deriveDropoff(snap.snapshot).status : null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.journeyReminder.create({
        data: {
          userId: user.id, customerId, phone: user.phone, token: newReferralCode(), firstName: tidyName(user.firstName), lastStep: resumeStepFor(status),
          status: 'completed', stopReason: AGENT_LINK_KIND, startAt: now, nextCheckAt: now,
        },
        select: { token: true, firstName: true },
      });
      return row;
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e; // token collision: try another
    }
  }
  return null;
}

export async function sendAgentLink(phone: string, now: Date = new Date()): Promise<AgentLinkResult> {
  const customer = await prisma.customer.findUnique({ where: { phone }, select: { id: true, name: true, currentStage: true } });
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, phone: true, firstName: true } });
  const known = !!(customer || user);
  if (customer?.currentStage === 'lost') return skipped('do_not_contact', known);
  if (isReviewPhone(phone)) return skipped('review_phone', known);
  if (notOnTestList(phone)) return skipped('not_on_test_list', known);

  const cfg = await getProviderConfig('voxvalley');
  const messages = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, cfg.settings.dropoffMessages);
  const picked = pickSms(messages, 'continue', true); // pickSms returns only a complete text (id + body with {link})
  const sms = { templateId: picked?.templateId ?? LINK_SMS.templateId, body: picked?.body ?? LINK_SMS.body };
  const ref = user ? await linkTokenFor(user, customer?.id ?? null, now) : null;
  const v = planCallLink({
    userName: user?.firstName, reminderName: ref?.firstName, customerName: customer?.name, token: ref?.token,
    publicBase: downloads.publicBase, step: typeof cfg.settings.callLinkStep === 'string' ? cfg.settings.callLinkStep : null,
  });
  const wa = resolveWhatsappMessage(messages, 'continue', true, { name: v.name, step: v.step, link: v.link });
  const waReady = wa.ok && (await whatsappConfigured());

  // Claim BEFORE sending (unique key per phone per hour) so a repeated tool call cannot send twice. Released if nothing went out.
  const key = `agentlink:${phone}:${Math.floor(now.getTime() / BUCKET_MS)}`;
  try {
    await prisma.outboundRequest.create({
      data: { customerId: customer?.id ?? null, channel: 'sms', kind: AGENT_LINK_KIND, idempotencyKey: key, status: 'sent', payload: { name: v.name, step: v.step, link: v.link, known } },
    });
  } catch {
    return skipped('sent_recently', known);
  }
  const track = { kind: AGENT_LINK_KIND, customerId: customer?.id ?? null };

  const smsRes = await sendRegisteredSms({ phone, templateId: sms.templateId, text: renderSmsBody(sms.body, v), track });
  const waRes = waReady && wa.ok
    ? await sendWhatsAppTemplate({
        phone, templateName: wa.template, language: wa.language, placeholders: wa.placeholders, category: wa.category, referenceId: key,
        track: { ...track, trigger: { by: 'Voice agent (asked on the call)', stage: v.step, step: 'App link sent on request' } },
      })
    : null;

  const smsState = smsRes.ok ? 'sent' : 'failed';
  const waState = waRes ? (waRes.ok ? 'sent' : 'failed') : 'not_sent';
  if (!smsRes.ok && !waRes?.ok) {
    await prisma.outboundRequest.deleteMany({ where: { idempotencyKey: key } }).catch(() => undefined);
    log.warn('send failed', { phone, sms: smsRes.error ?? null, whatsapp: waRes ? waRes.error ?? null : (wa.ok ? 'whatsapp not configured' : wa.reason) });
    return { sent: false, status: 'failed', reason: 'send_failed', sms: smsState, whatsapp: waState, known_customer: known, say: SAY.send_failed };
  }
  log.info('link sent', { phone, known, sms: smsState, whatsapp: waState });
  const channels = smsRes.ok && waRes?.ok ? 'by SMS and WhatsApp' : smsRes.ok ? 'by SMS' : 'on WhatsApp';
  return {
    sent: true, status: 'sent', sms: smsState, whatsapp: waState, known_customer: known,
    say: `The app link has been sent ${channels} to this number. You may say so, and that it can take a minute to arrive.`,
  };
}
