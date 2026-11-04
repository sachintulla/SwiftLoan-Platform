/**
 * "Sorry we missed you" (Sachin's review, channel spacing: "Call, not answered → 5 min → WhatsApp with the link, part of the same touch").
 * After a CALL step of a drop-off stage timeline (dropoffCall.ts) ends unanswered, the person gets ONE WhatsApp with their app link, using
 * the same template as the welcome (welcomeMessage.ts `welcomeTemplate`; owner's choice, 2026-11-04). It is part of the call's touch, so it
 * is not counted by contactPolicy.ts and is not blocked by "no call and message on the same day".
 *
 * Run from the end of the drop-off tick (appDropoff.ts), `dropoff.missedNoteMinutes` (5) after the call ended. Gates: the drop-off send
 * switch (`dropoff.sendEnabled`; off = nothing), the test-number list, the review phone, do-not-contact, calling hours (outside them it waits
 * for the next tick inside them, up to 24 h after the call). Claimed once per call attempt (`missednote:<attempt id>`) before sending.
 */
import { prisma } from './prisma.js';
import { timing } from './timings.js';
import { downloads } from '../config/downloads.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { buildPlaceholders } from './stallWhatsapp.js';
import { isReviewPhone } from './reviewLogin.js';
import { withinCallingHours } from './leadCaller.js';
import { buildInstallLink } from './reminderSchedule.js';
import { notOnTestList } from './installReminder.js';
import { welcomeTemplate } from './welcomeMessage.js';
import { DROPOFF_CALL_KIND } from './dropoffCall.js';
import { scoped } from './log.js';

const log = scoped('missed-call-note');
export const MISSED_NOTE_KIND = 'missed_call_note';

/** Not answered: no answer / busy, or a call that "completed" without anyone picking up. A failed dial never rang, so it gets no note. */
export function isMissedCall(a: { status: string | null; answered: boolean }): boolean {
  return a.status === 'no_answer' || a.status === 'busy' || (a.status === 'completed' && !a.answered);
}

export async function sendMissedCallNotes(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  const out = { sent: 0, skipped: 0 };
  if (!timing.bool('dropoff.sendEnabled')) return out;
  if (!withinCallingHours(now)) return out; // wait for the window; calls of the last 24 h are looked at again then
  const waitMs = timing.minutesMs('dropoff.missedNoteMinutes');
  const calls = await prisma.outboundRequest.findMany({
    where: { kind: DROPOFF_CALL_KIND, status: 'sent', createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
    select: { customerId: true, payload: true },
  });
  for (const c of calls) {
    const p = (c.payload ?? {}) as { callAttemptId?: string; runId?: string };
    if (!p.callAttemptId) continue;
    const key = `missednote:${p.callAttemptId}`;
    if (await prisma.outboundRequest.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) continue;
    const attempt = await prisma.callAttempt.findUnique({ where: { id: p.callAttemptId }, select: { status: true, answered: true, endedAt: true, updatedAt: true, phone: true } });
    if (!attempt || !isMissedCall(attempt)) continue;
    if (now.getTime() - (attempt.endedAt ?? attempt.updatedAt).getTime() < waitMs) continue;

    const run = p.runId ? await prisma.appDropoff.findUnique({ where: { id: p.runId }, select: { phone: true, firstName: true, token: true } }) : null;
    const phone = run?.phone ?? attempt.phone;
    const customer = await prisma.customer.findUnique({ where: { phone }, select: { id: true, currentStage: true } });
    if (isReviewPhone(phone) || notOnTestList(phone) || customer?.currentStage === 'lost') { out.skipped++; continue; }
    const t = await welcomeTemplate();
    if (!t.template?.trim() || !(await whatsappConfigured())) { out.skipped++; continue; }
    const link = run?.token ? buildInstallLink(downloads.publicBase, run.token) : `${downloads.publicBase}/dl`;
    const placeholders = buildPlaceholders(t.placeholders, { name: (run?.firstName ?? '').trim() || 'there', link });
    if (!placeholders) { out.skipped++; continue; }

    try {
      await prisma.outboundRequest.create({ data: { customerId: customer?.id ?? c.customerId ?? null, channel: 'whatsapp', kind: MISSED_NOTE_KIND, idempotencyKey: key, status: 'sent', payload: { callAttemptId: p.callAttemptId } } });
    } catch { continue; } // another worker claimed it
    const res = await sendWhatsAppTemplate({
      phone, templateName: t.template, language: t.language, placeholders, category: t.category, referenceId: key,
      ...(t.headerImageUrl?.trim() ? { headerImageUrl: t.headerImageUrl.trim() } : {}),
      track: { kind: MISSED_NOTE_KIND, customerId: customer?.id ?? null, trigger: { by: 'Missed call note', stage: 'After an unanswered call', step: 'Sorry we missed you' } },
    });
    if (!res.ok) {
      await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: (res.error ?? 'whatsapp failed').slice(0, 200) } }).catch(() => undefined);
      log.warn('failed', { attempt: p.callAttemptId, error: res.error });
      out.skipped++;
      continue;
    }
    out.sent++;
  }
  if (out.sent) log.info('tick', out);
  return out;
}
