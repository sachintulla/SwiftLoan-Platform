/**
 * WS5b — the campaign scheduler tick.
 *
 * Runs every minute. For each running campaign it checks the schedule gate,
 * picks the contacts whose retry rules say they are due, and dials them through
 * Ello at the campaign's concurrency. All the "may I?" decisions live in
 * campaignSchedule.ts; this module is the I/O around them.
 */
import type { Campaign, CampaignContact } from '@prisma/client';
import { prisma } from './prisma.js';
import { canDialNow, isContactEligible, planNextAttempt } from './campaignSchedule.js';
import { placeCall, runPool } from './dialer.js';
import { resolveCustomer } from './journey.js';

/** Contacts considered per campaign per tick — bounds a tick's blast radius. */
const MAX_PER_TICK = 200;

/** Campaigns already mid-tick, so a slow provider cannot cause overlapping runs. */
const inFlight = new Set<string>();

export function isCampaignTicking(id: string): boolean {
  return inFlight.has(id);
}

/**
 * Dial one contact and write back its attempt bookkeeping.
 * Never throws: one bad contact must not abort the tick.
 */
async function attemptContact(campaign: Campaign, contact: CampaignContact): Promise<'called' | 'failed'> {
  try {
    const customer = await resolveCustomer({
      phone: contact.phone,
      name: contact.name,
      email: contact.email,
      city: contact.city,
      source: 'campaign',
      campaignId: campaign.code,
    });

    const result = customer
      ? await placeCall({
          customerId: customer.id,
          phone: contact.phone,
          campaignId: campaign.id,
          assistantId: campaign.assistantId,
          metadata: {
            name: contact.name ?? undefined,
            product: contact.product ?? undefined,
            amount: contact.amount ?? undefined,
            campaign: campaign.name,
            attempt: contact.attempts + 1,
          },
        })
      : { ok: false as const, error: 'Could not resolve a customer for this phone' };

    // `answered` is not known yet — Ello reports it later on the webhook. The
    // plan here only reflects that an attempt was made; the webhook may finish
    // the contact early by setting answered.
    const plan = planNextAttempt(campaign, contact, { answered: false });

    await prisma.campaignContact.update({
      where: { id: contact.id },
      data: {
        state: result.ok ? 'called' : 'failed',
        error: result.ok ? null : String(result.error ?? 'dial failed'),
        attempts: plan.attempts,
        attemptsToday: plan.attemptsToday,
        attemptDayKey: plan.attemptDayKey,
        lastAttemptAt: plan.lastAttemptAt,
        nextEligibleAt: plan.nextEligibleAt,
      },
    });

    return result.ok ? 'called' : 'failed';
  } catch (e) {
    await prisma.campaignContact
      .update({
        where: { id: contact.id },
        data: { state: 'failed', error: String((e as Error)?.message ?? e), lastAttemptAt: new Date() },
      })
      .catch(() => undefined);
    return 'failed';
  }
}

/**
 * Process one campaign: gate on the schedule, select due contacts, dial them.
 * Returns a small summary for logging/observability.
 */
export async function tickCampaign(campaignId: string, now: Date = new Date()) {
  if (inFlight.has(campaignId)) return { skipped: 'already ticking' as const };
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { skipped: 'not found' as const };

  // Past its end date — close it out even if nothing is left to dial.
  if (campaign.endAt && now > campaign.endAt && campaign.status === 'running') {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'completed', completedAt: now },
    });
    return { skipped: 'ended' as const };
  }

  const gate = canDialNow(campaign, now);
  if (!gate.canDial) {
    await prisma.campaign
      .update({ where: { id: campaign.id }, data: { lastRunAt: now } })
      .catch(() => undefined);
    return { skipped: gate.reason, detail: gate.detail };
  }

  inFlight.add(campaignId);
  try {
    // Over-fetch, then apply the per-contact rules in code: the cadence checks
    // (daily cap keyed by local day, answered, strategy) are richer than a
    // single SQL predicate can express cleanly.
    const candidates = await prisma.campaignContact.findMany({
      where: {
        campaignId: campaign.id,
        state: { in: ['pending', 'called', 'failed'] },
        OR: [{ nextEligibleAt: null }, { nextEligibleAt: { lte: now } }],
      },
      orderBy: [{ lastAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: MAX_PER_TICK,
    });

    const due = candidates.filter((c) => isContactEligible(campaign, c, now).eligible);
    if (!due.length) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { lastRunAt: now } });
      await maybeComplete(campaign.id, now);
      return { dialed: 0, considered: candidates.length };
    }

    let called = 0;
    let failed = 0;
    await runPool(due, Math.max(1, campaign.concurrency), async (contact) => {
      // Re-check the window between items: a long tick must not spill past the
      // window's close, and a pause must take effect promptly.
      const fresh = await prisma.campaign.findUnique({ where: { id: campaign.id } });
      if (!fresh || !canDialNow(fresh, new Date()).canDial) return;
      const r = await attemptContact(fresh, contact);
      if (r === 'called') called++;
      else failed++;
    });

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        lastRunAt: now,
        calledCount: { increment: called },
        failedCount: { increment: failed },
      },
    });
    await maybeComplete(campaign.id, now);

    return { dialed: called + failed, called, failed, considered: candidates.length };
  } finally {
    inFlight.delete(campaignId);
  }
}

/**
 * Mark a campaign completed once no contact can ever be attempted again.
 * A recurring campaign stays open until its end date even when momentarily
 * idle, because more attempts are still scheduled.
 */
async function maybeComplete(campaignId: string, now: Date) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== 'running') return;

  const remaining = await prisma.campaignContact.count({
    where: {
      campaignId,
      state: { not: 'skipped' },
      attempts: { lt: campaign.maxAttemptsPerContact },
      ...(campaign.stopOnAnswer ? { answered: false } : {}),
    },
  });
  if (remaining > 0) return;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'completed', completedAt: now },
  });
}

/** One scheduler pass over every running campaign. */
export async function campaignScheduler(now: Date = new Date()) {
  const running = await prisma.campaign.findMany({
    // deletedAt is redundant with delete's own "must not be running" check,
    // but cheap insurance against a future path that flips status back to
    // running (e.g. a replayed webhook) on a campaign someone already deleted.
    where: { status: 'running', deletedAt: null },
    select: { id: true, name: true },
    take: 50,
  });
  for (const c of running) {
    try {
      const r = await tickCampaign(c.id, now);
      if ('dialed' in r && r.dialed) console.log(`[campaign] ${c.name}: dialed ${r.dialed}`);
    } catch (e) {
      console.error(`[campaign] tick failed for ${c.name}`, e);
    }
  }
}
