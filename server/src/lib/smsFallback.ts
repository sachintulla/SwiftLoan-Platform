/**
 * The SMS that follows every drop-off WhatsApp (owner, 2026-11-04: "send both WhatsApp and SMS with a gap between them"). For every drop-off
 * WhatsApp (the scenario timelines in appDropoff.ts), the same step goes once by SMS `dropoff.smsFallbackMinutes` (10) after it, with one
 * of the two registered texts (smsRoute.ts): an app user stopped before PAN gets "verify your PAN", everyone else the link text naming the
 * step. Admin can narrow it to Sachin's original rule (only when the WhatsApp was not delivered) with `dropoff.smsOnlyIfUndelivered`.
 *
 * It is the same touch as the WhatsApp, so contactPolicy.ts does not count it (kind `sms_fallback`). Gates: `dropoff.sendEnabled`, switch
 * `dropoff.smsFallbackEnabled` (on), the test-number list, review phone, do-not-contact, calling hours (it waits for them, up to 24 h after
 * the WhatsApp), and the run still active (they have not moved on or come back). Claimed once per WhatsApp (`smsfb:<message id>`).
 */
import type { DropoffStatus } from './dropoffSteps.js';
import { prisma } from './prisma.js';
import { timing } from './timings.js';
import { downloads } from '../config/downloads.js';
import { getProviderConfig } from './integrations.js';
import { isReviewPhone } from './reviewLogin.js';
import { withinCallingHours } from './leadCaller.js';
import { buildInstallLink, renderSmsBody } from './reminderSchedule.js';
import { alreadyInApp, notOnTestList } from './installReminder.js';
import { DEFAULT_DROPOFF_MESSAGES, DROPOFF_STEP_LABELS, includeAppLink, mergeDropoffMessages, messageKindFor, pickSms } from './dropoffSteps.js';
import { PAN_PENDING_SMS, sendRegisteredSms } from './smsRoute.js';
import { scoped } from './log.js';

const log = scoped('sms-fallback');
export const SMS_FALLBACK_KIND = 'sms_fallback';

/** Always, unless Admin narrowed it to "only when not delivered": then a delivered or read WhatsApp gets no SMS. */
export function needsSmsFallback(status: string | null | undefined, onlyIfUndelivered = false): boolean {
  return !onlyIfUndelivered || (status !== 'delivered' && status !== 'read');
}

export async function sendSmsFallbacks(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  const out = { sent: 0, skipped: 0 };
  if (!timing.bool('dropoff.sendEnabled') || !timing.bool('dropoff.smsFallbackEnabled')) return out;
  if (!withinCallingHours(now)) return out;
  const wait = timing.minutesMs('dropoff.smsFallbackMinutes');
  const onlyIfUndelivered = timing.bool('dropoff.smsOnlyIfUndelivered');
  const whatsapps = await prisma.messageDelivery.findMany({
    where: { channel: 'whatsapp', kind: 'app_dropoff', createdAt: { lte: new Date(now.getTime() - wait), gte: new Date(now.getTime() - 86_400_000) } },
    select: { id: true, status: true, referenceId: true, phone: true },
    take: 500,
  });
  const cfg = await getProviderConfig('voxvalley');
  const messages = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, cfg.settings.dropoffMessages);
  const labels = { ...DROPOFF_STEP_LABELS, ...((cfg.settings.dropoffStepLabels as Partial<Record<DropoffStatus, string>> | undefined) ?? {}) };
  for (const w of whatsapps) {
    if (!needsSmsFallback(w.status, onlyIfUndelivered)) continue;
    const runId = (w.referenceId ?? '').split(':')[0]; // drop-off WhatsApps carry referenceId `<run id>:<step>`
    if (!runId || (w.referenceId ?? '').startsWith('agentlink:')) continue;
    const key = `smsfb:${w.id}`;
    if (await prisma.outboundRequest.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) continue;
    const run = await prisma.appDropoff.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'active') { out.skipped++; continue; } // they moved on or came back since the WhatsApp: no SMS
    if (isReviewPhone(run.phone) || notOnTestList(run.phone)) { out.skipped++; continue; }
    const customer = await prisma.customer.findUnique({ where: { phone: run.phone }, select: { id: true, currentStage: true } });
    if (customer?.currentStage === 'lost') { out.skipped++; continue; }

    const status = run.dropStatus as DropoffStatus;
    const kind = messageKindFor(status) ?? 'continue';
    const withLink = includeAppLink(kind, await alreadyInApp(run.phone));
    const ref = status === 'otp_verified' && !withLink ? PAN_PENDING_SMS : pickSms(messages, kind, withLink);
    if (!ref?.templateId || !ref.body) { out.skipped++; continue; }
    const link = withLink && run.token ? buildInstallLink(downloads.publicBase, run.token) : `${downloads.publicBase}/dl`;
    const text = renderSmsBody(ref.body, { name: run.firstName, step: labels[status] ?? DROPOFF_STEP_LABELS.application_filled, link });

    try {
      await prisma.outboundRequest.create({ data: { customerId: customer?.id ?? run.customerId ?? null, channel: 'sms', kind: SMS_FALLBACK_KIND, idempotencyKey: key, status: 'sent', payload: { messageId: w.id, runId } } });
    } catch { continue; }
    const res = await sendRegisteredSms({ phone: run.phone, templateId: ref.templateId, text, track: { kind: SMS_FALLBACK_KIND, customerId: customer?.id ?? null } });
    if (!res.ok) {
      await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: (res.error ?? 'sms failed').slice(0, 200) } }).catch(() => undefined);
      log.warn('failed', { runId, error: res.error });
      out.skipped++;
      continue;
    }
    out.sent++;
  }
  if (out.sent) log.info('tick', out);
  return out;
}
