import { prisma } from '../lib/prisma.js';
import type { ApplicationStatus } from '@prisma/client';
import { TERMINAL_STAGES, recordJourneyEvent, JOURNEY_EVENTS } from '../lib/journey.js';
import { nudgeCustomer, runDispatchQueue } from '../lib/dispatch.js';
import { campaignScheduler } from '../lib/campaignRunner.js';
import { leadAutoCaller } from '../lib/leadCaller.js';
import { immediateCallback } from '../lib/immediateCallback.js';
import { stepStallDetector, seedStallRules } from '../lib/stallRules.js';
import { applicationStatusLabel, onboardingStepLabel } from '../lib/labels.js';
import { reconcileStaleCalls } from '../lib/callReconcile.js';

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
      `Application ${a.ref} stalled at ${applicationStatusLabel(a.status)}`,
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
      `Onboarding abandoned at ${onboardingStepLabel(s.stepName)}`,
      `A user has not finished onboarding for ${STALE_ONBOARDING_HOURS}h (last step: ${onboardingStepLabel(s.stepName)}).`,
      'info',
    );
  }
}

// WS5: this used to be a no-op counter. Real delivery now happens through the
// OutboundRequest queue, so the sender simply drains it.
export async function notificationSender() {
  await runDispatchQueue().catch(() => undefined);
}

// ─────────────────────────── WS5 jobs ───────────────────────────

const STAGE_STALL_MINUTES = Number(process.env.STAGE_STALL_MINUTES ?? 20) || 20;
const NUDGE_COOLDOWN_MINUTES = Number(process.env.NUDGE_COOLDOWN_MINUTES ?? 120) || 120;
const STALL_SCAN_CAP = 200;

// Find customers who have sat in a non-terminal stage too long and re-engage
// them through Upshot — respecting a per-customer cooldown so a slow funnel
// cannot turn into a message storm.
export async function stageStallDetector() {
  const now = new Date();
  const stalledBefore = new Date(now.getTime() - STAGE_STALL_MINUTES * 60_000);
  const cooldownBefore = new Date(now.getTime() - NUDGE_COOLDOWN_MINUTES * 60_000);

  const stalled = await prisma.customer.findMany({
    where: {
      currentStage: { notIn: TERMINAL_STAGES },
      stageEnteredAt: { lt: stalledBefore },
      OR: [{ lastNudgedAt: null }, { lastNudgedAt: { lt: cooldownBefore } }],
    },
    orderBy: { stageEnteredAt: 'asc' },
    take: STALL_SCAN_CAP,
  });

  for (const customer of stalled) {
    try {
      await nudgeCustomer(customer, customer.currentStage);
      await prisma.customer.update({ where: { id: customer.id }, data: { lastNudgedAt: new Date() } });
      await recordJourneyEvent(customer.id, {
        channel: 'system',
        name: JOURNEY_EVENTS.STAGE_STALLED,
        metadata: {
          stage: customer.currentStage,
          stalledMinutes: Math.round((now.getTime() - customer.stageEnteredAt.getTime()) / 60_000),
          thresholdMinutes: STAGE_STALL_MINUTES,
        },
      });
    } catch {
      // One bad customer must never abort the scan.
    }
  }
}

// Drain the outbound queue frequently so a queued nudge goes out promptly.
export async function dispatchWorker() {
  await runDispatchQueue().catch(() => undefined);
}

const JOBS: Array<{ name: string; fn: () => Promise<void>; everyMs: number }> = [
  { name: 'idle-detector', fn: idleSessionDetector, everyMs: 5 * 60_000 },
  { name: 'loan-stale', fn: loanStaleDetector, everyMs: 15 * 60_000 },
  { name: 'onboarding-stale', fn: onboardingStaleDetector, everyMs: 15 * 60_000 },
  { name: 'notification-sender', fn: notificationSender, everyMs: 60_000 },
  // WS5
  { name: 'stage-stall', fn: stageStallDetector, everyMs: 5 * 60_000 },
  { name: 'dispatch-worker', fn: dispatchWorker, everyMs: 30_000 },
  // WS5b — every minute, so a campaign starts within a minute of its window
  // opening. tickCampaign() guards against overlapping runs itself.
  { name: 'campaign-scheduler', fn: () => campaignScheduler(), everyMs: 60_000 },
  // WS5c — auto-call a website lead ~1 min after they submit the form.
  { name: 'lead-autocaller', fn: async () => { await leadAutoCaller(); }, everyMs: 60_000 },
  // WS5e — a visitor who explicitly asked for a callback (after verifying
  // their phone) gets one within ~5 min, separate from the passive flow above.
  { name: 'immediate-callback', fn: async () => { await immediateCallback(); }, everyMs: 60_000 },
  // WS5d — step-level stall rules: "did the next step happen?" -> Upshot event.
  { name: 'step-stall', fn: async () => { await stepStallDetector(); }, everyMs: 2 * 60_000 },
  // ADM-016 — close calls whose terminal webhook never arrived, so a lost
  // callback cannot pin a contact in `queued` and stall the whole campaign.
  { name: 'call-reconcile', fn: async () => { await reconcileStaleCalls(); }, everyMs: 10 * 60_000 },
];

let timers: NodeJS.Timeout[] = [];

// Start the maintenance jobs. Uses BullMQ if REDIS_URL is set, otherwise a simple
// setInterval scheduler in-process (fine for a single API node / dev).
export async function startJobs() {
  // Install the starter stall rules once, so a fresh database has working
  // drop-off detection instead of an empty table nobody thinks to populate.
  await seedStallRules()
    .then((n) => n && console.log(`[jobs] seeded ${n} stall rule(s)`))
    .catch(() => undefined);

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
