/**
 * "No offers" follow-up call: when the offers lookup finds nothing for someone, the Ello agent rings them once.
 * Plan: docs/APP_DROPOFF_PLAN.md. Pure rules (tested): dropoffSteps.ts noOffersCallDue / noOffersCallBrief.
 *
 * Reuses everything the existing drop-off and status calls use, nothing new to configure:
 *   - the same Ello agent role (`leadCallback`, whose prompt already has a drop-off branch) and the same dialler (`placeCall`)
 *   - the master call switch `calls.nudgeEnabled` and the call test-number list `calls.allowedNumbers` (callGate.ts)
 *   - calling hours, do-not-contact, and the quiet gap after a message (`calls.quietAfterMessageMinutes`)
 *
 * When it rings (owner, 6 Nov 2026: every no-offers person is called, at once, however many there are): straight from the offers
 * lookup (`callNoOffersNow`, appDropoff.ts), and from the drop-off tick as a safety net (a result outside calling hours, a crash
 * before the call). No per-pass cap. Guard rails: its OWN switch `dropoff.noOffersCallEnabled` (off: the job only records that it
 * would call), ONE call per no-offers run (`limits.noOffersCallsPerPerson`, 0 = no lifetime limit), the call is claimed in the
 * database BEFORE dialling so a crash cannot double-ring, and a failed attempt is recorded and not retried.
 */
import type { AppDropoff } from '@prisma/client';
import { prisma } from './prisma.js';
import { placeCall } from './dialer.js';
import { withinCallingHours } from './leadCaller.js';
import { buildLeadCallContext, compactContext } from './callContext.js';
import { agentIdFor } from './agents.js';
import { isCallAllowed } from './callGate.js';
import { JOURNEY_EVENTS, recordJourneyEvent } from './journey.js';
import { alreadyInApp } from './installReminder.js';
import { scoped } from './log.js';
import { timing } from './timings.js';
import { noOffersCallBrief, noOffersCallDue } from './dropoffSteps.js';

const log = scoped('no-offers-call');

export const noOffersCallEnabled = () => timing.bool('dropoff.noOffersCallEnabled');
/** OutboundRequest kind of the call; its payload carries `dropoffId` and, once placed, `callAttemptId` (missedCallNote.ts reads both). */
export const NO_OFFERS_CALL_KIND = 'no_offers_call';

export interface NoOffersCallResult { placed: number; logged: number; skipped: number }

function historyOf(r: Pick<AppDropoff, 'history'>): Array<Record<string, unknown>> {
  return Array.isArray(r.history) ? (r.history as Array<Record<string, unknown>>) : [];
}

/** Add a voice entry to the run's history, next to its message entries. */
async function note(r: AppDropoff, entry: { outcome: 'logged' | 'sent' | 'failed'; reason?: string }, now: Date): Promise<void> {
  await prisma.appDropoff.update({
    where: { id: r.id },
    data: {
      history: [...historyOf(r), { step: -1, channel: 'voice', label: 'no-offers call', at: now.toISOString(), message: 'no_offers', withLink: false, ...entry }] as unknown as object,
    },
  });
}

/** Call (or log) for one "no offers" run. `delayMs` 0 = ring now (the lookup itself calls it that way). */
export async function callNoOffersRun(
  r: AppDropoff,
  now: Date,
  out: NoOffersCallResult,
  delayMs: number = timing.minutesMs('dropoff.noOffersCallDelayMinutes'),
): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { phone: r.phone } });
  const key = `noffers:${r.id}`;
  const [claimed, earlier] = await Promise.all([
    prisma.outboundRequest.findUnique({ where: { idempotencyKey: key }, select: { id: true } }),
    customer ? prisma.outboundRequest.count({ where: { customerId: customer.id, kind: NO_OFFERS_CALL_KIND } }) : Promise.resolve(0),
  ]);
  // A "would call" entry (log-only mode) must NOT count as a call: only a real attempt (sent or failed) does, or switching the
  // feature on later would never ring the people who were logged while it was off.
  const voice = historyOf(r).filter((h) => h.channel === 'voice');
  const hasLogged = voice.some((h) => h.outcome === 'logged');
  const hasAttempt = voice.some((h) => h.outcome === 'sent' || h.outcome === 'failed');

  const verdict = noOffersCallDue({
    dropStatus: r.dropStatus,
    runStatus: r.status,
    startAt: r.startAt,
    lastSentAt: r.lastSentAt,
    now,
    delayMs,
    // A critical moment (Sachin's review): not held back by the quiet gap after a message. Calling hours, do-not-contact and
    // once-per-person still apply.
    quietAfterMessageMs: 0,
    inCallingHours: withinCallingHours(now),
    // One call per run. Admin → Timings limits.noOffersCallsPerPerson can add a lifetime cap (0, the default = none).
    alreadyCalled: !!claimed || hasAttempt || (timing.num('limits.noOffersCallsPerPerson') > 0 && earlier >= timing.num('limits.noOffersCallsPerPerson')),
    doNotContact: customer?.currentStage === 'lost',
    callAllowed: isCallAllowed(r.phone),
  });
  if (!verdict.due || !customer) {
    out.skipped++;
    return;
  }

  // Off (the default): record once that it WOULD call, and do nothing else. Same idea as the message sequence's log-only mode.
  if (!noOffersCallEnabled()) {
    if (hasLogged) { out.skipped++; return; } // already recorded once; do not repeat it every minute
    await note(r, { outcome: 'logged' }, now);
    out.logged++;
    log.info('would call (log-only)', { id: r.id });
    return;
  }

  // Claim BEFORE dialling: a crash between the dial and the write must never lead to a second call.
  try {
    await prisma.outboundRequest.create({
      data: { customerId: customer.id, channel: 'voice', kind: NO_OFFERS_CALL_KIND, idempotencyKey: key, status: 'sent', payload: { dropoffId: r.id, reason: r.reason ?? null } },
    });
  } catch {
    out.skipped++; // another worker claimed it first
    return;
  }

  const brief = noOffersCallBrief(r.reason, await alreadyInApp(r.phone));
  const minutes = Math.round((now.getTime() - r.startAt.getTime()) / 60_000);
  const context = compactContext(
    await buildLeadCallContext(customer, {
      purpose: 'no_offers_followup',
      now,
      stall: { reason: brief.reason, lastStep: brief.lastStep, expectedStep: brief.expectedStep, minutes, channel: brief.channel, help: brief.help },
    }),
  );

  const result = await placeCall({
    customerId: customer.id,
    phone: r.phone,
    assistantId: await agentIdFor('leadCallback'),
    metadata: { ...context, reason: 'no_offers_followup', no_offers_reason: brief.noOffersReason },
  });

  if (!result.ok) {
    // Keep the claim: a provider error must not turn into a retry storm against a customer's phone.
    await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: result.error ?? null } }).catch(() => undefined);
    await note(r, { outcome: 'failed', reason: (result.error ?? 'call failed').slice(0, 200) }, now);
    log.warn('call failed', { id: r.id, error: result.error });
    out.skipped++;
    return;
  }

  await note(r, { outcome: 'sent' }, now);
  // So an unanswered call can be followed by the "we tried to call you" WhatsApp (missedCallNote.ts).
  await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { payload: { dropoffId: r.id, reason: r.reason ?? null, callAttemptId: result.attempt.id } } }).catch(() => undefined);
  await recordJourneyEvent(customer.id, {
    channel: 'system',
    name: JOURNEY_EVENTS.NUDGE_SENT,
    metadata: { via: 'voice_call', reason: 'no_offers_followup', noOffersReason: brief.noOffersReason, callAttemptId: result.attempt.id },
    mirrorTelemetry: false,
  }).catch(() => undefined);
  log.info('called', { id: r.id, reason: brief.noOffersReason });
  out.placed++;
}

/** One pass over the "no offers" runs that still need a call: every one of them, no cap. Safe to run every minute and from several workers. */
export async function placeNoOffersCalls(now: Date = new Date()): Promise<NoOffersCallResult> {
  const out: NoOffersCallResult = { placed: 0, logged: 0, skipped: 0 };
  const waitedEnough = new Date(now.getTime() - timing.minutesMs('dropoff.noOffersCallDelayMinutes'));
  // Newest first, and only runs not called yet. A run stays active for a week of daily messages after its call, so a capped pass
  // over the oldest rows used to fill up with people already called and never reach anyone new (5 Nov 2026: 25 of 28).
  const candidates = await prisma.appDropoff.findMany({
    where: { dropStatus: 'rejected', status: 'active', startAt: { lte: waitedEnough } },
    orderBy: { startAt: 'desc' },
  });
  const claimed = new Set(
    (await prisma.outboundRequest.findMany({
      where: { idempotencyKey: { in: candidates.map((r) => `noffers:${r.id}`) } },
      select: { idempotencyKey: true },
    })).map((c) => c.idempotencyKey),
  );
  const rows = candidates.filter((r) => !claimed.has(`noffers:${r.id}`));
  for (const r of rows) {
    try {
      await callNoOffersRun(r, now, out);
    } catch (e) {
      log.error('no-offers call failed for one person', { id: r.id, error: (e as Error).message }); // one bad row never aborts the pass
    }
  }
  return out;
}
