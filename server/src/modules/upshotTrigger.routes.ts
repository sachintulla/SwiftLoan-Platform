/**
 * WS12 — let an Upshot journey place an outbound call.
 *
 * The architecture this serves: every app/website event goes to Upshot, an Upshot
 * journey waits for the follow-up event ("entered phone → did the OTP verify
 * arrive?"), and when it does not, the journey calls THIS endpoint. Ello then
 * pulls the customer's status from us and speaks from it.
 *
 * That is a better split than deciding drop-offs in our own code: the waiting and
 * branching is what a journey builder is for, and ops can change it without a
 * deploy. Upshot cannot dial a phone, so this is the missing verb.
 *
 * CRITICAL: every guard is enforced HERE, not in the journey.
 *
 * Upshot knows nothing about India's calling-hour rules, our per-number cooldown,
 * or that a customer asked never to be contacted again. A journey misconfigured
 * at 2am, or one that loops, must not be able to ring a real person — so this
 * endpoint refuses rather than trusting its caller. It returns 200 with
 * `called: false` and a reason in that case, because a journey step that "fails"
 * would otherwise be retried.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { normalisePhone, placeCall } from '../lib/dialer.js';
import { resolveCustomer } from '../lib/journey.js';
import { withinCallingHours } from '../lib/leadCaller.js';
import { buildLeadCallContext, compactContext, stallReasonFor, stallHelpFor } from '../lib/callContext.js';
import { agentIdFor } from '../lib/agents.js';
import { scoped } from '../lib/log.js';

const log = scoped('upshot-journey');

export const upshotTriggerRouter = Router();

/** Same shared secret as the other agent-facing routes. */
function authorised(req: import('express').Request): boolean {
  const expected = process.env.CONVERSATION_API_KEY || process.env.ELLO_WEBHOOK_SECRET || '';
  if (!expected) return false;
  const provided =
    String(req.headers['x-api-key'] ?? '') || String(req.headers['x-webhook-secret'] ?? '');
  return provided.length > 0 && provided === expected;
}

/** One call per number per this many hours, across every source. */
const PHONE_COOLDOWN_HOURS = Number(process.env.STALL_CALL_PHONE_COOLDOWN_HOURS ?? 24) || 24;
/** Lifetime ceiling on journey-triggered calls to one person. */
const MAX_PER_CUSTOMER = Number(process.env.STALL_CALL_MAX_PER_CUSTOMER ?? 2) || 2;

/**
 * POST /api/webhooks/upshot/trigger-call
 *
 * Body (all snake_case, matching what a journey webhook step sends):
 *   phone          required — the customer's number
 *   last_step      optional — canonical event they completed, e.g. otp_requested
 *   expected_step  optional — the event that did not follow, e.g. otp_verified
 *   reason         optional — free text, used only when the steps are not given
 *   journey        optional — the Upshot journey name, for the audit trail
 *   idempotency_key optional — de-dupes a retried journey step
 */
upshotTriggerRouter.post('/trigger-call', ah(async (req, res) => {
  if (!authorised(req)) {
    const configured = !!(process.env.CONVERSATION_API_KEY || process.env.ELLO_WEBHOOK_SECRET);
    return fail(res, configured ? 401 : 503, configured ? 'Invalid or missing API key' : 'Not configured');
  }

  const b = (req.body ?? {}) as Record<string, any>;
  const phone = normalisePhone(b.phone);
  if (!phone) return fail(res, 400, 'A valid 10-digit phone number is required');

  const lastStep = String(b.last_step ?? b.lastStep ?? '').trim();
  const expectedStep = String(b.expected_step ?? b.expectedStep ?? '').trim();
  const journey = String(b.journey ?? b.journey_name ?? '').trim() || 'upshot_journey';

  const deny = (reason: string) => {
    log.warn('denied', { phone, journey, reason });
    return ok(res, { called: false, phone, reason }, reason);
  };

  // ── guards, in order of how bad it would be to get them wrong ──────────────

  const customer = await resolveCustomer({ phone, source: 'campaign' }).catch(() => null);
  if (!customer) return deny('Could not resolve a customer for that number');

  // A refusal outranks every journey. Someone who asked not to be contacted must
  // never be reachable by a marketing automation, however it is configured.
  if (customer.currentStage === 'lost') {
    return deny('Customer is marked do-not-call / lost — refusing');
  }

  if (!withinCallingHours(new Date())) {
    // Not an error: the journey did its job, the hour is simply wrong. Upshot can
    // re-enter the step later.
    return deny('Outside permitted calling hours (09:00–21:00 IST)');
  }

  const since = new Date(Date.now() - PHONE_COOLDOWN_HOURS * 3_600_000);
  const recent = await prisma.callAttempt.count({ where: { phone, queuedAt: { gte: since } } });
  if (recent > 0) return deny(`Already called within the last ${PHONE_COOLDOWN_HOURS}h`);

  const lifetime = await prisma.outboundRequest.count({
    where: { customerId: customer.id, kind: 'journey_call' },
  });
  if (lifetime >= MAX_PER_CUSTOMER) {
    return deny(`Already received ${lifetime} journey calls — lifetime cap reached`);
  }

  // Claim an idempotency key BEFORE dialling, so a retried journey step cannot
  // produce a second call.
  const key = String(b.idempotency_key ?? b.idempotencyKey ?? `journey:${journey}:${customer.id}:${new Date().toISOString().slice(0, 10)}`);
  try {
    await prisma.outboundRequest.create({
      data: {
        customerId: customer.id,
        channel: 'voice',
        kind: 'journey_call',
        idempotencyKey: key,
        status: 'sent',
        payload: { journey, lastStep, expectedStep, phone },
      },
    });
  } catch {
    return deny('This journey step has already triggered a call for this customer');
  }

  // ── build the context and dial ─────────────────────────────────────────────

  // When the journey names the steps we can use our own wording for that exact
  // drop-off; otherwise fall back to whatever free text it sent.
  const haveSteps = !!(lastStep && expectedStep);
  const stall = {
    reason: haveSteps
      ? stallReasonFor(lastStep, expectedStep)
      : String(b.reason ?? '').trim(),
    help: haveSteps
      ? stallHelpFor(lastStep, expectedStep)
      : 'ask what happened and offer to help them continue from where they stopped',
    lastStep: lastStep.replace(/_/g, ' '),
    expectedStep: expectedStep.replace(/_/g, ' '),
    minutes: Number(b.minutes_since ?? b.minutesSince) || 0,
    channel: lastStep.startsWith('lead_') ? 'the website' : 'the app',
  };

  const context = compactContext(
    await buildLeadCallContext(customer, { purpose: 'app_dropoff_followup', stall }).catch(
      () => ({}) as Record<string, string>,
    ),
  );

  const result = await placeCall({
    customerId: customer.id,
    phone,
    assistantId: await agentIdFor('leadCallback'),
    metadata: { ...context, reason: 'upshot_journey', journey },
  });

  if (!result.ok) {
    await prisma.outboundRequest
      .updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: result.error ?? null } })
      .catch(() => undefined);
    log.warn('call could not be placed', { phone, journey, error: result.error ?? null });
    // 200 again: the provider failed, but the journey step itself was valid and
    // retrying it would only produce another failed call.
    return ok(res, { called: false, phone, reason: result.error ?? 'provider error' }, 'Call could not be placed');
  }

  log.info('called', { phone, journey, lastStep: lastStep || null, expectedStep: expectedStep || null, callId: result.attempt.id });

  return ok(
    res,
    {
      called: true,
      phone,
      callId: result.attempt.id,
      journey,
      spokenReason: stall.reason || null,
    },
    'Call placed',
  );
}));
