/**
 * WS5 — inbound provider webhooks. Mounted at /api/webhooks and deliberately
 * PUBLIC (no admin auth): Ello posts here from its own infrastructure.
 *
 * Two rules govern everything in this file:
 *  1. Never 4xx for a body we simply could not match — the provider would retry
 *     forever. Unmatched posts return 200 with { matched: false }.
 *  2. Always persist the verbatim body in `rawPayload`, so a provider-shape
 *     change is debuggable after the fact rather than silently dropped.
 */
import { Router } from 'express';
import type { CallOutcome, CallStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { parseElloWebhook } from '../lib/integrations.js';
import { normalisePhone } from '../lib/dialer.js';
import { recordJourneyEvent, JOURNEY_EVENTS } from '../lib/journey.js';
import {
  inferOutcome, shouldReplaceOutcome, parseAgentOutcome, type OutcomeSource,
} from '../lib/callOutcome.js';
import { rebuildSummary } from '../lib/conversations.js';
import { recordImmediateCallbackAttemptOutcome } from '../lib/immediateCallback.js';

/** A call that reached a human — the only kind worth inferring an outcome from. */
function isConnected(status: CallStatus): boolean {
  return status === 'completed' || status === 'in_progress';
}

/**
 * The shared secret, accepted under either header name.
 *
 * ONE credential covers both directions — the push webhooks here and the pull
 * endpoints in conversations.routes.ts — so Ello has a single value to configure
 * rather than two that must be kept in step. `x-webhook-secret` is the original
 * name and stays supported; `x-api-key` is accepted so the same header works for
 * every call in either direction.
 */
function webhookSecret(): string {
  return process.env.ELLO_WEBHOOK_SECRET || process.env.CONVERSATION_API_KEY || '';
}

function providedSecret(req: import('express').Request): string {
  return String(req.headers['x-webhook-secret'] ?? '') || String(req.headers['x-api-key'] ?? '');
}

export const webhooksRouter = Router();

/**
 * `campaign.started` / `campaign.ended` for a campaign sent to Ello via
 * send-to-ello (campaigns.routes.ts). Ello's `webhooks` field is set fresh on
 * every campaign create call (see integrations.ts's campaignWebhookEvents) —
 * not a one-time dashboard subscription — and routes ALL events, campaign.*
 * included, to the same URL as the per-call trigger's `hook_url`. So this
 * runs from inside /ello/call-outcome for that shared URL; kept as its own
 * function (and /ello/campaign-events below still calls it too) in case
 * campaign.* ever gets registered on a separate URL instead.
 *
 * Idempotent by construction: every field here is a `set`, not an
 * `increment`, so a provider retry of the same event just writes the same
 * values again rather than double-counting.
 */
async function handleCampaignLifecycleEvent(b: Record<string, any>): Promise<{ matched: boolean; campaignId?: string; message: string }> {
  const event = String(b.event ?? '');
  const providerCampaignId = b.campaign_id != null ? String(b.campaign_id) : null;

  if (!providerCampaignId) {
    console.warn('[webhook] campaign event with no campaign_id', { event });
    return { matched: false, message: 'No campaign_id on event' };
  }

  const campaign = await prisma.campaign.findUnique({ where: { providerCampaignId } });
  if (!campaign) {
    console.warn('[webhook] unmatched ello campaign event', { event, providerCampaignId });
    return { matched: false, message: 'No matching campaign' };
  }

  if (event === 'campaign.started') {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'running', startedAt: campaign.startedAt ?? new Date() },
    });
  } else if (event === 'campaign.ended') {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        // Ello's own tally — authoritative over whatever our per-call webhook
        // handler accumulated, since that only sees calls it could match.
        ...(Number.isFinite(Number(b.successful_calls)) ? { calledCount: Number(b.successful_calls) } : {}),
        ...(Number.isFinite(Number(b.failed_calls)) ? { failedCount: Number(b.failed_calls) } : {}),
      },
    });
  } else {
    console.warn('[webhook] unrecognised campaign event', { event, providerCampaignId });
    return { matched: false, message: `Unrecognised event "${event}"` };
  }

  return { matched: true, campaignId: campaign.id, message: 'Recorded' };
}

/* ───────────────────────── outcome/status mapping ───────────────────────── */

/** Squash "Not Interested", "not-interested", "NOT_INTERESTED" → notinterested. */
function canon(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const OUTCOME_ALIASES: Record<string, CallOutcome> = {
  interested: 'interested',
  positive: 'interested',
  qualified: 'interested',
  notinterested: 'not_interested',
  negative: 'not_interested',
  declined: 'not_interested',
  rejected: 'not_interested',
  callbackrequested: 'callback_requested',
  callback: 'callback_requested',
  callmelater: 'callback_requested',
  reschedule: 'callback_requested',
  wrongnumber: 'wrong_number',
  invalidnumber: 'wrong_number',
  voicemail: 'voicemail',
  answeringmachine: 'voicemail',
  machine: 'voicemail',
  unreachable: 'unreachable',
  noanswer: 'unreachable',
  busy: 'unreachable',
  failed: 'unreachable',
  donotcall: 'do_not_call',
  dnc: 'do_not_call',
  optout: 'do_not_call',
  blacklist: 'do_not_call',
  installedapp: 'installed_app',
  appinstalled: 'installed_app',
  downloaded: 'installed_app',
};

/** Tolerant mapper; anything we do not recognise is recorded as `other`. */
export function mapOutcome(raw?: string | null): CallOutcome | null {
  if (!raw) return null;
  return OUTCOME_ALIASES[canon(raw)] ?? 'other';
}

const STATUS_ALIASES: Record<string, CallStatus> = {
  queued: 'queued',
  pending: 'queued',
  dialing: 'dialing',
  ringing: 'dialing',
  initiated: 'dialing',
  inprogress: 'in_progress',
  ongoing: 'in_progress',
  answered: 'in_progress',
  completed: 'completed',
  ended: 'completed',
  done: 'completed',
  success: 'completed',
  finished: 'completed',
  failed: 'failed',
  error: 'failed',
  noanswer: 'no_answer',
  notanswered: 'no_answer',
  busy: 'busy',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

export function mapStatus(raw?: string | null): CallStatus | null {
  if (!raw) return null;
  return STATUS_ALIASES[canon(raw)] ?? null;
}

/* ──────────────────────────── Ello call outcome ──────────────────────────── */

// POST /api/webhooks/ello/call-outcome
webhooksRouter.post('/ello/call-outcome', ah(async (req, res) => {
  const expected = webhookSecret();
  const provided = providedSecret(req);

  if (expected) {
    if (provided !== expected) return fail(res, 401, 'Invalid webhook secret');
  } else if (process.env.NODE_ENV === 'production') {
    // Without the secret this route is unauthenticated, and it can move
    // customers through the funnel — fabricate a `call.completed` and someone
    // is marked `contacted`; send `do_not_call` and they are marked `lost`.
    // Fail the request rather than the boot, so one missing env var does not
    // take the whole API down, but never accept an unverified post in prod.
    console.error('[webhook] ELLO_WEBHOOK_SECRET is not set — rejecting call-outcome post');
    return fail(res, 503, 'Webhook is not configured');
  } else {
    // Local only: lets a developer curl this endpoint without ceremony.
    console.warn('[webhook] ELLO_WEBHOOK_SECRET is not set — accepting unverified post (dev only)');
  }

  const raw = req.body ?? {};

  // campaign.started/campaign.ended share this same URL (see
  // handleCampaignLifecycleEvent's doc comment) — nothing below this branch
  // applies to them, there's no CallAttempt to match against.
  if (String(raw?.event ?? '').startsWith('campaign.')) {
    const result = await handleCampaignLifecycleEvent(raw as Record<string, any>);
    return ok(res, result, result.message);
  }

  const parsed = await parseElloWebhook(raw);

  // Match on the provider's id first, then on the CallAttempt id we sent as
  // `callId` (present even when the provider never surfaced its own id).
  let attempt =
    (parsed.providerCallId
      ? await prisma.callAttempt.findUnique({ where: { providerConversationId: parsed.providerCallId } })
      : null) ??
    (parsed.clientCallId
      ? await prisma.callAttempt.findUnique({ where: { id: parsed.clientCallId } })
      : null);

  // Neither id matched — this call never went through our own dialer.ts, so
  // it has no CallAttempt at all yet. The only calls that happens for are
  // ones Ello placed itself via send-to-ello's batch campaign dialler, which
  // carries campaign_id + to_number instead. Find (or, on the first event for
  // this conversation, create) the CallAttempt via that instead of dropping
  // the webhook — campaigns.routes.ts's send-to-ello sets Campaign
  // .providerCampaignId for exactly this lookup.
  if (!attempt && parsed.providerCampaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { providerCampaignId: parsed.providerCampaignId } });
    const phone = normalisePhone(parsed.toNumber);
    if (campaign && phone) {
      attempt =
        // A prior event for this same call may already have created the row
        // (events are not guaranteed to arrive in order) — reuse it rather
        // than creating a second CallAttempt for one real call.
        (await prisma.callAttempt.findFirst({
          where: { campaignId: campaign.id, phone, providerConversationId: null },
          orderBy: { queuedAt: 'desc' },
        })) ??
        (await prisma.callAttempt.create({
          data: {
            campaignId: campaign.id,
            phone,
            channel: 'phone_outbound',
            agentRole: 'campaign',
            providerConversationId: parsed.providerCallId,
            customerId: (await prisma.customer.findFirst({ where: { phone } }))?.id ?? null,
            status: 'queued',
            queuedAt: new Date(),
          },
        }));
    }
  }

  if (!attempt) {
    // 200 on purpose: a 4xx makes the provider retry a body we can never match.
    console.warn('[webhook] unmatched ello call-outcome', {
      providerCallId: parsed.providerCallId,
      clientCallId: parsed.clientCallId,
      providerCampaignId: parsed.providerCampaignId,
    });
    return ok(res, { matched: false }, 'No matching call attempt');
  }

  // Ello sends up to four events per call (call.started, call.completed,
  // call.processed, call.recording), each with a different subset of fields.
  // The event name is the most reliable signal; `status` is only present on
  // some of them and there is no `outcome` field at all, so derive one.
  const event = (parsed.event ?? '').toLowerCase();
  let status: CallStatus =
    mapStatus(parsed.status) ?? (parsed.outcome ? 'completed' : attempt.status ?? 'queued');
  if (event === 'call.started') {
    status = 'in_progress';
  } else if (event === 'call.completed' || event === 'call.processed') {
    if (parsed.errorCode || parsed.errorReason) status = mapStatus(parsed.errorReason) ?? 'failed';
    else if (!parsed.answered && !attempt.answered) status = 'no_answer';
    else status = 'completed';
  }

  // Outcome, in order of trust:
  //  1. an explicit field, if the provider ever grows one
  //  2. the machine-obvious failure cases (no answer / provider error)
  //  3. inference from what was actually said on the call
  // Ello sends no outcome field today, so in practice (3) is what fills this in
  // until the agent's report_call_outcome tool arrives on its own endpoint.
  let outcome: CallOutcome | null = mapOutcome(parsed.outcome);
  let outcomeSource: OutcomeSource = outcome ? 'agent' : null;
  let outcomeEvidence: string | null = null;

  if (!outcome) {
    if (status === 'no_answer') {
      outcome = 'unreachable';
      outcomeSource = 'status';
    } else if (status === 'failed') {
      outcome = mapOutcome(parsed.errorReason) ?? null;
      if (outcome) outcomeSource = 'status';
    }
  }

  // Only infer for calls that actually connected, and never overwrite something
  // the agent itself reported.
  if (!outcome && isConnected(status)) {
    const derived = inferOutcome(parsed.transcript, parsed.summary);
    if (shouldReplaceOutcome(attempt.outcome, attempt.outcomeSource as OutcomeSource, derived)) {
      outcome = derived.outcome;
      outcomeSource = derived.source;
      outcomeEvidence = derived.evidence ?? null;
    }
  }

  const isCompleted = status === 'completed' || status === 'in_progress';
  // Terminal for journey purposes: only record the timeline entry once, on the
  // first event that ends the call. Otherwise call.completed AND call.processed
  // would each append a CALL_COMPLETED and double-count the campaign.
  const isTerminal =
    status === 'completed' || status === 'failed' || status === 'no_answer' ||
    status === 'busy' || status === 'cancelled';
  const alreadyFinalised = attempt.endedAt != null;

  const updated = await prisma.callAttempt.update({
    where: { id: attempt.id },
    data: {
      status,
      ...(outcome ? { outcome, outcomeSource, outcomeEvidence } : {}),
      ...(parsed.summary ? { summary: parsed.summary } : {}),
      ...(parsed.transcript != null ? { transcript: parsed.transcript as Prisma.InputJsonValue } : {}),
      ...(parsed.recordingUrl ? { recordingUrl: parsed.recordingUrl } : {}),
      ...(parsed.durationSec != null ? { durationSec: parsed.durationSec } : {}),
      answered: parsed.answered || attempt.answered,
      ...(parsed.providerCallId && !attempt.providerConversationId ? { providerConversationId: parsed.providerCallId } : {}),
      ...(isTerminal && !alreadyFinalised ? { endedAt: new Date() } : {}),
      ...(parsed.errorReason ? { error: parsed.errorReason } : {}),
      rawPayload: raw as Prisma.InputJsonValue,
    },
  });

  // The row IS the conversation now (this used to mirror into a separate
  // Conversation table — no longer needed, just keep the rolling cross-channel
  // brief in step). Fire-and-forget: a read-model rebuild must never break the
  // webhook the provider is retrying.
  rebuildSummary(updated.phone).catch((e) => console.error('[webhook] summary rebuild failed', e));

  if (isTerminal && !alreadyFinalised && updated.customerId) {
    // CALL_COMPLETED advances the customer to `contacted`; do_not_call ends the
    // journey outright and is passed as an explicit stage override.
    await recordJourneyEvent(updated.customerId, {
      channel: 'voice',
      name: isCompleted ? JOURNEY_EVENTS.CALL_COMPLETED : JOURNEY_EVENTS.CALL_FAILED,
      ...(outcome === 'do_not_call' ? { stage: 'lost' as const } : {}),
      metadata: {
        callAttemptId: updated.id,
        event: parsed.event,
        status,
        outcome: outcome ?? null,
        durationSec: updated.durationSec ?? null,
        answered: updated.answered,
        campaignId: updated.campaignId,
        errorReason: parsed.errorReason ?? null,
      },
    }).catch((e) => console.error('[webhook] journey write failed', e));

    if (updated.campaignId) {
      await prisma.campaign
        .update({
          where: { id: updated.campaignId },
          data: isCompleted ? { calledCount: { increment: 1 } } : { failedCount: { increment: 1 } },
        })
        .catch(() => undefined);
    }

    // Advance the "Yes, call me" retry cycle. A no-op for any customer not
    // actually in the middle of one — see recordImmediateCallbackAttemptOutcome.
    const callReason = (attempt.callContext as { reason?: string } | null)?.reason;
    if (callReason === 'immediate_callback_optin') {
      await recordImmediateCallbackAttemptOutcome(updated.customerId, isCompleted).catch((e) =>
        console.error('[webhook] immediate-callback outcome update failed', e),
      );
    }
  }

  if (updated.campaignId) {
    // Reflect the disposition on the spreadsheet row too, so the campaign view
    // does not sit on `queued` forever.
    await prisma.campaignContact
      .updateMany({
        where: { campaignId: updated.campaignId, phone: updated.phone },
        data: { state: isCompleted ? 'called' : 'failed' },
      })
      .catch(() => undefined);
  }

  return ok(res, { matched: true, callId: updated.id, status: updated.status, outcome: updated.outcome }, 'Recorded');
}));

/* ─────────────── campaign lifecycle (Ello's own batch dialler) ─────────────── */

/**
 * POST /api/webhooks/ello/campaign-events
 *
 * Ello sends campaign.started/campaign.ended to the SAME url as call events
 * (see handleCampaignLifecycleEvent's doc comment), so /ello/call-outcome
 * above is what actually handles them in practice. This route is kept as a
 * fallback for a differently-configured webhook subscription that does point
 * campaign.* at its own URL.
 */
webhooksRouter.post('/ello/campaign-events', ah(async (req, res) => {
  const expected = webhookSecret();
  const provided = providedSecret(req);
  if (expected) {
    if (provided !== expected) return fail(res, 401, 'Invalid webhook secret');
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[webhook] ELLO_WEBHOOK_SECRET is not set — rejecting campaign-events post');
    return fail(res, 503, 'Webhook is not configured');
  } else {
    console.warn('[webhook] ELLO_WEBHOOK_SECRET is not set — accepting unverified post (dev only)');
  }

  const result = await handleCampaignLifecycleEvent((req.body ?? {}) as Record<string, any>);
  return ok(res, result, result.message);
}));

/* ─────────────── agent-reported outcome (the authoritative path) ─────────────── */

/**
 * POST /api/webhooks/ello/call-outcome-report
 *
 * Target for the agent's `report_call_outcome` tool. This is the ONLY source of
 * a trustworthy disposition: Ello's own webhooks carry no outcome field, so
 * everything else is inference from the transcript.
 *
 * Separate from /call-outcome on purpose — that route is the provider's
 * lifecycle feed and is shaped by Ello; this one is our contract with the agent
 * and also carries the qualification details captured on the call.
 *
 * Deliberately forgiving about identifiers (either the provider's
 * conversation_id or our own call id) and never 4xx for an unmatched body, for
 * the same reason as the main webhook: a retry loop is worse than a logged miss.
 */
webhooksRouter.post('/ello/call-outcome-report', ah(async (req, res) => {
  const expected = webhookSecret();
  const provided = providedSecret(req);
  if (expected) {
    if (provided !== expected) return fail(res, 401, 'Invalid webhook secret');
  } else if (process.env.NODE_ENV === 'production') {
    // This endpoint writes a disposition that drives outreach — an unverified
    // caller could mark a real customer do_not_call, or mark a refusal as
    // interested and keep messaging them.
    console.error('[webhook] ELLO_WEBHOOK_SECRET is not set — rejecting call-outcome-report');
    return fail(res, 503, 'Webhook is not configured');
  }

  const b = (req.body ?? {}) as Record<string, any>;
  const providerId = b.conversation_id ?? b.conversationId ?? b.call_id ?? null;
  const ourId = b.swiftloan_call_id ?? b.swiftloanCallId ?? null;

  const attempt =
    (ourId ? await prisma.callAttempt.findUnique({ where: { id: String(ourId) } }) : null) ??
    (providerId
      ? await prisma.callAttempt.findUnique({ where: { providerConversationId: String(providerId) } })
      : null);

  if (!attempt) {
    console.warn('[webhook] unmatched call-outcome-report', { providerId, ourId });
    return ok(res, { matched: false }, 'No matching call attempt');
  }

  const outcome = parseAgentOutcome(b.outcome);
  if (!outcome) {
    // An unrecognised label is recorded as a note rather than silently dropped —
    // the summary is still useful to a human even if the enum value is not.
    console.warn('[webhook] call-outcome-report with unusable outcome', b.outcome);
  }

  // Only accept a callback time that parses and is in the future; an agent
  // mis-hearing "next Tuesday" must not schedule something in 1970.
  let callbackAt: Date | null = null;
  if (b.callback_at ?? b.callbackAt) {
    const d = new Date(String(b.callback_at ?? b.callbackAt));
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) callbackAt = d;
  }

  const str = (v: unknown, max = 120): string | undefined => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : undefined;
  };

  const updated = await prisma.callAttempt.update({
    where: { id: attempt.id },
    data: {
      ...(outcome ? { outcome, outcomeSource: 'agent', outcomeEvidence: null } : {}),
      ...(str(b.summary, 2000) ? { summary: str(b.summary, 2000) } : {}),
      ...(str(b.income_range ?? b.incomeRange) ? { incomeRange: str(b.income_range ?? b.incomeRange) } : {}),
      ...(str(b.employment) ? { employment: str(b.employment) } : {}),
      ...(str(b.preferred_channel ?? b.preferredChannel) ? { preferredChannel: str(b.preferred_channel ?? b.preferredChannel) } : {}),
      ...(callbackAt ? { callbackAt } : {}),
      answered: true, // the agent could only report if it spoke to someone
      // The agent reporting a disposition is itself proof the call happened —
      // close it out here rather than leaving it for the reconcile timeout,
      // the same fix as the save_conversation path in conversations.ts.
      status: 'completed',
      endedAt: attempt.endedAt ?? new Date(),
    },
  });

  // The row IS the conversation now — just keep the rolling cross-channel
  // brief in step (this is the authoritative disposition, so it upgrades
  // whatever the lifecycle webhook inferred for the same call).
  rebuildSummary(updated.phone).catch((e) => console.error('[webhook] summary rebuild failed', e));

  // The disposition is the part that changes what happens next, so it gets its
  // own timeline entry even though the call already recorded one.
  if (updated.customerId) {
    await recordJourneyEvent(updated.customerId, {
      channel: 'voice',
      name: JOURNEY_EVENTS.CALL_COMPLETED,
      // A refusal ends the journey; nothing else here overrides the stage, so an
      // interested lead keeps whatever stage the funnel gave it.
      ...(outcome === 'do_not_call' ? { stage: 'lost' as const } : {}),
      metadata: {
        callAttemptId: updated.id,
        reportedBy: 'agent',
        outcome: outcome ?? String(b.outcome ?? 'unrecognised'),
        summary: updated.summary ?? null,
        incomeRange: updated.incomeRange ?? null,
        employment: updated.employment ?? null,
        preferredChannel: updated.preferredChannel ?? null,
        callbackAt: callbackAt?.toISOString() ?? null,
      },
    }).catch((e) => console.error('[webhook] journey write failed', e));
  }

  return ok(
    res,
    { matched: true, callId: updated.id, outcome: updated.outcome },
    'Outcome recorded',
  );
}));
