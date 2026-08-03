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
];

/** Insert the defaults once, so a fresh database has working rules. */
export async function seedStallRules(): Promise<number> {
  let created = 0;
  for (const r of DEFAULT_STALL_RULES) {
    const exists = await prisma.stallRule.findUnique({
      where: { triggerEvent_expectedEvent: { triggerEvent: r.triggerEvent, expectedEvent: r.expectedEvent } },
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
