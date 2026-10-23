/**
 * Scheduled lender status poller. Every tick (while inside the configured
 * window) it pulls the latest status from the lender for each in-progress loan
 * application that hasn't been checked within the configured interval.
 *
 * Both knobs are live-configurable from Admin → Timings (read each tick):
 *   • status.pollEveryMinutes — how often each application is polled (default 120 = 2h)
 *   • status.windowStart / status.windowEnd — the daily window in IST (default 9am–7pm)
 *
 * Only applications that actually have a lender lead to query are polled
 * (leadId set) and only while still in progress (handoff / under_review);
 * approved / rejected / disbursed / closed / failed are terminal and skipped.
 */
import type { ApplicationStatus } from '@prisma/client';
import { prisma } from './prisma.js';
import { timing } from './timings.js';
import { refreshApplicationStatus } from './statusRefresh.js';
import { scoped } from './log.js';

const log = scoped('status-poll');

const POLL_STATUSES: ApplicationStatus[] = ['handoff', 'under_review'];
const BATCH = 40; // cap per tick so the lender is never hammered

/** IST minutes-after-midnight (the platform's business timezone). */
function istMinutes(now: Date): number {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** Is `now` inside the configured status-poll window (9am–7pm IST by default)? */
export function withinStatusPollHours(now: Date = new Date()): boolean {
  const m = istMinutes(now);
  const start = timing.num('status.windowStart');
  const end = timing.num('status.windowEnd');
  return start <= end ? m >= start && m < end : m >= start || m < end;
}

export async function statusPoller(): Promise<void> {
  if (!withinStatusPollHours()) return; // overnight / outside the window: skip
  const cutoff = new Date(Date.now() - timing.minutesMs('status.pollEveryMinutes'));
  const due = await prisma.loanApplication.findMany({
    where: {
      status: { in: POLL_STATUSES },
      leadId: { not: null },
      OR: [{ lastStatusCheckedAt: null }, { lastStatusCheckedAt: { lt: cutoff } }],
    },
    orderBy: { lastStatusCheckedAt: { sort: 'asc', nulls: 'first' } },
    select: { id: true },
    take: BATCH,
  });
  if (!due.length) return;
  log.info('polling due applications', { count: due.length });
  for (const a of due) {
    try {
      await refreshApplicationStatus(a.id);
    } catch (e) {
      log.warn('poll failed', { applicationId: a.id, error: (e as Error).message });
    }
  }
}
