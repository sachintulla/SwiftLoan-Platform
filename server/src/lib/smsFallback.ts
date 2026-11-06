/**
 * The SMS that goes with every drop-off WhatsApp step (owner, 2026-11-04: "send both WhatsApp and SMS with a gap between them"). For every
 * WhatsApp step of a drop-off run (the scenario timelines in appDropoff.ts), the same step goes once by SMS `dropoff.smsFallbackMinutes` (10)
 * after it, with one of the two registered texts (smsRoute.ts): an app user stopped before PAN gets "verify your PAN", everyone else the link
 * text naming the step. Admin can narrow it to Sachin's original rule (only when the WhatsApp was not delivered) with `dropoff.smsOnlyIfUndelivered`.
 *
 * Independent of the WhatsApp (owner, 2026-11-06: "WhatsApp, SMS, call: everything should be independent"): the SMS follows the WhatsApp STEP
 * in the run's history whether that WhatsApp was sent, failed, or skipped (template not set, Meta refused, WhatsApp not configured). Before,
 * it was driven by the WhatsApps that went out, so a person whose WhatsApp never left got no SMS either. A step held back for a reason that
 * applies to every channel (the test-number list, a contact limit) gets no SMS either, and log-only mode (`logged`) sends nothing.
 *
 * It is the same touch as the WhatsApp, so contactPolicy.ts does not count it (kind `sms_fallback`). Gates: `dropoff.sendEnabled`, switch
 * `dropoff.smsFallbackEnabled` (on), the test-number list, review phone, do-not-contact, calling hours (it waits for them, up to 24 h after
 * the step), and the run still active (they have not moved on or come back). Claimed once per step (`smsfb:<run id>:<step>`; a step whose
 * WhatsApp already got an SMS under the old per-message key `smsfb:<message id>` is not sent again).
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

/** One WhatsApp step from a run's history. */
export interface WhatsappStepEntry { step: number; channel?: string; at?: string; outcome?: string; reason?: string }

/** A step held back for a reason that applies to every channel gets no SMS either. */
const BLOCKS_EVERY_CHANNEL = /test-number list|limit|do.not.contact/i;

/**
 * The WhatsApp steps of a run's history that are due an SMS now: handled between 24 h and `waitMs` ago, really attempted or skipped for a
 * WhatsApp-only reason (never `logged`, i.e. log-only mode). Pure, so it is unit-tested.
 */
export function whatsappStepsDueSms(history: unknown, now: Date, waitMs: number): WhatsappStepEntry[] {
  const list = Array.isArray(history) ? (history as WhatsappStepEntry[]) : [];
  const newest = now.getTime() - waitMs;
  const oldest = now.getTime() - 86_400_000;
  return list.filter((h) => {
    if (!h || h.channel !== 'whatsapp' || typeof h.step !== 'number') return false;
    const at = Date.parse(String(h.at ?? ''));
    if (!Number.isFinite(at) || at > newest || at < oldest) return false;
    if (h.outcome === 'sent' || h.outcome === 'failed') return true;
    return h.outcome === 'skipped' && !BLOCKS_EVERY_CHANNEL.test(String(h.reason ?? ''));
  });
}

export async function sendSmsFallbacks(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  const out = { sent: 0, skipped: 0 };
  if (!timing.bool('dropoff.sendEnabled') || !timing.bool('dropoff.smsFallbackEnabled')) return out;
  if (!withinCallingHours(now)) return out;
  const wait = timing.minutesMs('dropoff.smsFallbackMinutes');
  const onlyIfUndelivered = timing.bool('dropoff.smsOnlyIfUndelivered');
  // Active runs touched in the last day: a step's history entry is written when it is handled, which also bumps updatedAt.
  const runs = await prisma.appDropoff.findMany({
    where: { status: 'active', updatedAt: { gte: new Date(now.getTime() - 86_400_000) } },
    orderBy: { updatedAt: 'desc' },
    take: 2000,
  });
  const cfg = await getProviderConfig('voxvalley');
  const messages = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, cfg.settings.dropoffMessages);
  const labels = { ...DROPOFF_STEP_LABELS, ...((cfg.settings.dropoffStepLabels as Partial<Record<DropoffStatus, string>> | undefined) ?? {}) };
  for (const run of runs) {
    for (const h of whatsappStepsDueSms(run.history, now, wait)) {
      const key = `smsfb:${run.id}:${h.step}`;
      if (await prisma.outboundRequest.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) continue;
      // The WhatsApp this step sent, if any: its delivery status (for "only if undelivered") and the SMS it may already have had (old key).
      const wa = h.outcome === 'sent'
        ? await prisma.messageDelivery.findFirst({ where: { channel: 'whatsapp', referenceId: `${run.id}:${h.step}` }, select: { id: true, status: true } })
        : null;
      if (wa && (await prisma.outboundRequest.findUnique({ where: { idempotencyKey: `smsfb:${wa.id}` }, select: { id: true } }))) continue;
      if (!needsSmsFallback(wa?.status ?? null, onlyIfUndelivered)) continue;
      if (isReviewPhone(run.phone) || notOnTestList(run.phone)) { out.skipped++; continue; }
      const customer = await prisma.customer.findUnique({ where: { phone: run.phone }, select: { id: true, currentStage: true } });
      if (customer?.currentStage === 'lost') { out.skipped++; continue; }

      const status = run.dropStatus as DropoffStatus;
      const kind = messageKindFor(status) ?? 'continue';
      const withLink = includeAppLink(kind, await alreadyInApp(run.phone));
      const ref = status === 'otp_verified' && !withLink ? PAN_PENDING_SMS : pickSms(messages, kind, withLink);
      if (!ref?.templateId || !ref.body) { out.skipped++; continue; } // e.g. "no offers": no registered SMS text yet
      const link = withLink && run.token ? buildInstallLink(downloads.publicBase, run.token) : `${downloads.publicBase}/dl`;
      const text = renderSmsBody(ref.body, { name: run.firstName, step: labels[status] ?? DROPOFF_STEP_LABELS.application_filled, link });

      try {
        await prisma.outboundRequest.create({ data: { customerId: customer?.id ?? run.customerId ?? null, channel: 'sms', kind: SMS_FALLBACK_KIND, idempotencyKey: key, status: 'sent', payload: { runId: run.id, step: h.step, whatsapp: h.outcome ?? null, messageId: wa?.id ?? null } } });
      } catch { continue; }
      const res = await sendRegisteredSms({ phone: run.phone, templateId: ref.templateId, text, track: { kind: SMS_FALLBACK_KIND, customerId: customer?.id ?? null } });
      if (!res.ok) {
        await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: (res.error ?? 'sms failed').slice(0, 200) } }).catch(() => undefined);
        log.warn('failed', { runId: run.id, error: res.error });
        out.skipped++;
        continue;
      }
      out.sent++;
    }
  }
  if (out.sent) log.info('tick', out);
  return out;
}
