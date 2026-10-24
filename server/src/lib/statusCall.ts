/**
 * Daily status call — rings each eligible customer once a day and tells them
 * where their SwiftLoan application stands and what to do next. Uses the same
 * Ello dialler, calling-hours and journey-event plumbing as the drop-off calls.
 *
 * Hard gates (all must pass; see callGate.ts):
 *   • calls.statusDailyEnabled  — this feature's own switch
 *   • calls.nudgeEnabled        — master outbound-call switch
 *   • calls.allowedNumbers      — while set, only those numbers ring (test mode)
 *   • calling hours             — never dial outside the window
 *   • one call per customer per IST day (idempotency key), do-not-contact skipped
 *
 * Runs as a job tick that works a bounded batch each minute, so even with the
 * whole customer table eligible it dials gently rather than all at once.
 */
import { prisma } from './prisma.js';
import { placeCall } from './dialer.js';
import { withinCallingHours } from './leadCaller.js';
import { buildLeadCallContext, compactContext } from './callContext.js';
import { agentIdFor } from './agents.js';
import { statusCallsEnabled, isCallAllowed } from './callGate.js';
import { JOURNEY_EVENTS, recordJourneyEvent } from './journey.js';

/** Most customers to dial in one tick — a safety ceiling, not a target. */
const BATCH = Number(process.env.STATUS_CALL_PER_TICK ?? 25) || 25;

/** IST day bucket (YYYY-MM-DD in Asia/Kolkata) so "once a day" means a calendar day here. */
function istDayKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Place one customer's daily status call. Returns true only if the provider accepted it. */
async function placeStatusCall(
  customer: { id: string; phone: string | null; name: string | null },
  dayKey: string,
  now: Date,
): Promise<boolean> {
  if (!isCallAllowed(customer.phone)) return false;
  if (!withinCallingHours(now)) return false;

  const idempotencyKey = `status:${customer.id}:${dayKey}`;

  // Claim BEFORE dialling so a crash between dial and write can't double-call.
  try {
    await prisma.outboundRequest.create({
      data: { customerId: customer.id, channel: 'voice', kind: 'status_call', idempotencyKey, status: 'sent', payload: { dayKey } },
    });
  } catch {
    return false; // already called today (unique violation)
  }

  const full = await prisma.customer.findUnique({ where: { id: customer.id } });
  if (!full) return false;

  const context = compactContext(await buildLeadCallContext(full, { purpose: 'daily_status_update', now }));

  const result = await placeCall({
    customerId: customer.id,
    phone: customer.phone!,
    assistantId: await agentIdFor('statusUpdate'),
    metadata: { ...context, reason: 'daily_status_update' },
  });

  if (!result.ok) {
    await prisma.outboundRequest.updateMany({ where: { idempotencyKey }, data: { status: 'failed', error: result.error ?? null } }).catch(() => undefined);
    console.warn(`[status-call] ${customer.phone}: ${result.error}`);
    return false;
  }

  await recordJourneyEvent(customer.id, {
    channel: 'system',
    name: JOURNEY_EVENTS.NUDGE_SENT,
    metadata: { via: 'voice_call', reason: 'daily_status_update', callAttemptId: result.attempt.id, dayKey },
    mirrorTelemetry: false,
  }).catch(() => undefined);

  console.log(`[status-call] called ${customer.phone} — daily status (${full.currentStage})`);
  return true;
}

/**
 * One tick of the daily status-call job. Finds eligible customers who have not
 * been called today and dials up to BATCH of them.
 */
export async function runDailyStatusCalls(now: Date = new Date()): Promise<{ placed: number; skipped: number }> {
  if (!statusCallsEnabled()) return { placed: 0, skipped: 0 };
  if (!withinCallingHours(now)) return { placed: 0, skipped: 0 };

  const dayKey = istDayKey(now);

  // Candidates: real customers with a verified phone, not do-not-contact, who
  // have not already been called today. Over-fetch a little so the per-phone
  // allowlist/skip doesn't starve a tick when a test list is set.
  const candidates = await prisma.customer.findMany({
    where: {
      phoneVerified: true,
      currentStage: { not: 'lost' }, // do-not-contact
    },
    select: { id: true, phone: true, name: true },
    take: BATCH * 4,
    orderBy: { updatedAt: 'desc' },
  });

  let placed = 0;
  let skipped = 0;
  for (const c of candidates) {
    if (placed >= BATCH) break;
    // Skip anyone already called today (cheap pre-check; the unique claim is the
    // real guard against races).
    const already = await prisma.outboundRequest.findUnique({
      where: { idempotencyKey: `status:${c.id}:${dayKey}` }, select: { id: true },
    });
    if (already) { skipped++; continue; }
    const ok = await placeStatusCall(c, dayKey, now);
    if (ok) placed++; else skipped++;
  }

  if (placed) console.log(`[status-call] tick: placed ${placed}, skipped ${skipped} (day ${dayKey})`);
  return { placed, skipped };
}
