import { prisma } from './prisma.js';
import { nudgeCustomer } from './dispatch.js';
import { TERMINAL_STAGES } from './journey.js';
import { scoped } from './log.js';

const log = scoped('app-nudge');

// A stall on these app screens is actionable — worth an outbound follow-up.
// A plain 'idle' nudge gets no backend follow-up.
const ACTIONABLE = new Set(['dropoff_apply', 'eligible_no_apply']);

// Never contact the same customer more than once per window (mirrors the
// stageStallDetector cooldown so the two paths don't double-nudge).
const NUDGE_COOLDOWN_MINUTES = 30;

/**
 * The mobile app fired a proactive-help nudge (the user stalled — idle, dropped
 * off mid-apply, or eligible but hasn't applied). Backend follow-up: for
 * actionable stalls, expedite an outbound contact (callback/SMS) via the
 * dispatch queue — respecting the per-customer nudge cooldown so we never spam,
 * and skipping terminal (converted/rejected/lost) customers.
 *
 * It no longer raises an admin Notification ("User needs help"): 1,611 of them
 * piled up unread on production and nobody acted on one (removed 2026-11-23).
 *
 * Fire-and-forget: this must never throw into the /track/event request path.
 */
export async function handleAppNudge(
  userId: string,
  reason: string,
  screen: string | null,
  label?: string,
): Promise<void> {
  if (/^(1|true|yes)$/i.test(process.env.NUDGES_DISABLED ?? '')) return;
  try {
    // Expedited outbound follow-up for actionable stalls only.
    if (!ACTIONABLE.has(reason)) return;

    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) return;
    if (TERMINAL_STAGES.includes(customer.currentStage)) return;

    const cooldownBefore = new Date(Date.now() - NUDGE_COOLDOWN_MINUTES * 60_000);
    if (customer.lastNudgedAt && customer.lastNudgedAt > cooldownBefore) return; // still cooling down

    await nudgeCustomer(customer, customer.currentStage);
    await prisma.customer.update({ where: { id: customer.id }, data: { lastNudgedAt: new Date() } });
    log.info('expedited follow-up queued', { userId, reason, stage: customer.currentStage });
  } catch (e) {
    log.error('app nudge follow-up failed', { userId, reason, error: String(e) });
  }
}
