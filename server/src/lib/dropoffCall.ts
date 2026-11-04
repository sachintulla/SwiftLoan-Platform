/**
 * A CALL step in a drop-off stage timeline (Configs → Stage outreach → a stage's own timeline, e.g. "day 1 at 11:00 call"): the same Ello
 * `leadCallback` agent and briefing as the daily follow-up call (inactiveCall.ts), placed by the drop-off job (appDropoff.ts) when the row
 * is due. Guard rails, as every other dialler: the master switch + call test list (`isCallAllowed`), the review phone, the 24 h per-phone
 * cooldown. Calling hours and "they came back / moved on" are handled by the drop-off job before it gets here. The OutboundRequest
 * (kind `dropoff_call`, one per run and step) is claimed BEFORE dialling and a failed dial is not retried.
 */
import type { AppDropoff } from '@prisma/client';
import { prisma } from './prisma.js';
import { placeCall } from './dialer.js';
import { phoneCooldownHours } from './leadCaller.js';
import { isPhoneInCooldown } from './callThrottle.js';
import { buildLeadCallContext, compactContext } from './callContext.js';
import { agentIdFor } from './agents.js';
import { isCallAllowed } from './callGate.js';
import { isReviewPhone } from './reviewLogin.js';
import { JOURNEY_EVENTS, recordJourneyEvent } from './journey.js';
import { inactiveBrief } from './inactiveCallRules.js';
import { DROPOFF_STEP_LABELS, type DropoffStatus } from './dropoffSteps.js';

export const DROPOFF_CALL_KIND = 'dropoff_call';

export interface CallResult { outcome: 'sent' | 'failed' | 'skipped'; reason?: string }

/** Whole India days between when they stopped and now (0 = the same day), for the agent's "you stopped yesterday" line. */
function daysSince(startAt: Date, now: Date): number {
  const ist = (d: Date) => Math.floor((d.getTime() + 330 * 60_000) / 86_400_000);
  return Math.max(0, ist(now) - ist(startAt));
}

export async function placeDropoffCall(r: AppDropoff, stepIndex: number, now: Date = new Date()): Promise<CallResult> {
  if (!isCallAllowed(r.phone) || isReviewPhone(r.phone)) return { outcome: 'skipped', reason: 'calls off or not on the call test list' };
  if (await isPhoneInCooldown(r.phone, phoneCooldownHours(), now)) return { outcome: 'skipped', reason: 'called in the last 24 h' };
  const customer = r.customerId ? await prisma.customer.findUnique({ where: { id: r.customerId } }) : await prisma.customer.findUnique({ where: { phone: r.phone } });
  if (!customer) return { outcome: 'skipped', reason: 'no customer record' };

  const key = `dropoffcall:${r.id}:${stepIndex}`;
  try {
    await prisma.outboundRequest.create({
      data: { customerId: customer.id, channel: 'voice', kind: DROPOFF_CALL_KIND, idempotencyKey: key, status: 'sent', payload: { status: r.dropStatus, step: stepIndex, runId: r.id } },
    });
  } catch {
    return { outcome: 'skipped', reason: 'already claimed' };
  }

  const status = r.dropStatus as Exclude<DropoffStatus, 'finished' | 'failed'>;
  const day = daysSince(r.startAt, now);
  const brief = inactiveBrief(status, day, DROPOFF_STEP_LABELS[status]);
  const context = compactContext(await buildLeadCallContext(customer, {
    purpose: 'inactive_followup', now,
    stall: { reason: brief.reason, lastStep: brief.lastStep, expectedStep: brief.expectedStep, minutes: Math.round((now.getTime() - r.startAt.getTime()) / 60_000), channel: 'the app or website', help: brief.help },
  }));
  const result = await placeCall({
    customerId: customer.id, phone: customer.phone, assistantId: await agentIdFor('leadCallback'),
    metadata: { ...context, reason: 'inactive_followup', days_inactive: String(day) },
  });
  if (!result.ok) {
    await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: result.error ?? null } }).catch(() => undefined);
    return { outcome: 'failed', reason: (result.error ?? 'call failed').slice(0, 200) };
  }
  // missedCallNote.ts reads the attempt to send "sorry we missed you" if nobody answers.
  await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { payload: { status: r.dropStatus, step: stepIndex, runId: r.id, callAttemptId: result.attempt.id } } }).catch(() => undefined);
  await recordJourneyEvent(customer.id, {
    channel: 'system', name: JOURNEY_EVENTS.NUDGE_SENT,
    metadata: { via: 'voice_call', reason: 'inactive_followup', timeline: true, dayAfterStop: day, callAttemptId: result.attempt.id },
    mirrorTelemetry: false,
  }).catch(() => undefined);
  return { outcome: 'sent' };
}
