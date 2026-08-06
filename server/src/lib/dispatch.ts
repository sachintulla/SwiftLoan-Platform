/**
 * WS5 — outbound dispatch queue.
 *
 * Every re-engagement message we send through Upshot becomes an
 * `OutboundRequest` row first. That gives us idempotency (a stall scan that
 * runs twice cannot double-message a customer), retries with backoff, and an
 * auditable record of exactly what we sent and what the provider answered.
 *
 * Nothing here ever throws: the integration helpers return result objects, and
 * a provider outage must never break a request path or a job tick.
 */
import type { Customer, JourneyStage, DispatchChannel, OutboundRequest } from '@prisma/client';
import { prisma } from './prisma.js';
import { upshotUserUpsert, upshotEvent, upshotEventNameForStage, pick } from './integrations.js';
import { recordJourneyEvent, JOURNEY_EVENTS, STAGE_LABELS } from './journey.js';
import { NEXT_ACTION_BY_STAGE } from './nextAction.js';

/** Give up after this many provider attempts. */
const MAX_ATTEMPTS = 5;

export type DispatchKind = 'upshot_user_upsert' | 'upshot_event' | 'ello_call';

export interface EnqueueDispatchInput {
  customerId?: string | null;
  channel: DispatchChannel;
  kind: DispatchKind | string;
  /** Dedup key — re-enqueueing the same key returns the existing row. */
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

/**
 * Create a pending dispatch. Idempotent: an existing row with the same key is
 * returned untouched, which is what stops a repeated scan from re-sending.
 */
export async function enqueueDispatch(input: EnqueueDispatchInput): Promise<OutboundRequest> {
  const existing = await prisma.outboundRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  try {
    return await prisma.outboundRequest.create({
      data: {
        customerId: input.customerId ?? null,
        channel: input.channel,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload as object,
      },
    });
  } catch {
    // Unique race: another worker inserted the same key first.
    const row = await prisma.outboundRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (row) return row;
    throw new Error('Failed to enqueue dispatch');
  }
}

/** Exponential backoff: wait 2^attempts minutes between provider attempts. */
function backoffDue(attempts: number, updatedAt: Date): boolean {
  if (attempts <= 0) return true;
  const waitMs = Math.pow(2, attempts) * 60_000;
  return Date.now() - updatedAt.getTime() >= waitMs;
}

export interface DispatchRunSummary {
  picked: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Send pending dispatches, oldest first. Safe to call from several ticks: rows
 * already past their attempt budget are marked `failed` and left alone.
 */
export async function runDispatchQueue(limit = 50): Promise<DispatchRunSummary> {
  const rows = await prisma.outboundRequest.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const summary: DispatchRunSummary = { picked: rows.length, sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    if (!backoffDue(row.attempts, row.updatedAt)) {
      summary.skipped++;
      continue;
    }

    const payload = (row.payload ?? {}) as Record<string, any>;
    let result: { ok: boolean; status: number; body: any; error?: string };

    try {
      if (row.kind === 'upshot_user_upsert') {
        result = await upshotUserUpsert(payload as any);
      } else if (row.kind === 'upshot_event') {
        // Upshot requires a unique eventId. Passing this row's id makes a
        // retry idempotent upstream rather than re-notifying the customer.
        result = await upshotEvent(
          String(payload.userId ?? ''),
          String(payload.eventName ?? ''),
          (payload.properties as Record<string, any>) ?? {},
          row.id,
        );
      } else {
        result = { ok: false, status: 0, body: null, error: `Unsupported dispatch kind "${row.kind}"` };
      }
    } catch (e: any) {
      result = { ok: false, status: 0, body: null, error: String(e?.message ?? e) };
    }

    if (result.ok) {
      const providerRef = pick(result.body, 'data.id') ?? result.body?.id ?? result.body?.request_id;
      await prisma.outboundRequest
        .update({
          where: { id: row.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            attempts: row.attempts + 1,
            lastError: null,
            providerRef: providerRef == null ? null : String(providerRef),
            response: (result.body ?? null) as object,
          },
        })
        .catch(() => undefined);
      summary.sent++;
      continue;
    }

    const attempts = row.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await prisma.outboundRequest
      .update({
        where: { id: row.id },
        data: {
          attempts,
          status: exhausted ? 'failed' : 'pending',
          lastError: (result.error ?? 'Unknown provider error').slice(0, 500),
          response: (result.body ?? null) as object,
        },
      })
      .catch(() => undefined);
    if (exhausted) summary.failed++;
  }

  return summary;
}

/* ─────────────────────────── composed nudge ─────────────────────────── */

/** Upshot identifies a customer by our userId when known, else the customer id. */
function upshotUserId(customer: Customer): string {
  return customer.userId ?? customer.id;
}

/**
 * The operator's flow: the very first time we ever message a customer through
 * Upshot we create the user there, then we always fire the stage's event (that
 * is what actually sends push / WhatsApp / SMS on their side).
 */
export async function nudgeCustomer(customer: Customer, stage: JourneyStage) {
  const userId = upshotUserId(customer);
  const stageLabel = STAGE_LABELS[stage];
  const nextAction = NEXT_ACTION_BY_STAGE[stage] ?? 'Review the customer record';
  const eventName = await upshotEventNameForStage(stage);

  // Product interest is not on Customer; the website enquiry carries it.
  const lead = customer.phone
    ? await prisma.anonymousLead.findFirst({
        where: { phone: customer.phone },
        orderBy: { createdAt: 'desc' },
        select: { productInterest: true, amount: true },
      })
    : null;

  const requests: OutboundRequest[] = [];

  const alreadyIdentified = await prisma.outboundRequest.findFirst({
    where: { customerId: customer.id, kind: 'upshot_user_upsert', status: 'sent' },
    select: { id: true },
  });

  if (!alreadyIdentified) {
    requests.push(
      await enqueueDispatch({
        customerId: customer.id,
        channel: 'push',
        kind: 'upshot_user_upsert',
        idempotencyKey: `upshot_user:${customer.id}`,
        payload: {
          userId,
          phone: customer.phone,
          name: customer.name,
          email: customer.email,
          city: customer.city,
        },
      }),
    );
  }

  const bucket = Math.floor(Date.now() / 60_000);
  requests.push(
    await enqueueDispatch({
      customerId: customer.id,
      channel: 'push',
      kind: 'upshot_event',
      // One event per customer, stage and minute — repeated scans dedup, but a
      // genuinely new nudge later on still gets through.
      idempotencyKey: `upshot_event:${customer.id}:${stage}:${eventName}:${bucket}`,
      payload: {
        userId,
        eventName,
        properties: {
          stage,
          stageLabel,
          name: customer.name ?? null,
          phone: customer.phone ?? null,
          productInterest: lead?.productInterest ?? null,
          amount: lead?.amount ?? null,
          nextAction,
          source: customer.firstSource,
          campaignId: customer.campaignId ?? null,
        },
      },
    }),
  );

  await recordJourneyEvent(customer.id, {
    channel: 'system',
    name: JOURNEY_EVENTS.NUDGE_SENT,
    metadata: { stage, stageLabel, eventName, nextAction },
  }).catch(() => undefined);

  return requests;
}
