/**
 * Stuck-stage SMS nudges through the Vox SMS gateway.
 *
 * A stall rule with channel `sms` texts the customer when they have not moved on
 * for the rule's delay (30 minutes by default). India SMS is DLT-regulated, so
 * the text is NOT composed here: it is the registered template in
 * `settings.smsBody` / `smsTemplateId` (optionally overridden per stage in
 * `settings.smsTemplates[triggerEvent]`).
 *
 * Same guard rails as the WhatsApp and call nudges, because a repeated text to a
 * real customer is a complaint, not a dismissed notification:
 *   - never to a do-not-contact customer, only inside the calling window
 *   - one SMS per customer per cooldown across ALL rules, plus a lifetime cap
 *   - only stalls from the last STALL_SMS_MAX_AGE_HOURS, so enabling a rule never
 *     texts the historical backlog
 *   - the OutboundRequest row claims the idempotency key BEFORE sending, and a
 *     failure is recorded but not retried (no retry storm to a phone)
 */
import type { StallRule } from '@prisma/client';
import { prisma } from './prisma.js';
import { JOURNEY_EVENTS, recordJourneyEvent } from './journey.js';
import { getProviderConfig } from './integrations.js';
import { withinCallingHours } from './leadCaller.js';
import { sendVoxSms, smsConfigured } from './voxSms.js';
import { hasActiveInstallReminder } from './installReminderGuard.js';

export interface SmsTemplate {
  templateId: string;
  body: string;
}
export type SmsTemplateMap = Record<string, SmsTemplate>;

const COOLDOWN_HOURS = Number(process.env.STALL_SMS_COOLDOWN_HOURS ?? 24) || 24;
const MAX_PER_CUSTOMER = Number(process.env.STALL_SMS_MAX_PER_CUSTOMER ?? 3) || 3;
export const STALL_SMS_MAX_AGE_HOURS = Number(process.env.STALL_SMS_MAX_AGE_HOURS ?? 24) || 24;

/** The text for a stage: a per-stage override if configured, else the default. */
export function smsFor(settings: Record<string, any>, triggerEvent: string): SmsTemplate | null {
  const o = (settings.smsTemplates as SmsTemplateMap | undefined)?.[triggerEvent];
  if (o && String(o.templateId ?? '').trim() && String(o.body ?? '').trim()) {
    return { templateId: String(o.templateId), body: String(o.body) };
  }
  const templateId = String(settings.smsTemplateId ?? '').trim();
  const body = String(settings.smsBody ?? '');
  return templateId && body.trim() ? { templateId, body } : null;
}

export interface DirectSms {
  settings: Record<string, any>;
}

/** The direct-SMS config, or null when the gateway is off / incomplete. */
export async function directSmsConfig(): Promise<DirectSms | null> {
  if (!(await smsConfigured())) return null;
  const cfg = await getProviderConfig('voxvalley');
  return { settings: cfg.settings };
}

/** Text a stalled customer. Returns true only if the gateway accepted it. */
export async function sendStallSms(
  rule: StallRule,
  customer: { id: string; phone: string | null; currentStage: string },
  tpl: SmsTemplate,
  minutesStuck: number,
  idempotencyKey: string,
  now: Date,
): Promise<boolean> {
  if (!customer.phone) return false;
  if (customer.currentStage === 'lost') return false; // asked us to stop: no channel
  if (!withinCallingHours(now)) return false; // leaves them eligible once it opens
  if (await hasActiveInstallReminder(customer.phone)) return false; // the app-link reminders own this person

  const since = new Date(now.getTime() - COOLDOWN_HOURS * 3_600_000);
  const recent = await prisma.outboundRequest.count({
    where: { customerId: customer.id, kind: 'sms_template', status: 'sent', createdAt: { gte: since } },
  });
  if (recent > 0) return false;
  const ever = await prisma.outboundRequest.count({
    where: { customerId: customer.id, kind: 'sms_template', status: 'sent' },
  });
  if (ever >= MAX_PER_CUSTOMER) return false;

  let claimId: string;
  try {
    const claim = await prisma.outboundRequest.create({
      data: {
        customerId: customer.id,
        channel: 'sms',
        kind: 'sms_template',
        idempotencyKey,
        status: 'pending',
        payload: { rule: rule.name, stuckAt: rule.triggerEvent, expected: rule.expectedEvent, minutesStuck, templateId: tpl.templateId },
      },
    });
    claimId = claim.id;
  } catch {
    return false; // another worker claimed it first
  }

  const result = await sendVoxSms({ phone: customer.phone, body: tpl.body, templateId: tpl.templateId, track: { kind: 'stall', customerId: customer.id } });

  await prisma.outboundRequest
    .update({
      where: { id: claimId },
      data: result.ok
        ? { status: 'sent', sentAt: now, attempts: 1, providerRef: result.messageId ?? null, response: (result.body ?? null) as object }
        : { status: 'failed', attempts: 1, lastError: (result.error ?? 'SMS send failed').slice(0, 500), response: (result.body ?? null) as object },
    })
    .catch(() => undefined);

  if (!result.ok) {
    console.warn(`[stall-sms] ${customer.phone}: ${result.error}`);
    return false;
  }

  await recordJourneyEvent(customer.id, {
    channel: 'system',
    name: JOURNEY_EVENTS.NUDGE_SENT,
    metadata: { rule: rule.name, via: 'sms', stuckAt: rule.triggerEvent, expected: rule.expectedEvent, minutesStuck },
    mirrorTelemetry: false,
  }).catch(() => undefined);

  console.log(`[stall-sms] texted ${customer.phone} — ${rule.name} (stuck ${minutesStuck}m)`);
  return true;
}
