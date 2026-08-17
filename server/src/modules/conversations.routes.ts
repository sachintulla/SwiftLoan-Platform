/**
 * WS10 — the agent-facing conversation memory API. Mounted at /api/conversations.
 *
 * Two calls, and every agent (phone, website, in-app) makes both:
 *
 *   GET  /api/conversations/context?phone=…   before it starts talking
 *   POST /api/conversations                   when it finishes
 *
 * This is what makes the four surfaces feel like one company rather than four
 * strangers.
 *
 * Auth: shared secret in `x-api-key` (or `x-webhook-secret`, so Ello can reuse the
 * value it already has). Not admin-JWT, because Ello's servers and the in-app
 * agent call these directly and have no admin session.
 *
 * SECURITY: `GET /context` returns a person's loan history for any phone number
 * given to it. That makes the secret the only thing standing between a caller and
 * a customer-data lookup, so unlike the webhook routes this one is NEVER allowed
 * to run unauthenticated — including in development.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { normalisePhone } from '../lib/dialer.js';
import {
  recordConversation, getConversationContext, isConversationChannel,
  CONVERSATION_CHANNELS,
} from '../lib/conversations.js';
import { mapOutcome } from './webhooks.routes.js';
import { recordJourneyEvent, JOURNEY_EVENTS } from '../lib/journey.js';
import { verifyApiKey } from '../lib/apiKeys.js';
import { scoped } from '../lib/log.js';

const log = scoped('conversations');

export const conversationsRouter = Router();

/**
 * Two ways to authenticate, checked in order:
 *   1. A named key minted from the admin dashboard (see apiKeys.routes.ts) —
 *      the preferred path: revocable per-caller, without a redeploy.
 *   2. The legacy static env var (CONVERSATION_API_KEY / ELLO_WEBHOOK_SECRET)
 *      — kept so an already-deployed Ello tool config using the old secret
 *      keeps working during rollout; not required once every caller has its
 *      own admin-issued key.
 */
async function authorised(req: import('express').Request): Promise<boolean> {
  const provided =
    String(req.headers['x-api-key'] ?? '') ||
    String(req.headers['x-webhook-secret'] ?? '');
  if (!provided) return false;

  if (await verifyApiKey(provided)) return true;

  const expected = process.env.CONVERSATION_API_KEY || process.env.ELLO_WEBHOOK_SECRET || '';
  return !!expected && provided === expected;
}

conversationsRouter.use(ah(async (req, res, next) => {
  if (await authorised(req)) return next();

  // Distinguish "nobody has ever configured this" from "wrong key" — the
  // former is a deploy/setup bug worth a loud, distinct error rather than
  // looking like a caller with a bad credential.
  const envConfigured = !!(process.env.CONVERSATION_API_KEY || process.env.ELLO_WEBHOOK_SECRET);
  if (!envConfigured && (await prisma.apiKey.count({ where: { revokedAt: null } })) === 0) {
    log.error('no admin-issued API key and no CONVERSATION_API_KEY / ELLO_WEBHOOK_SECRET set — refusing', { path: req.path });
    return fail(res, 503, 'Conversation API is not configured');
  }
  log.warn('rejected — invalid or missing API key', { path: req.path, method: req.method });
  return fail(res, 401, 'Invalid or missing API key');
}));

/**
 * GET /api/conversations/context?phone=9876500011&limit=8
 *
 * The call an agent makes BEFORE it speaks. Returns the rolling brief plus the
 * recent conversations, newest first.
 */
conversationsRouter.get('/context', ah(async (req, res) => {
  const phone = String(req.query.phone ?? '');
  if (!phone) return fail(res, 400, 'phone is required');

  const limit = Number(req.query.limit ?? 8);
  const ctx = await getConversationContext(phone, Number.isFinite(limit) ? limit : 8);

  log.info('get_customer_history (GET)', { phone, known: ctx.known });
  // 200 with known:false — a first-time caller is a normal case, not an error, and
  // an agent must not treat it as a failure.
  return ok(res, ctx, ctx.known ? 'Context found' : 'No prior conversations');
}));

/**
 * POST /api/conversations/context   { phone, limit? }
 *
 * Identical to the GET above, but taking the number in the body.
 *
 * Exists because Ello's tool builder defines inputs as a request-body schema and
 * has no clean way to interpolate one into a query string. Making the lookup a
 * POST lets all three tools be configured the same way, which removes a whole
 * class of "the agent called it with an empty phone" misconfiguration.
 *
 * Still a read: nothing is written, so it is safe to retry.
 */
conversationsRouter.post('/context', ah(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const phone = String(b.phone ?? '');
  if (!phone) return fail(res, 400, 'phone is required');

  const rawLimit = Number(b.limit);
  const ctx = await getConversationContext(phone, Number.isFinite(rawLimit) ? rawLimit : 8);

  log.info('get_customer_history (POST)', { phone, known: ctx.known });
  // The two headline fields are ALSO mirrored at the top level.
  //
  // Ello's response mapper extracts by variable name, and it is not documented
  // whether it walks into nested objects. `data.brief` may therefore never be
  // found, and the agent would open every call with an empty history and no
  // error to show for it. Duplicating two short fields costs nothing and makes
  // the mapping work whether or not it can traverse.
  return res.json({
    success: true,
    brief: ctx.known ? ctx.brief : null,
    known: ctx.known,
    data: ctx,
    message: ctx.known ? 'Context found' : 'No prior conversations',
  });
}));

/**
 * POST /api/conversations
 *
 * The call an agent makes AFTER it finishes. Idempotent on
 * `provider_conversation_id`, so posting at both session-start and session-end
 * updates one row instead of creating two.
 */
conversationsRouter.post('/', ah(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, any>;

  const phone = normalisePhone(b.phone);
  if (!phone) return fail(res, 400, 'A valid 10-digit phone number is required');

  const channel = String(b.channel ?? '');
  if (!isConversationChannel(channel)) {
    return fail(res, 400, `channel must be one of: ${CONVERSATION_CHANNELS.join(', ')}`);
  }

  // Outcome is optional and deliberately strict: an unrecognised label becomes
  // `other` rather than being silently dropped, but a MISSING one stays null —
  // never guessed. An invented disposition drives wrong follow-up.
  const outcome = b.outcome ? mapOutcome(String(b.outcome)) : null;

  const durationSec = Number(b.duration_sec ?? b.durationSec);
  const startedAt = b.started_at ?? b.startedAt ? new Date(String(b.started_at ?? b.startedAt)) : undefined;
  const endedAt = b.ended_at ?? b.endedAt ? new Date(String(b.ended_at ?? b.endedAt)) : undefined;
  const valid = (d?: Date) => (d && !Number.isNaN(d.getTime()) ? d : undefined);

  try {
    const row = await recordConversation({
      phone,
      channel,
      agentRole: b.agent_role ?? b.agentRole ?? null,
      providerConversationId: b.provider_conversation_id ?? b.conversation_id ?? null,
      summary: b.summary ?? null,
      transcript: b.transcript ?? null,
      outcome,
      // Anything posted here came from the agent that held the conversation, so
      // it is authoritative — unlike our own transcript keyword-matching.
      outcomeSource: outcome ? 'agent' : null,
      details: b.details ?? null,
      recordingUrl: b.recording_url ?? b.recordingUrl ?? null,
      startedAt: valid(startedAt),
      endedAt: valid(endedAt) ?? null,
      durationSec: Number.isFinite(durationSec) ? Math.round(durationSec) : null,
    });

    // A refusal has to DO something, not merely be recorded.
    //
    // The dedicated /call-outcome-report route already ends the journey on
    // do_not_call. Without the same handling here, an agent configured with only
    // this one tool would log "do_not_call" while the auto-caller happily rang
    // them again — a compliance problem, not a data one.
    if (outcome === 'do_not_call' && row.customerId) {
      await recordJourneyEvent(row.customerId, {
        channel: 'voice',
        name: JOURNEY_EVENTS.CALL_COMPLETED,
        stage: 'lost',
        metadata: {
          conversationId: row.id,
          reportedBy: 'agent',
          outcome: 'do_not_call',
          note: 'customer asked not to be contacted again',
        },
      }).catch((e) => log.error('do_not_call stage write failed', { phone: row.phone, error: String(e) }));
      log.warn('marked do_not_call — outreach stopped', { phone: row.phone });
    }

    log.info('save_conversation', { phone, channel, outcome: outcome ?? null, id: row.id });
    return ok(
      res,
      {
        id: row.id,
        phone: row.phone,
        channel: row.channel,
        // Echoed so the agent can confirm the refusal was actually honoured.
        outreachStopped: outcome === 'do_not_call',
      },
      'Conversation recorded',
    );
  } catch (e) {
    log.error('save_conversation failed', { phone, error: (e as Error).message });
    return fail(res, 400, (e as Error).message);
  }
}));

/**
 * GET /api/conversations/summary?phone=…
 *
 * Just the brief, for an agent that wants one short string and nothing else.
 */
conversationsRouter.get('/summary', ah(async (req, res) => {
  const phone = normalisePhone(String(req.query.phone ?? ''));
  if (!phone) return fail(res, 400, 'A valid 10-digit phone number is required');

  const row = await prisma.conversationSummary.findUnique({ where: { phone } });
  return ok(
    res,
    {
      phone,
      known: !!row,
      brief: row?.summary ?? null,
      conversationCount: row?.conversationCount ?? 0,
      lastAt: row?.lastAt ?? null,
    },
    row ? 'Summary found' : 'No prior conversations',
  );
}));
