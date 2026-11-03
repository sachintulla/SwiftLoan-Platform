/**
 * Drop-off call on the following evenings (Admin → Timings → Lead calls, `calls.inactive*`). Someone with an unfinished loan journey
 * (`deriveDropoff` — the same stored data the WhatsApp journey reads) who has done NOTHING since they stopped gets one call from the
 * Ello `leadCallback` agent at `calls.inactiveCallAt` (8:00 PM IST) on each of the next `calls.inactiveDays` (3) days: tomorrow, the day
 * after, and the day after that. The agent opens with "you left this yesterday / N days ago" and asks why. Any action ends it (the anchor
 * is their last action, from `lastActivityFor`). Pure rules: inactiveCallRules.ts.
 *
 * Guard rails, same as every other dialler: its own switch (`calls.inactiveEnabled`, OFF by default: nothing dialled, nothing recorded) plus
 * the master `calls.nudgeEnabled` and the call test-number list (callGate.ts), calling hours, the quiet gap after a message, do-not-contact,
 * a daily cap (`calls.inactiveDailyLimit`), and the `OutboundRequest` claim (kind `inactive_call`, key `inactive:<customerId>:<YYYY-MM-DD>`,
 * one per person per day) written BEFORE dialling so a crash can never double-ring. A failed dial keeps its claim: no retry that day.
 */
import { prisma } from './prisma.js';
import { placeCall } from './dialer.js';
import { phoneCooldownHours, withinCallingHours } from './leadCaller.js';
import { isPhoneInCooldown } from './callThrottle.js';
import { buildLeadCallContext, compactContext } from './callContext.js';
import { agentIdFor } from './agents.js';
import { isCallAllowed } from './callGate.js';
import { isReviewPhone } from './reviewLogin.js';
import { JOURNEY_EVENTS, recordJourneyEvent } from './journey.js';
import { scoped } from './log.js';
import { timing } from './timings.js';
import { istDateKey, istDayStart } from './stallCallLimits.js';
import { DROPOFF_STEP_LABELS, deriveDropoff, type DropoffStatus } from './dropoffSteps.js';
import { lastActivityFor, loadSnapshot } from './appDropoff.js';
import { inactiveBrief, inactiveCallDue } from './inactiveCallRules.js';

const log = scoped('inactive-call');
const BATCH = 25;
export const INACTIVE_KIND = 'inactive_call';

export interface InactiveTickResult { placed: number; skipped: number }

export async function inactiveCallTick(now: Date = new Date()): Promise<InactiveTickResult | null> {
  if (!timing.bool('calls.inactiveEnabled')) return null;
  if (!withinCallingHours(now)) return null;
  const out: InactiveTickResult = { placed: 0, skipped: 0 };

  const limit = timing.num('calls.inactiveDailyLimit');
  let today = await prisma.outboundRequest.count({ where: { kind: INACTIVE_KIND, createdAt: { gte: istDayStart(now) } } });
  if (limit > 0 && today >= limit) return out;

  const days = timing.num('calls.inactiveDays');
  const callAt = timing.num('calls.inactiveCallAt');
  const quietSince = new Date(now.getTime() - timing.minutesMs('calls.quietAfterMessageMinutes'));
  // Candidates: stopped at least a day ago (India days) and at most `days` days ago. `lastActivityAt` is a lower bound for the real last
  // action (app events and website pings are also read below), so the window is widened by a day on each side and the rules decide.
  const dayStart = istDayStart(now);
  const rows = await prisma.customer.findMany({
    where: {
      userId: { not: null }, currentStage: { notIn: ['lost', 'disbursed'] },
      lastActivityAt: { lt: dayStart, gte: new Date(dayStart.getTime() - (days + 1) * 86_400_000) },
    },
    orderBy: { lastActivityAt: 'asc' },
    take: BATCH,
  });

  for (const c of rows) {
    if (limit > 0 && today >= limit) break;
    try {
      const loaded = c.userId ? await loadSnapshot(c.userId) : null;
      const state = loaded ? deriveDropoff(loaded.snapshot) : null;
      const status = state?.status ?? null;
      // The clock's floor is when they reached the step, NEVER `Customer.lastActivityAt`: old rows of that column were bumped by our own
      // nudges (2026-11-03: with it as the floor, 135 weeks-old rejections looked like "stopped yesterday" and would all have been rung).
      const stoppedAt = c.userId && state?.since ? await lastActivityFor(c.userId, c.phone, state.since) : null;
      if (!stoppedAt) { out.skipped++; continue; }
      const key = `inactive:${c.id}:${istDateKey(now)}`;
      const [calledToday, messagedRecently] = await Promise.all([
        prisma.outboundRequest.count({ where: { idempotencyKey: key } }),
        prisma.outboundRequest.count({ where: { customerId: c.id, channel: { in: ['push', 'sms', 'whatsapp'] }, createdAt: { gte: quietSince } } }),
      ]);
      const verdict = inactiveCallDue({
        stoppedAt, now, callAtMinute: callAt, days, status,
        calledToday: calledToday > 0, messagedRecently: messagedRecently > 0,
        inCallingHours: true, callAllowed: isCallAllowed(c.phone) && !isReviewPhone(c.phone),
        doNotContact: c.currentStage === 'lost', dailyLimitReached: limit > 0 && today >= limit,
      });
      if (!verdict.due || !status || status === 'finished' || status === 'failed') { out.skipped++; continue; }
      // Same 24 h per-phone cooldown as every other dialler: someone who spoke to the agent this morning (no-offers call) is not rung
      // again this evening by a different job.
      if (await isPhoneInCooldown(c.phone, phoneCooldownHours(), now)) { out.skipped++; continue; }

      try {
        await prisma.outboundRequest.create({
          data: { customerId: c.id, channel: 'voice', kind: INACTIVE_KIND, idempotencyKey: key, status: 'sent', payload: { status, day: verdict.day, stoppedAt: stoppedAt.toISOString() } },
        });
      } catch { out.skipped++; continue; } // another worker claimed it
      today++;

      const brief = inactiveBrief(status, verdict.day, DROPOFF_STEP_LABELS[status as DropoffStatus]);
      const context = compactContext(await buildLeadCallContext(c, {
        purpose: 'inactive_followup', now,
        stall: { reason: brief.reason, lastStep: brief.lastStep, expectedStep: brief.expectedStep, minutes: Math.round((now.getTime() - stoppedAt.getTime()) / 60_000), channel: 'the app or website', help: brief.help },
      }));
      const result = await placeCall({
        customerId: c.id, phone: c.phone, assistantId: await agentIdFor('leadCallback'),
        metadata: { ...context, reason: 'inactive_followup', days_inactive: String(verdict.day) },
      });
      if (!result.ok) {
        await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: result.error ?? null } }).catch(() => undefined);
        log.warn('call failed', { id: c.id, error: result.error });
        out.skipped++;
        continue;
      }
      await recordJourneyEvent(c.id, {
        channel: 'system', name: JOURNEY_EVENTS.NUDGE_SENT,
        metadata: { via: 'voice_call', reason: 'inactive_followup', dayAfterStop: verdict.day, callAttemptId: result.attempt.id },
        mirrorTelemetry: false,
      }).catch(() => undefined);
      out.placed++;
    } catch (e) {
      log.error('drop-off call failed for one person', { id: c.id, error: (e as Error).message });
    }
  }
  if (out.placed) log.info('tick', { ...out });
  return out;
}

let lastThrottledRun = 0;
export async function inactiveCallTickThrottled(nowMs: number = Date.now()): Promise<InactiveTickResult | null> {
  if (nowMs - lastThrottledRun < timing.minutesMs('install.jobEveryMinutes') - 5_000) return null;
  lastThrottledRun = nowMs;
  return inactiveCallTick(new Date(nowMs));
}
