import { prisma } from '../lib/prisma.js';
import type { ApplicationStatus } from '@prisma/client';

// Background maintenance jobs for WS4. These detect stalls in the funnel and raise
// admin Notifications. They run on a plain in-process interval by default; if a
// REDIS_URL is present they can be moved onto BullMQ (see startJobs).
//
// All jobs are best-effort and swallow their own errors so a transient DB blip
// never takes the API process down.

const STALE_LOAN_HOURS = 48; // application sitting in a non-terminal stage
const STALE_ONBOARDING_HOURS = 24; // onboarding started but not completed
const IDLE_SESSION_MINUTES = 30; // no events => consider the session ended

const NON_TERMINAL: ApplicationStatus[] = ['draft', 'pan_pending', 'prequalifying', 'offers_ready', 'handoff', 'under_review'];

// De-dupe notifications so the same stall doesn't spam the feed.
async function notifyOnce(type: string, entityId: string, title: string, body: string, severity: 'info' | 'warning' | 'critical' = 'warning') {
  const existing = await prisma.notification.findFirst({ where: { type, entityId, read: false } });
  if (existing) return;
  await prisma.notification.create({ data: { type, entityId, title, body, severity } });
}

export async function idleSessionDetector() {
  const cutoff = new Date(Date.now() - IDLE_SESSION_MINUTES * 60_000);
  const stale = await prisma.session.findMany({
    where: { endedAt: null, startedAt: { lt: cutoff } },
    include: { events: { orderBy: { ts: 'desc' }, take: 1 } },
    take: 500,
  });
  for (const s of stale) {
    const last = s.events[0]?.ts ?? s.startedAt;
    if (last < cutoff) {
      const endedAt = last;
      await prisma.session.update({
        where: { id: s.id },
        data: { endedAt, durationSec: Math.max(0, Math.round((endedAt.getTime() - s.startedAt.getTime()) / 1000)) },
      }).catch(() => {});
    }
  }
}

export async function loanStaleDetector() {
  const cutoff = new Date(Date.now() - STALE_LOAN_HOURS * 3600_000);
  const stale = await prisma.loanApplication.findMany({
    where: { status: { in: NON_TERMINAL }, updatedAt: { lt: cutoff } },
    include: { user: { select: { fullName: true, phone: true } } },
    take: 200,
  });
  for (const a of stale) {
    await notifyOnce(
      'loan_stale', a.id,
      `Application ${a.ref} stalled at "${a.status}"`,
      `${a.user?.fullName ?? a.user?.phone ?? 'A user'}'s application has not progressed in ${STALE_LOAN_HOURS}h.`,
      'warning',
    );
  }
}

export async function onboardingStaleDetector() {
  const cutoff = new Date(Date.now() - STALE_ONBOARDING_HOURS * 3600_000);
  // users who started onboarding but have no "completed" home step
  const started = await prisma.onboardingFunnel.findMany({
    where: { status: 'started', updatedAt: { lt: cutoff } },
    take: 200,
  });
  for (const s of started) {
    if (!s.userId) continue;
    const done = await prisma.onboardingFunnel.findFirst({ where: { userId: s.userId, status: 'completed', stepName: 'home' } });
    if (done) continue;
    await notifyOnce(
      'onboarding_stale', s.userId,
      `Onboarding abandoned at "${s.stepName}"`,
      `A user has not finished onboarding for ${STALE_ONBOARDING_HOURS}h (last step: ${s.stepName}).`,
      'info',
    );
  }
}

// Placeholder for a real push/email sender — logs unsent notifications.
export async function notificationSender() {
  const pending = await prisma.notification.count({ where: { read: false } });
  if (pending > 0 && process.env.NODE_ENV !== 'production') {
    // In production this would dispatch to FCM/email; here we just surface the count.
    // console kept quiet to avoid log spam.
  }
}

const JOBS: Array<{ name: string; fn: () => Promise<void>; everyMs: number }> = [
  { name: 'idle-detector', fn: idleSessionDetector, everyMs: 5 * 60_000 },
  { name: 'loan-stale', fn: loanStaleDetector, everyMs: 15 * 60_000 },
  { name: 'onboarding-stale', fn: onboardingStaleDetector, everyMs: 15 * 60_000 },
  { name: 'notification-sender', fn: notificationSender, everyMs: 60_000 },
];

let timers: NodeJS.Timeout[] = [];

// Start the maintenance jobs. Uses BullMQ if REDIS_URL is set, otherwise a simple
// setInterval scheduler in-process (fine for a single API node / dev).
export async function startJobs() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      // Dynamic (runtime-resolved) import so `bullmq` is only required when Redis is
      // configured — the specifier is built at runtime so TS/bundlers don't demand it.
      const specifier = ['bull', 'mq'].join('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Queue, Worker }: any = await import(/* @vite-ignore */ specifier);
      const connection = { url: redisUrl };
      for (const job of JOBS) {
        const q = new Queue(job.name, { connection });
        await q.add(job.name, {}, { repeat: { every: job.everyMs }, removeOnComplete: true, removeOnFail: true });
        new Worker(job.name, async () => { await job.fn().catch(() => {}); }, { connection });
      }
      console.log(`[jobs] BullMQ scheduler started (${JOBS.length} jobs) on Redis`);
      return;
    } catch (e) {
      console.warn('[jobs] Redis/BullMQ unavailable, falling back to in-process scheduler:', (e as Error).message);
    }
  }
  // Fallback: in-process interval scheduler.
  timers = JOBS.map((job) => {
    // Run once shortly after boot, then on the interval.
    setTimeout(() => { job.fn().catch(() => {}); }, 10_000);
    return setInterval(() => { job.fn().catch(() => {}); }, job.everyMs);
  });
  console.log(`[jobs] in-process scheduler started (${JOBS.length} jobs, no Redis)`);
}

export function stopJobs() {
  timers.forEach(clearInterval);
  timers = [];
}
