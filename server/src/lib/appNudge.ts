import { prisma } from './prisma.js';
import { nudgeCustomer } from './dispatch.js';
import { TERMINAL_STAGES } from './journey.js';
import { scoped } from './log.js';

const log = scoped('app-nudge');

// A stall on these app screens is actionable — worth an outbound follow-up.
// A plain 'idle' nudge only raises an admin alert (no call/SMS).
const ACTIONABLE = new Set(['dropoff_apply', 'eligible_no_apply']);

// Never contact the same customer more than once per window (mirrors the
// stageStallDetector cooldown so the two paths don't double-nudge).
const NUDGE_COOLDOWN_MINUTES = 30;

/**
 * The mobile app fired a proactive-help nudge (the user stalled — idle, dropped
 * off mid-apply, or eligible but hasn't applied). Backend follow-up:
 *   1. raise an admin-dashboard Notification (deduped while unread), and
 *   2. for actionable stalls, expedite an outbound contact (callback/SMS) via
 *      the dispatch queue — respecting the per-customer nudge cooldown so we
 *      never spam, and skipping terminal (converted/rejected/lost) customers.
 *
 * Fire-and-forget: this must never throw into the /track/event request path.
 */
export async function handleAppNudge(
  userId: string,
  reason: string,
  screen: string | null,
  label?: string,
): Promise<void> {
  try {
    // 1) Admin alert (one open notification per user at a time).
    const open = await prisma.notification.findFirst({ where: { type: 'app_nudge', entityId: userId, read: false } });
    if (!open) {
      await prisma.notification.create({
        data: {
          type: 'app_nudge',
          entityId: userId,
          title: 'User needs help',
          body: `Stalled on "${screen ?? 'app'}" (${reason})${label ? ` — “${label}”` : ''}`,
          severity: 'warning',
        },
      });
    }

    // 2) Expedited outbound follow-up for actionable stalls only.
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
