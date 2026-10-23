/**
 * WS5 — the one place an outbound call is actually placed.
 *
 * Both the ad-hoc admin trigger (`/api/admin/calls/trigger`) and the campaign
 * runner (`/api/admin/campaigns/:id/start`) go through `placeCall()`, so the
 * CallAttempt lifecycle, the journey event and the provider error handling
 * have exactly one implementation.
 *
 * Nothing here throws: a provider outage must degrade a call to `failed`, never
 * take down a request handler or a background loop.
 */
import type { CallAttempt, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { triggerElloCall } from './integrations.js';
import { recordJourneyEvent, resolveCustomer, JOURNEY_EVENTS } from './journey.js';

/** Bare 10-digit Indian mobile, or null when the input is unusable. */
export function normalisePhone(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
  return null;
}

export interface PlaceCallInput {
  customerId: string;
  phone: string;
  campaignId?: string | null;
  assistantId?: string | null;
  metadata?: Record<string, any>;
}

export interface PlaceCallResult {
  attempt: CallAttempt;
  ok: boolean;
  error?: string;
}

/**
 * Create the CallAttempt row first, then ask Ello to dial it. The row exists
 * before the HTTP call on purpose: its id is what we hand the provider as
 * `callId`, and it is what the outcome webhook (and the agent's own
 * save_conversation report) matches on if the provider answers slowly or we
 * crash mid-flight.
 */
export async function placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
  const attempt = await prisma.callAttempt.create({
    data: {
      customerId: input.customerId,
      campaignId: input.campaignId ?? null,
      phone: input.phone,
      channel: 'phone_outbound',
      status: 'queued',
      queuedAt: new Date(),
      // Persist what the agent will be told. When a call goes wrong the first
      // question is always "what did it know?", and the provider does not keep
      // this for us.
      ...(input.metadata && Object.keys(input.metadata).length
        ? { callContext: input.metadata as Prisma.InputJsonValue }
        : {}),
    },
  });

  // Timeline entry as soon as it is queued, so a call that never connects still
  // shows up on the customer record.
  await recordJourneyEvent(input.customerId, {
    channel: 'voice',
    name: JOURNEY_EVENTS.CALL_QUEUED,
    metadata: { callAttemptId: attempt.id, campaignId: input.campaignId ?? null, phone: input.phone },
  }).catch(() => undefined);

  const res = await triggerElloCall({
    phone: input.phone,
    callId: attempt.id,
    assistantId: input.assistantId ?? undefined,
    metadata: input.metadata ?? {},
  });

  if (!res.ok) {
    const updated = await prisma.callAttempt.update({
      where: { id: attempt.id },
      data: { status: 'failed', error: res.error ?? `provider returned HTTP ${res.status}` },
    });
    return { attempt: updated, ok: false, error: updated.error ?? undefined };
  }

  const updated = await prisma.callAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'dialing',
      startedAt: new Date(),
      ...(res.providerCallId ? { providerConversationId: res.providerCallId } : {}),
    },
  });
  return { attempt: updated, ok: true };
}

/* ─────────────────────── tiny concurrency limiter ─────────────────────── */

/**
 * Worker-pool over an array: `limit` workers pull the next index until the list
 * is exhausted. Deliberately dependency-free (no p-limit) and order-agnostic.
 * `shouldStop` is checked before each item so a pause takes effect promptly.
 */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop?: () => Promise<boolean> | boolean,
): Promise<number> {
  const width = Math.max(1, Math.min(50, Math.floor(limit) || 1));
  let cursor = 0;
  let processed = 0;
  let stopped = false;

  const run = async () => {
    for (;;) {
      if (stopped) return;
      const i = cursor++;
      if (i >= items.length) return;
      if (shouldStop && (await shouldStop())) {
        stopped = true;
        return;
      }
      try {
        await worker(items[i], i);
      } catch (e) {
        console.error('[dialer] worker error', e);
      }
      processed++;
    }
  };

  await Promise.all(Array.from({ length: Math.min(width, items.length) }, run));
  return processed;
}

/* ──────────────────────────────────────────────────────────────────────
   The old runCampaign() / isCampaignRunning() pair lived here. Both were
   removed when scheduling landed (see lib/campaignRunner.ts).

   runCampaign() dialled every 'pending' contact immediately, with no awareness
   of startAt/endAt, the daily calling window, allowed weekdays or the retry
   cadence. Keeping it meant one stray call could blast a whole list at 3am.
   Use tickCampaign() / campaignScheduler() instead.
   ────────────────────────────────────────────────────────────────────── */
