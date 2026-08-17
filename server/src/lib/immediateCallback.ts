/**
 * WS5e — the "Yes, call me now" opt-in, with retries.
 *
 * Runs on the same 1-minute cadence as leadCaller.ts's passive follow-up (see
 * tracking.jobs.ts) — there is no separate slower cron for this path anymore.
 * FIRST_ATTEMPT_DELAY_SECONDS defaults to 20, so a fresh "yes" is picked up on
 * the very next tick (the cron's own 1-minute cadence is the real floor on
 * how "on the spot" this can be — the seconds value just avoids padding that
 * with an extra artificial wait on top).
 *
 * Every "yes" click is its own request: website.routes.ts resets the cycle on
 * each one (unless a call is literally ringing right now), so clicking "yes"
 * N times queues N calls, not just the first. Only a genuine no-answer enters
 * the retry ladder below — the visitor asking again is never throttled by it.
 *
 * State machine lives on Customer.callbackStatus:
 *   requested   -> waiting for callbackNextAttemptAt (set by website.routes.ts
 *                  on "yes", or by this job/webhooks.routes.ts after a failed
 *                  attempt that still has retries left)
 *   in_progress -> a CallAttempt has been dialled; waiting for that call's
 *                  webhook to report whether it actually connected
 *   connected   -> answered — done, terminal
 *   not_answered -> exhausted every attempt without connecting — done, terminal
 *
 * The outcome of any one attempt isn't known synchronously: placeCall() only
 * tells us the provider accepted the dial, not whether the person picked up.
 * That answer arrives later via POST /api/webhooks/ello/call-outcome, which
 * calls recordImmediateCallbackAttemptOutcome() below once the call reaches a
 * terminal status. This job only handles the synchronous failure case (the
 * dial never even reached the provider) the same way.
 */
import { prisma } from './prisma.js';
import { placeCall } from './dialer.js';
import { withinCallingHours } from './leadCaller.js';
import { hourlyCallBudget } from './callThrottle.js';
import { buildLeadCallContext, compactContext } from './callContext.js';
import { agentIdFor } from './agents.js';

const ENABLED = (process.env.IMMEDIATE_CALLBACK_ENABLED ?? 'true') !== 'false';
const MAX_PER_TICK = 25;
/** Shares the same global spend ceiling as leadCaller.ts — both jobs dial
 *  through the same telephony account, so they must consult one number. */
const MAX_CALLS_PER_HOUR = Number(process.env.LEAD_CALL_MAX_PER_HOUR ?? 60) || 60;

/** How long after "yes" the first attempt fires — "on the spot", picked up by
 *  this job's own 1-minute tick (see tracking.jobs.ts). */
export const FIRST_ATTEMPT_DELAY_SECONDS = Number(process.env.IMMEDIATE_CALLBACK_DELAY_SECONDS ?? 20) || 20;
/** Wait between retries when an attempt doesn't connect. */
export const RETRY_INTERVAL_MINUTES = Number(process.env.IMMEDIATE_CALLBACK_RETRY_MINUTES ?? 60) || 60;
/** Total attempts (the first try + this many retries) before giving up. */
export const MAX_ATTEMPTS = Number(process.env.IMMEDIATE_CALLBACK_MAX_ATTEMPTS ?? 3) || 3;
/** A call stuck "in_progress" this long never got a webhook — resolve it as a
 *  failed attempt so it can't block the cycle forever. Comfortably longer than
 *  any real call, short enough not to delay a legitimate retry by much. */
const STUCK_IN_PROGRESS_MINUTES = 40;

/**
 * Resolve one attempt's outcome against the retry policy. Called from the
 * webhook (the normal path, once a call's real outcome is known) and from
 * this job (when a dial fails before the provider even rings, or when an
 * attempt has been "in_progress" far longer than any real call could take).
 *
 * A no-op for any customer not actually awaiting this decision — safe to call
 * unconditionally without the caller re-checking `callbackStatus` first.
 */
export async function recordImmediateCallbackAttemptOutcome(customerId: string, connected: boolean): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.callbackStatus !== 'in_progress') return;

  if (connected) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { callbackStatus: 'connected', callbackNextAttemptAt: null },
    });
    return;
  }

  if (customer.callbackAttempts >= MAX_ATTEMPTS) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { callbackStatus: 'not_answered', callbackNextAttemptAt: null },
    });
  } else {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        callbackStatus: 'requested',
        callbackNextAttemptAt: new Date(Date.now() + RETRY_INTERVAL_MINUTES * 60_000),
      },
    });
  }
}

export async function immediateCallback(now: Date = new Date()): Promise<number> {
  if (!ENABLED) return 0;

  // Safety net: a call whose webhook never arrived (dropped post, provider
  // outage) must not leave its customer stuck in_progress forever — that
  // would silently stop their retries with nothing to show for it.
  const stuckSince = new Date(now.getTime() - STUCK_IN_PROGRESS_MINUTES * 60_000);
  const stuck = await prisma.customer.findMany({
    where: { callbackStatus: 'in_progress', callbackLastAttemptAt: { lt: stuckSince } },
    select: { id: true },
    take: 100,
  });
  for (const c of stuck) await recordImmediateCallbackAttemptOutcome(c.id, false).catch(() => undefined);

  if (!withinCallingHours(now)) return 0;

  const budget = await hourlyCallBudget(MAX_CALLS_PER_HOUR, now);
  if (budget <= 0) {
    console.error(`[immediate-callback] HOURLY CAP HIT (shared with lead-autocaller, limit ${MAX_CALLS_PER_HOUR}). Holding.`);
    return 0;
  }

  const leads = await prisma.customer.findMany({
    where: {
      phoneVerified: true,
      callbackStatus: 'requested',
      callbackNextAttemptAt: { lte: now },
      phone: { not: null },
    },
    orderBy: { callbackNextAttemptAt: 'asc' },
    take: Math.min(MAX_PER_TICK, budget),
  });

  console.log(`[immediate-callback] tick: ${leads.length} due; phones=${JSON.stringify(leads.map((l) => l.phone))}`);

  // No phone-cooldown check here (unlike leadCaller.ts's passive job): every
  // row in `leads` is either a brand-new "yes" or a retry this job itself
  // scheduled, so it's already an explicit, deliberate ask to be called —
  // not something a generic anti-spam cooldown should be second-guessing.
  let placed = 0;
  for (const lead of leads) {
    const attemptNumber = lead.callbackAttempts + 1;
    await prisma.customer.update({
      where: { id: lead.id },
      data: { callbackStatus: 'in_progress', callbackAttempts: attemptNumber, callbackLastAttemptAt: now },
    });

    try {
      const context = compactContext(
        await buildLeadCallContext(lead, { purpose: 'immediate_callback_optin', now }),
      );

      const result = await placeCall({
        customerId: lead.id,
        phone: lead.phone!,
        // Same agent/script as the passive follow-up — this is still "continue
        // the website conversation", just faster and explicitly requested.
        assistantId: await agentIdFor('leadCallback'),
        metadata: {
          ...context,
          name: lead.name ?? undefined,
          reason: 'immediate_callback_optin',
          attempt: attemptNumber,
        },
      });

      if (result.ok) {
        placed++;
        console.log(`[immediate-callback] ${lead.phone}: DIALLED (attempt ${attemptNumber}/${MAX_ATTEMPTS}) — status=${result.attempt?.status}; awaiting outcome`);
      } else {
        // Never reached the provider at all — no webhook will ever arrive for
        // this attempt, so resolve it the same way a no-answer would be.
        console.warn(`[immediate-callback] ${lead.phone}: FAILED to dial (attempt ${attemptNumber}/${MAX_ATTEMPTS}) — ${result.error}`);
        await recordImmediateCallbackAttemptOutcome(lead.id, false);
      }
    } catch (e) {
      console.error('[immediate-callback] failed for', lead.id, e);
      await recordImmediateCallbackAttemptOutcome(lead.id, false).catch(() => undefined);
    }
  }

  if (placed) console.log(`[immediate-callback] dialled ${placed} opt-in callback(s)`);
  return placed;
}
