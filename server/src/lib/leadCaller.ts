/**
 * WS5c — automatic outreach call after a website lead.
 *
 * The brief: a visitor submits the "check your rate" form and, about a minute
 * later, the voice agent calls them and continues the conversation the website
 * already started.
 *
 * Runs as a job rather than inline on form submit so a slow or failing provider
 * can never delay the visitor's own request, and so a crash between the two
 * cannot lose the call — the lead is durable in the database and the next tick
 * picks it up.
 */
import { prisma } from './prisma.js';
import { placeCall } from './dialer.js';
import { localParts } from './campaignSchedule.js';
import { buildLeadCallContext, compactContext } from './callContext.js';
import { agentIdFor } from './agents.js';

/**
 * The agent that handles website-lead callbacks.
 *
 * Resolved per call rather than cached so an operator can point the flow at a
 * different agent from the dashboard without a restart.
 */
async function leadCallbackAgentId(): Promise<string | null> {
  return agentIdFor('leadCallback');
}

const ENABLED = (process.env.LEAD_AUTOCALL_ENABLED ?? 'true') !== 'false';
/** How long after the form submit to call. The brief asks for ~1 minute. */
const DELAY_MINUTES = Number(process.env.LEAD_CALL_DELAY_MINUTES ?? 1) || 1;
/** Calling hours, minutes from local midnight. Default 09:00–21:00 IST. */
/**
 * Minutes from local midnight.
 *
 * NOT `Number(x) || default` — 0 is a legitimate value (midnight) and falsy, so
 * that form silently ignored `LEAD_CALL_WINDOW_START=0` and snapped back to 09:00.
 * The docs three lines below tell you to set exactly that to disable the window,
 * so the bug made its own instructions not work.
 */
function minuteEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1439 ? n : fallback;
}

const WINDOW_START = minuteEnv('LEAD_CALL_WINDOW_START', 540);
const WINDOW_END = minuteEnv('LEAD_CALL_WINDOW_END', 1260);
const TIMEZONE = process.env.LEAD_CALL_TIMEZONE ?? 'Asia/Kolkata';
/** Cap per tick so one bad batch cannot dial a whole table. */
const MAX_PER_TICK = 25;
/**
 * Spend ceiling. `/api/context/create` is public, so without a global cap a
 * scripted form-spam run turns directly into a telephony bill and a stream of
 * calls to people who never asked. Breaching it is an incident, so it logs
 * loudly rather than failing quietly.
 */
const MAX_CALLS_PER_HOUR = Number(process.env.LEAD_CALL_MAX_PER_HOUR ?? 60) || 60;
/**
 * One automatic call per phone number per this many hours.
 *
 * NOT `Number(x) || 24` — 0 is a legitimate value (disable the cooldown, which
 * is what you want while testing the form end to end) and is falsy, so that
 * form silently snapped back to 24h and made the feature untestable. Same trap
 * as the calling-window envs above.
 */
function hoursEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const PER_PHONE_COOLDOWN_HOURS = hoursEnv('LEAD_CALL_PHONE_COOLDOWN_HOURS', 24);

/**
 * Whether we may call right now.
 *
 * India's TRAI telemarketing rules restrict when a customer may be called, and
 * a lending product calling someone at 3am is a complaint waiting to happen —
 * so a lead submitted at night is held until the window opens rather than
 * dialled immediately. Set LEAD_CALL_WINDOW_START=0 / _END=1439 to disable.
 */
export function withinCallingHours(now: Date = new Date()): boolean {
  const { minutes } = localParts(now, TIMEZONE);
  return WINDOW_START <= WINDOW_END
    ? minutes >= WINDOW_START && minutes < WINDOW_END
    : minutes >= WINDOW_START || minutes < WINDOW_END;
}

/**
 * Find website leads that are due a first call and dial them.
 *
 * Eligibility is deliberately strict: still at `lead_captured` (so anyone who
 * already progressed or was contacted is skipped), old enough, has a phone, and
 * has never had a call attempted. That last check is what makes the job safe to
 * run every minute — it is the idempotency guard.
 */
export async function leadAutoCaller(now: Date = new Date()): Promise<number> {
  if (!ENABLED) return 0;
  if (!withinCallingHours(now)) return 0;

  const dueBefore = new Date(now.getTime() - DELAY_MINUTES * 60_000);
  const hourAgo = new Date(now.getTime() - 3_600_000);

  // Global hourly ceiling, counted from what was actually dialled rather than
  // an in-memory tally, so a restart cannot reset it.
  const lastHour = await prisma.callAttempt.count({ where: { queuedAt: { gte: hourAgo } } });
  const budget = MAX_CALLS_PER_HOUR - lastHour;
  if (budget <= 0) {
    console.error(
      `[lead-call] HOURLY CAP HIT — ${lastHour} calls in the last hour (limit ${MAX_CALLS_PER_HOUR}). ` +
        'Holding new calls. Investigate for form spam, or raise LEAD_CALL_MAX_PER_HOUR.',
    );
    return 0;
  }

  // Eligibility is per SUBMISSION, not per lifetime.
  //
  // This used to require `calls: { none: {} }` — "never had a call attempted" —
  // and measure the delay from `firstSeenAt`. Both were wrong for anyone who had
  // ever been called before: a returning visitor who submits the form again was
  // skipped FOREVER, silently. In testing that looks like "the form no longer
  // triggers a call"; in production it means a real lead who enquires again in
  // six months is never called back.
  //
  // `stageEnteredAt` is the moment they (re-)entered `lead_captured`, i.e. this
  // submission — so the delay is measured from the submission, and "have we
  // already called about THIS one" is a comparison against it. Per-number spam
  // is still prevented by the cooldown below.
  const candidates = await prisma.customer.findMany({
    where: {
      currentStage: 'lead_captured',
      phone: { not: null },
    },
    orderBy: { lastActivityAt: 'asc' },
    take: Math.min(MAX_PER_TICK, budget) * 4, // over-fetch; most are filtered out below
    include: {
      // Prisma cannot compare two columns of the same row in a filter, so both
      // the delay and the "already called about this one" test are done in code.
      calls: { orderBy: { queuedAt: 'desc' }, take: 1, select: { queuedAt: true } },
      // The submission itself. NOT stageEnteredAt: that only moves on a FORWARD
      // stage change (see recordJourneyEvent), so a returning visitor who is
      // already at `lead_captured` re-submits the form and stageEnteredAt keeps
      // its original value — making every repeat submission look like the first
      // one, which is exactly how this went unnoticed. The JourneyEvent row is
      // always written, so it is the honest record of "they submitted again".
      events: {
        where: { name: 'lead_captured' },
        orderBy: { occurredAt: 'desc' },
        take: 1,
        select: { occurredAt: true },
      },
    },
  });

  const leads = candidates
    .filter((c) => {
      const submittedAt = c.events[0]?.occurredAt ?? c.stageEnteredAt;
      if (submittedAt > dueBefore) return false; // not old enough yet
      const lastCall = c.calls[0]?.queuedAt;
      return !lastCall || lastCall < submittedAt; // not yet called about THIS one
    })
    .slice(0, Math.min(MAX_PER_TICK, budget));

  console.log(
    `[lead-call] tick: ${candidates.length} candidate(s) @ lead_captured, ${leads.length} eligible after age/already-called filter (dueBefore=${dueBefore.toISOString()}); phones=${JSON.stringify(leads.map((l) => l.phone))}`,
  );

  const cooldownSince = new Date(now.getTime() - PER_PHONE_COOLDOWN_HOURS * 3_600_000);

  let placed = 0;
  for (const lead of leads) {
    // Per-phone cooldown. `calls: { none: {} }` above already excludes anyone
    // this Customer row has called, but the same human can arrive as a second
    // Customer (different email, say) — this catches that by number.
    const recent = await prisma.callAttempt.count({
      where: { phone: lead.phone!, queuedAt: { gte: cooldownSince } },
    });
    if (recent > 0) {
      console.log(`[lead-call] ${lead.phone}: SKIP — ${recent} call(s) within cooldown (${PER_PHONE_COOLDOWN_HOURS}h)`);
      continue;
    }

    try {
      // The whole point of the ~1-minute delay is that the call lands while the
      // visit is still fresh, so the agent must open with what they just typed.
      // These variables are what make that possible — see lib/callContext.ts.
      const context = compactContext(
        await buildLeadCallContext(lead, { purpose: 'website_lead_followup', now }),
      );

      const result = await placeCall({
        customerId: lead.id,
        phone: lead.phone!,
        // Prefer the agent dedicated to website callbacks; falls back to the
        // workspace default when that id is not configured yet.
        assistantId: await leadCallbackAgentId(),
        metadata: {
          ...context,
          // Kept for the admin UI and older log readers, which look for these.
          name: lead.name ?? undefined,
          reason: 'website_lead_followup',
        },
      });
      if (result.ok) {
        placed++;
        console.log(`[lead-call] ${lead.phone}: PLACED ok — status=${result.attempt?.status} providerCallId=${result.attempt?.providerCallId ?? '-'}`);
      } else {
        console.warn(`[lead-call] ${lead.phone}: FAILED — ${result.error}`);
      }
    } catch (e) {
      console.error('[lead-call] failed for', lead.id, e);
    }
  }

  if (placed) console.log(`[lead-call] placed ${placed} follow-up call(s)`);
  return placed;
}
