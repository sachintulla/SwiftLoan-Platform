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
import { recordJourneyEvent, JOURNEY_EVENTS } from '../lib/journey.js';

export const webhooksRouter = Router();

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
  const expected = process.env.ELLO_WEBHOOK_SECRET;
  const provided = String(req.headers['x-webhook-secret'] ?? '');

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
  const parsed = await parseElloWebhook(raw);

  // Match on the provider's id first, then on the CallAttempt id we sent as
  // `callId` (present even when the provider never surfaced its own id).
  const attempt =
    (parsed.providerCallId
      ? await prisma.callAttempt.findUnique({ where: { providerCallId: parsed.providerCallId } })
      : null) ??
    (parsed.clientCallId
      ? await prisma.callAttempt.findUnique({ where: { id: parsed.clientCallId } })
      : null);

  if (!attempt) {
    // 200 on purpose: a 4xx makes the provider retry a body we can never match.
    console.warn('[webhook] unmatched ello call-outcome', {
      providerCallId: parsed.providerCallId,
      clientCallId: parsed.clientCallId,
    });
    return ok(res, { matched: false }, 'No matching call attempt');
  }

  // Ello sends up to four events per call (call.started, call.completed,
  // call.processed, call.recording), each with a different subset of fields.
  // The event name is the most reliable signal; `status` is only present on
  // some of them and there is no `outcome` field at all, so derive one.
  const event = (parsed.event ?? '').toLowerCase();
  let status: CallStatus =
    mapStatus(parsed.status) ?? (parsed.outcome ? 'completed' : attempt.status);
  if (event === 'call.started') {
    status = 'in_progress';
  } else if (event === 'call.completed' || event === 'call.processed') {
    if (parsed.errorCode || parsed.errorReason) status = mapStatus(parsed.errorReason) ?? 'failed';
    else if (!parsed.answered && !attempt.answered) status = 'no_answer';
    else status = 'completed';
  }

  const outcome =
    mapOutcome(parsed.outcome) ??
    // No explicit outcome from Ello — infer what we safely can. A human still
    // sets the real disposition; this only fills the obvious machine cases.
    (status === 'no_answer'
      ? 'unreachable'
      : status === 'failed'
        ? mapOutcome(parsed.errorReason) ?? null
        : null);

  const isCompleted = status === 'completed' || status === 'in_progress';
  // Terminal for journey purposes: only record the timeline entry once, on the
  // first event that ends the call. Otherwise call.completed AND call.processed
  // would each append a CALL_COMPLETED and double-count the campaign.
  const isTerminal =
    status === 'completed' || status === 'failed' || status === 'no_answer' ||
    status === 'busy' || status === 'cancelled';
  const alreadyFinalised = attempt.completedAt != null;

  const updated = await prisma.callAttempt.update({
    where: { id: attempt.id },
    data: {
      status,
      ...(outcome ? { outcome } : {}),
      ...(parsed.summary ? { summary: parsed.summary } : {}),
      ...(parsed.transcript != null ? { transcript: parsed.transcript as Prisma.InputJsonValue } : {}),
      ...(parsed.recordingUrl ? { recordingUrl: parsed.recordingUrl } : {}),
      ...(parsed.durationSec != null ? { durationSec: parsed.durationSec } : {}),
      answered: parsed.answered || attempt.answered,
      ...(parsed.providerCallId && !attempt.providerCallId ? { providerCallId: parsed.providerCallId } : {}),
      ...(isTerminal && !alreadyFinalised ? { completedAt: new Date() } : {}),
      ...(parsed.errorReason ? { error: parsed.errorReason } : {}),
      rawPayload: raw as Prisma.InputJsonValue,
    },
  });

  // Record the timeline entry exactly once per call, on the first event that
  // ends it. Ello fires call.completed and then call.processed for the same
  // call, so an unguarded write would append two entries and double the
  // campaign counters. Later events still update the row above (recording url,
  // transcript, insights) — they just don't re-emit.
  if (isTerminal && !alreadyFinalised) {
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
