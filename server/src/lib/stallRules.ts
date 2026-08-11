/**
 * WS5d — step-level stall detection.
 *
 * "The customer entered their phone number but never verified the OTP" happens
 * entirely inside one journey stage, so the stage-level stall check could not
 * see it. These rules work on the event pairs instead: they watch for a step
 * that was NOT followed by the step it should lead to.
 *
 * When a rule matches we fire a named event into Upshot. The push copy itself
 * is authored on the Upshot dashboard — this only reports what happened and to
 * whom, which is what keeps the messaging editable without a deploy.
 */
import type { StallRule } from '@prisma/client';
import { prisma } from './prisma.js';
import { JOURNEY_EVENTS, recordJourneyEvent } from './journey.js';
import { enqueueDispatch } from './dispatch.js';
import { getProviderConfig } from './integrations.js';
import { placeCall } from './dialer.js';
import { withinCallingHours } from './leadCaller.js';
import { buildLeadCallContext, compactContext, stallReasonFor, stallHelpFor } from './callContext.js';
import { agentIdFor } from './agents.js';

/** Scanned per rule per tick — bounds the blast radius of a bad rule. */
const MAX_PER_RULE = 200;

/**
 * Sensible starting rules, seeded on first run. Each mirrors a real drop-off
 * the funnel already exposes; the operator can edit, disable or add to them
 * from the dashboard.
 */
export const DEFAULT_STALL_RULES: Array<Omit<StallRule, 'id' | 'createdAt' | 'updatedAt' | 'lastFiredAt' | 'firedCount'>> = [
  {
    name: 'OTP requested but not verified',
    triggerEvent: JOURNEY_EVENTS.OTP_REQUESTED,
    expectedEvent: JOURNEY_EVENTS.OTP_VERIFIED,
    delayMinutes: 15,
    upshotEvent: 'swiftloan_otp_not_verified',
    channel: 'push',
    cooldownMinutes: 1440,
    enabled: true,
  },
  {
    name: 'App installed but never registered',
    triggerEvent: JOURNEY_EVENTS.APP_INSTALLED,
    expectedEvent: JOURNEY_EVENTS.OTP_VERIFIED,
    delayMinutes: 30,
    upshotEvent: 'swiftloan_install_not_registered',
    channel: 'push',
    cooldownMinutes: 1440,
    enabled: true,
  },
  {
    name: 'Registered but eligibility not checked',
    triggerEvent: JOURNEY_EVENTS.OTP_VERIFIED,
    expectedEvent: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED,
    delayMinutes: 15,
    upshotEvent: 'swiftloan_eligibility_incomplete',
    channel: 'push',
    cooldownMinutes: 1440,
    enabled: true,
  },
  {
    name: 'Offers viewed but none selected',
    triggerEvent: JOURNEY_EVENTS.OFFER_VIEWED,
    expectedEvent: JOURNEY_EVENTS.OFFER_SELECTED,
    delayMinutes: 20,
    upshotEvent: 'swiftloan_offer_not_selected',
    channel: 'push',
    cooldownMinutes: 1440,
    enabled: true,
  },
  {
    name: 'KYC started but not completed',
    triggerEvent: JOURNEY_EVENTS.KYC_STARTED,
    expectedEvent: JOURNEY_EVENTS.KYC_COMPLETED,
    delayMinutes: 15,
    upshotEvent: 'swiftloan_kyc_incomplete',
    channel: 'push',
    cooldownMinutes: 1440,
    enabled: true,
  },
  {
    name: 'Website lead never installed the app',
    triggerEvent: JOURNEY_EVENTS.LEAD_CAPTURED,
    expectedEvent: JOURNEY_EVENTS.APP_INSTALLED,
    delayMinutes: 60,
    upshotEvent: 'swiftloan_lead_no_install',
    channel: 'whatsapp',
    cooldownMinutes: 1440,
    enabled: true,
  },

  // ── channel 'voice' = call them, with the exact drop-off in the prompt ──────
  //
  // Seeded DISABLED on purpose. These place real phone calls to real customers,
  // and switching that on is a business decision about how a lender wants to
  // treat people — not something a database seed should make. Enable per rule
  // from the dashboard once the wording has been heard on a test call.
  //
  // Only two, both mid-funnel: at these points the customer has demonstrably
  // tried and been blocked, so a call is genuinely helpful rather than pushy.
  // Earlier steps (opened the app, chose a language) are far too weak a signal to
  // justify ringing someone about a loan.
  {
    name: 'CALL — entered phone but never verified OTP',
    triggerEvent: JOURNEY_EVENTS.OTP_REQUESTED,
    expectedEvent: JOURNEY_EVENTS.OTP_VERIFIED,
    delayMinutes: 20,
    // Unused on a voice rule, but the column is required; kept meaningful so the
    // rule still works if an operator switches it back to push.
    upshotEvent: 'swiftloan_otp_not_verified_call',
    channel: 'voice',
    // Longer than the push rules: a call is a much bigger intrusion.
    cooldownMinutes: 4320, // 3 days
    enabled: false,
  },
  {
    name: 'CALL — KYC started but not completed',
    triggerEvent: JOURNEY_EVENTS.KYC_STARTED,
    expectedEvent: JOURNEY_EVENTS.KYC_COMPLETED,
    delayMinutes: 45,
    upshotEvent: 'swiftloan_kyc_incomplete_call',
    channel: 'voice',
    cooldownMinutes: 4320,
    enabled: false,
  },
  {
    name: 'CALL — signed in but never started an application',
    triggerEvent: JOURNEY_EVENTS.OTP_VERIFIED,
    expectedEvent: JOURNEY_EVENTS.ELIGIBILITY_STARTED,
    // Longer than the others: someone who just signed in may simply be looking
    // around, and ringing them after twenty minutes would feel like surveillance.
    delayMinutes: 120,
    upshotEvent: 'swiftloan_no_application_call',
    channel: 'voice',
    cooldownMinutes: 4320,
    enabled: false,
  },
  {
    name: 'CALL — saw offers but chose none',
    triggerEvent: JOURNEY_EVENTS.OFFER_VIEWED,
    expectedEvent: JOURNEY_EVENTS.OFFER_SELECTED,
    // The highest-intent drop-off in the funnel: they have offers in front of
    // them and are deciding. A call here is genuinely useful rather than pushy.
    delayMinutes: 30,
    upshotEvent: 'swiftloan_offer_not_selected_call',
    channel: 'voice',
    cooldownMinutes: 4320,
    enabled: false,
  },
  {
    name: 'CALL — chose an offer but did not start verification',
    triggerEvent: JOURNEY_EVENTS.OFFER_SELECTED,
    expectedEvent: JOURNEY_EVENTS.KYC_STARTED,
    delayMinutes: 45,
    upshotEvent: 'swiftloan_kyc_not_started_call',
    channel: 'voice',
    cooldownMinutes: 4320,
    enabled: false,
  },
  {
    name: 'CALL — application form started but not finished',
    triggerEvent: JOURNEY_EVENTS.ELIGIBILITY_STARTED,
    expectedEvent: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED,
    delayMinutes: 60,
    upshotEvent: 'swiftloan_eligibility_incomplete_call',
    channel: 'voice',
    cooldownMinutes: 4320,
    enabled: false,
  },
  {
    name: 'CALL — installed the app but never signed in',
    triggerEvent: JOURNEY_EVENTS.APP_INSTALLED,
    expectedEvent: JOURNEY_EVENTS.OTP_VERIFIED,
    delayMinutes: 180,
    upshotEvent: 'swiftloan_install_not_registered_call',
    channel: 'voice',
    cooldownMinutes: 4320,
    enabled: false,
  },
];

/** Insert the defaults once, so a fresh database has working rules. */
export async function seedStallRules(): Promise<number> {
  let created = 0;
  for (const r of DEFAULT_STALL_RULES) {
    const exists = await prisma.stallRule.findUnique({
      where: {
        triggerEvent_expectedEvent_channel: {
          triggerEvent: r.triggerEvent,
          expectedEvent: r.expectedEvent,
          channel: r.channel,
        },
      },
    });
    if (exists) continue;
    await prisma.stallRule.create({ data: r });
    created++;
  }
  return created;
}

/**
 * Evaluate one rule and fire for everyone stuck on it.
 *
 * The match is "has `triggerEvent` older than the delay, and has no
 * `expectedEvent` recorded after it". Comparing against the trigger's own
 * timestamp (rather than just "has the expected event at all") matters for
 * repeatable steps — a customer who requested an OTP, verified, then later
 * requested another one is legitimately stalled again.
 */
export async function evaluateRule(rule: StallRule, now: Date = new Date()): Promise<number> {
  if (!rule.enabled) return 0;
  const cutoff = new Date(now.getTime() - rule.delayMinutes * 60_000);

  const triggers = await prisma.journeyEvent.findMany({
    where: { name: rule.triggerEvent, occurredAt: { lte: cutoff } },
    orderBy: { occurredAt: 'desc' },
    take: MAX_PER_RULE,
    include: { customer: true },
  });

  let fired = 0;
  for (const t of triggers) {
    // Did they move on after this particular trigger?
    const moved = await prisma.journeyEvent.findFirst({
      where: { customerId: t.customerId, name: rule.expectedEvent, occurredAt: { gte: t.occurredAt } },
      select: { id: true },
    });
    if (moved) continue;

    const customer = t.customer;
    if (!customer) continue;

    // Cooldown, expressed through the dispatch queue's idempotency key: the
    // same rule + customer + time bucket can only ever enqueue once, so this
    // needs no extra bookkeeping table and survives a restart.
    const bucket = Math.floor(now.getTime() / (rule.cooldownMinutes * 60_000));
    const idempotencyKey = `stall:${rule.id}:${customer.id}:${bucket}`;

    const upshotUserId = customer.userId ?? customer.id;
    const cfg = await getProviderConfig('upshot');
    const mapped = (cfg.settings.stageEventMap as Record<string, string> | undefined)?.[rule.triggerEvent];

    const existing = await prisma.outboundRequest.findUnique({ where: { idempotencyKey }, select: { id: true } });
    if (existing) continue;

    const minutesStuck = Math.round((now.getTime() - t.occurredAt.getTime()) / 60_000);

    // ── channel 'voice' means CALL them, not notify them ────────────────────
    //
    // A push saying "finish your application" is easy to ignore; a call that says
    // "you entered your number but never reached the OTP screen — did something
    // not work?" both rescues the drop-off and tells us WHY it happened, which a
    // push never can.
    //
    // Guarded harder than a push, because a wrongly-repeated call is a complaint
    // rather than a dismissed notification.
    if (rule.channel === 'voice') {
      const placed = await placeStallCall(rule, customer, minutesStuck, idempotencyKey, now);
      if (placed) fired++;
      continue;
    }

    await enqueueDispatch({
      customerId: customer.id,
      channel: rule.channel,
      kind: 'upshot_event',
      idempotencyKey,
      payload: {
        userId: upshotUserId,
        // A dashboard override wins, so an operator can repoint a rule at a
        // different Upshot campaign without editing the rule itself.
        eventName: mapped || rule.upshotEvent,
        properties: {
          rule: rule.name,
          stuckAt: rule.triggerEvent,
          expected: rule.expectedEvent,
          delayMinutes: rule.delayMinutes,
          stage: customer.currentStage,
          name: customer.name ?? undefined,
          phone: customer.phone ?? undefined,
          city: customer.city ?? undefined,
          source: customer.firstSource,
          campaign: customer.campaignId ?? undefined,
          minutesStuck: Math.round((now.getTime() - t.occurredAt.getTime()) / 60_000),
        },
      },
    });

    await recordJourneyEvent(customer.id, {
      channel: 'system',
      name: JOURNEY_EVENTS.NUDGE_SENT,
      metadata: { rule: rule.name, upshotEvent: mapped || rule.upshotEvent, stuckAt: rule.triggerEvent },
      mirrorTelemetry: false,
    }).catch(() => undefined);

    fired++;
  }

  if (fired) {
    await prisma.stallRule
      .update({
        where: { id: rule.id },
        data: { lastFiredAt: now, firedCount: { increment: fired } },
      })
      .catch(() => undefined);
  }
  return fired;
}

/** One pass over every enabled rule. Registered as a job. */
export async function stepStallDetector(now: Date = new Date()): Promise<number> {
  const rules = await prisma.stallRule.findMany({ where: { enabled: true } });
  let total = 0;
  for (const rule of rules) {
    try {
      total += await evaluateRule(rule, now);
    } catch (e) {
      console.error(`[stall-rule] "${rule.name}" failed`, e);
    }
  }
  if (total) console.log(`[stall-rule] queued ${total} Upshot event(s)`);
  return total;
}

/* ─────────────────── drop-off follow-up CALL ─────────────────── */

/**
 * Ring someone who stalled mid-funnel, telling the agent exactly where.
 *
 * Deliberately more conservative than a push nudge. A notification that fires
 * twice is an annoyance; a phone call that does is a complaint against a
 * regulated lender. So on top of the rule's own cooldown this enforces:
 *
 *   - calling hours (TRAI — never ring someone about a loan at 3am)
 *   - a per-phone cooldown across ALL calls, so several rules firing at once, or
 *     a lead callback that already happened, cannot stack into three calls
 *   - a hard cap on how many drop-off calls one person ever receives
 *   - an OutboundRequest row written FIRST, so the idempotency key is claimed
 *     before we dial and a crash mid-flight cannot double-call
 *
 * Returns true only if a call was actually placed.
 */
const DROPOFF_PHONE_COOLDOWN_HOURS = Number(process.env.STALL_CALL_PHONE_COOLDOWN_HOURS ?? 24) || 24;
const DROPOFF_MAX_PER_CUSTOMER = Number(process.env.STALL_CALL_MAX_PER_CUSTOMER ?? 2) || 2;

async function placeStallCall(
  rule: StallRule,
  customer: { id: string; phone: string | null; name: string | null },
  minutesStuck: number,
  idempotencyKey: string,
  now: Date,
): Promise<boolean> {
  if (!customer.phone) return false;

  // Never dial outside the window. Returning false (rather than consuming the
  // idempotency key) leaves them eligible when the window opens.
  if (!withinCallingHours(now)) return false;

  const since = new Date(now.getTime() - DROPOFF_PHONE_COOLDOWN_HOURS * 3_600_000);
  const recentAny = await prisma.callAttempt.count({
    where: { phone: customer.phone, queuedAt: { gte: since } },
  });
  if (recentAny > 0) return false;

  // Lifetime cap on drop-off calls to one person. Someone who ignores two of
  // these does not want a third.
  const everDropoff = await prisma.outboundRequest.count({
    where: { customerId: customer.id, kind: 'dropoff_call' },
  });
  if (everDropoff >= DROPOFF_MAX_PER_CUSTOMER) return false;

  // Claim the key BEFORE dialling. If we dialled first and then failed to write
  // this, the next tick would call them again.
  try {
    await prisma.outboundRequest.create({
      data: {
        customerId: customer.id,
        channel: 'voice',
        kind: 'dropoff_call',
        idempotencyKey,
        status: 'sent',
        payload: {
          rule: rule.name,
          stuckAt: rule.triggerEvent,
          expected: rule.expectedEvent,
          minutesStuck,
        },
      },
    });
  } catch {
    // Unique violation — another worker claimed it first.
    return false;
  }

  const full = await prisma.customer.findUnique({ where: { id: customer.id } });
  if (!full) return false;

  const context = compactContext(
    await buildLeadCallContext(full, {
      purpose: 'app_dropoff_followup',
      now,
      stall: {
        reason: stallReasonFor(rule.triggerEvent, rule.expectedEvent),
        // What to actually offer. Without this every drop-off call is the same
        // generic "did something go wrong?", which is barely better than a push —
        // someone stuck on OTP has a delivery problem, someone sitting on the
        // offers screen has a decision problem.
        help: stallHelpFor(rule.triggerEvent, rule.expectedEvent),
        lastStep: rule.triggerEvent.replace(/_/g, ' '),
        expectedStep: rule.expectedEvent.replace(/_/g, ' '),
        minutes: minutesStuck,
        channel: rule.triggerEvent.startsWith('lead_') ? 'the website' : 'the app',
      },
    }),
  );

  const result = await placeCall({
    customerId: customer.id,
    phone: customer.phone,
    assistantId: await agentIdFor('leadCallback'),
    metadata: { ...context, reason: 'app_dropoff_followup', rule: rule.name },
  });

  if (!result.ok) {
    // Mark the claim failed so the operator can see it in the queue, but do NOT
    // release the key — a provider error should not become a retry storm.
    await prisma.outboundRequest
      .updateMany({ where: { idempotencyKey }, data: { status: 'failed', error: result.error ?? null } })
      .catch(() => undefined);
    console.warn(`[stall-call] ${customer.phone}: ${result.error}`);
    return false;
  }

  await recordJourneyEvent(customer.id, {
    channel: 'system',
    name: JOURNEY_EVENTS.NUDGE_SENT,
    metadata: {
      rule: rule.name, via: 'voice_call', stuckAt: rule.triggerEvent,
      expected: rule.expectedEvent, minutesStuck, callAttemptId: result.attempt.id,
    },
    mirrorTelemetry: false,
  }).catch(() => undefined);

  console.log(`[stall-call] called ${customer.phone} — ${rule.name} (stuck ${minutesStuck}m)`);
  return true;
}
