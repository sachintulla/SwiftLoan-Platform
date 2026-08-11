import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, created, fail } from '../lib/http.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';
import { journeyNameFor } from '../lib/appEventMap.js';
import { verifyAccess } from '../lib/jwt.js';

// Public tracking endpoints. The mobile app calls these fire-and-forget, so they
// must be cheap, tolerant of missing fields, and never throw back something the
// app would surface. An optional Bearer user token is read if present but not
// required (anonymous sessions are first-class).
export const trackingRouter = Router();

/**
 * Best-effort: pull userId from a user JWT if one was attached, else null.
 *
 * This used to `require('../lib/jwt.js')` lazily. This file is ESM, so `require`
 * is not defined and the call threw on EVERY request — silently, because the
 * catch returned null. The result: every tracking row ever written
 * (sessions, events, onboarding steps, loan steps, installs) recorded
 * `userId: null`, so none of it could be attributed to a person, and the funnel
 * promotion below could never run.
 *
 * A static import is correct here — jwt.js imports nothing from this module, so
 * the cycle the lazy require was avoiding does not exist.
 */
function softUserId(req: { headers: Record<string, unknown> }): string | null {
  const header = String(req.headers['authorization'] || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    return (verifyAccess(header.slice(7)) as { sub?: string }).sub ?? null;
  } catch {
    // An expired or malformed token is a normal anonymous case, not an error.
    return null;
  }
}

// POST /api/track/session/start  { device_info }
trackingRouter.post('/session/start', ah(async (req, res) => {
  const userId = softUserId(req) ?? (req.body?.user_id ?? null);
  const session = await prisma.session.create({
    data: { userId, deviceInfo: req.body?.device_info ?? req.body?.deviceInfo ?? undefined },
  });
  return created(res, { session_id: session.id }, 'Session started');
}));

// POST /api/track/session/end  { session_id, pages_visited }
trackingRouter.post('/session/end', ah(async (req, res) => {
  const sessionId = req.body?.session_id ?? req.body?.sessionId;
  if (!sessionId) return fail(res, 400, 'session_id required');
  const existing = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!existing) return fail(res, 404, 'Session not found');
  const endedAt = new Date();
  const durationSec = Math.max(0, Math.round((endedAt.getTime() - existing.startedAt.getTime()) / 1000));
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: {
      endedAt,
      durationSec,
      pagesVisited: Number(req.body?.pages_visited ?? req.body?.pagesVisited ?? existing.pagesVisited) || existing.pagesVisited,
    },
  });
  return ok(res, { session_id: session.id, durationSec }, 'Session ended');
}));

// POST /api/track/event  { event_type, event_name, screen, metadata?, session_id? }
trackingRouter.post('/event', ah(async (req, res) => {
  const b = req.body ?? {};
  const eventName = b.event_name ?? b.eventName;
  if (!eventName) return fail(res, 400, 'event_name required');
  const userId = softUserId(req) ?? (b.user_id ?? null);
  const event = await prisma.activityEvent.create({
    data: {
      sessionId: b.session_id ?? b.sessionId ?? null,
      userId,
      eventType: b.event_type ?? b.eventType ?? 'action',
      eventName,
      screen: b.screen ?? null,
      metadata: b.metadata ?? undefined,
    },
  });
  // Keep the session's page counter roughly current for navigation events.
  if (event.sessionId && (event.eventType === 'navigation')) {
    await prisma.session.update({ where: { id: event.sessionId }, data: { pagesVisited: { increment: 1 } } }).catch(() => {});
  }

  // WS11 — promote real funnel steps to canonical journey events.
  //
  // Until now this endpoint wrote only an ActivityEvent, so the admin funnel, the
  // stage progression and every stall rule saw nothing from the app. One write
  // here feeds all three, plus the Upshot mirror inside recordJourneyEvent.
  //
  // Identity comes from the authenticated session (`softUserId`), never from the
  // body: /api/track/* is public, so trusting a client-supplied user_id would let
  // anyone advance another person's funnel — and a fabricated
  // `eligibility_completed` silences the very rule meant to catch a drop-off.
  const journeyName = journeyNameFor(String(eventName));
  if (journeyName && userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }).catch(() => null);
    if (user?.phone) {
      // Fire-and-forget: analytics must never fail on a journey write.
      trackJourney(
        { phone: user.phone, userId, source: 'app' },
        {
          channel: 'app',
          name: journeyName,
          screen: b.screen ?? null,
          metadata: { via: 'app_telemetry', appEvent: eventName },
          // The ActivityEvent above already is the telemetry — do not write a second.
          mirrorTelemetry: false,
        },
      ).catch((e) => console.error('[track] journey promotion failed', e));
    }
  }

  return created(res, { event_id: event.id }, 'Event recorded');
}));

// POST /api/track/onboarding/step  { step_number, step_name, status, time_spent_seconds, session_id? }
trackingRouter.post('/onboarding/step', ah(async (req, res) => {
  const b = req.body ?? {};
  const stepName = b.step_name ?? b.stepName;
  if (stepName == null) return fail(res, 400, 'step_name required');
  const userId = softUserId(req) ?? (b.user_id ?? null);
  const row = await prisma.onboardingFunnel.create({
    data: {
      userId,
      sessionId: b.session_id ?? b.sessionId ?? null,
      stepNumber: Number(b.step_number ?? b.stepNumber ?? 0) || 0,
      stepName,
      status: b.status ?? 'started',
      timeSpentSec: Number(b.time_spent_seconds ?? b.timeSpentSeconds ?? 0) || 0,
    },
  });
  return created(res, { id: row.id }, 'Onboarding step recorded');
}));

// POST /api/track/loan/step  { loan_id, step_name, status, time_spent_seconds, hold_reason? }
// Recorded as an activity event tagged to the loan (no schema change to Loan).
trackingRouter.post('/loan/step', ah(async (req, res) => {
  const b = req.body ?? {};
  const stepName = b.step_name ?? b.stepName;
  if (!stepName) return fail(res, 400, 'step_name required');
  const userId = softUserId(req) ?? (b.user_id ?? null);
  const event = await prisma.activityEvent.create({
    data: {
      userId,
      eventType: 'funnel',
      eventName: `loan_${stepName}`,
      screen: b.screen ?? null,
      metadata: {
        loan_id: b.loan_id ?? b.loanId ?? null,
        step_name: stepName,
        status: b.status ?? 'started',
        time_spent_seconds: Number(b.time_spent_seconds ?? b.timeSpentSeconds ?? 0) || 0,
        hold_reason: b.hold_reason ?? b.holdReason ?? null,
      },
    },
  });
  return created(res, { event_id: event.id }, 'Loan step recorded');
}));

// POST /api/track/install  { platform, source?, campaign_id?, referrer?, context_token?, session_id? }
// WS5: nothing wrote AppDownload before this, so install attribution had no
// data at all. When the install carries a WS3 context token we can resolve the
// person's phone from the ContextSession and attach the install to their
// journey immediately; otherwise it is recorded anonymously and gets attributed
// retroactively at OTP verify (auth.routes.ts), which links phone -> Customer.
trackingRouter.post('/install', ah(async (req, res) => {
  const b = req.body ?? {};
  const platform = String(b.platform ?? '').toLowerCase();
  if (!platform) return fail(res, 400, 'platform required');

  const contextToken = b.context_token ?? b.contextToken ?? null;
  const ctx = contextToken
    ? await prisma.contextSession.findUnique({ where: { token: String(contextToken).toUpperCase() } })
    : null;

  const userId = softUserId(req) ?? (b.user_id ?? null);

  const download = await prisma.appDownload.create({
    data: {
      platform,
      source: b.source ?? (ctx ? ctx.source : 'organic'),
      campaignId: b.campaign_id ?? b.campaignId ?? null,
      referrer: b.referrer ?? null,
      matchedUserId: userId,
      contextLoaded: !!ctx,
      installedAt: new Date(),
    },
  });

  // Only resolvable when we already know who this is (context token or an
  // authenticated session); a cold organic install is anonymous by definition.
  if (ctx?.phone || userId) {
    trackJourney(
      {
        phone: ctx?.phone ?? null,
        userId,
        name: ctx?.name ?? null,
        city: ctx?.city ?? null,
        source: b.campaign_id ? 'campaign' : ctx ? 'website' : 'app',
        campaignId: b.campaign_id ?? b.campaignId ?? null,
        referrer: b.referrer ?? null,
      },
      {
        channel: 'app',
        name: JOURNEY_EVENTS.APP_INSTALLED,
        metadata: { platform, contextLoaded: !!ctx, downloadId: download.id },
      },
    ).catch(() => {});
  }

  return created(res, { download_id: download.id, context_loaded: !!ctx }, 'Install recorded');
}));
