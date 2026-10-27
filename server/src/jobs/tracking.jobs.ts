import { prisma } from '../lib/prisma.js';
import type { ApplicationStatus } from '@prisma/client';
import { TERMINAL_STAGES, recordJourneyEvent, JOURNEY_EVENTS } from '../lib/journey.js';
import { nudgeCustomer, runDispatchQueue } from '../lib/dispatch.js';
import { campaignScheduler } from '../lib/campaignRunner.js';
import { leadAutoCaller } from '../lib/leadCaller.js';
import { immediateCallback } from '../lib/immediateCallback.js';
import { stepStallDetector, seedStallRules } from '../lib/stallRules.js';
import { reconcileStaleCalls } from '../lib/callReconcile.js';
import { purgeExpiredClicks } from '../lib/referral.js';
import { installReminderTickThrottled } from '../lib/installReminder.js';
import { statusPoller } from '../lib/statusPoller.js';
import { runDailyStatusCalls } from '../lib/statusCall.js';
import { lenderNudgeTickThrottled } from '../lib/lenderNudge.js';
import { appDropoffTickThrottled } from '../lib/appDropoff.js';

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
  // Website drop-off recovery: save where a verified visitor stopped and run the app-link reminder
  // schedule. Log-only unless INSTALL_REMINDER_SEND=true (see lib/installReminder.ts).
  { name: 'install-reminder', fn: async () => { await installReminderTickThrottled(); }, everyMs: 60_000 },
  // "You applied with <lender>, install the app to track it": one sequence per lender application. Log-only unless Admin → Timings turns it on.
  { name: 'lender-nudge', fn: async () => { await lenderNudgeTickThrottled(); }, everyMs: 60_000 },
  // "You dropped here" messages for website and app (docs/APP_DROPOFF_PLAN.md). Log-only unless dropoff.sendEnabled (Admin → Timings).
  { name: 'app-dropoff', fn: async () => { await appDropoffTickThrottled(); }, everyMs: 60_000 },
  // Install attribution: drop click rows (hashed IP/UA) once they can no longer be claimed.
  { name: 'click-purge', fn: async () => { await purgeExpiredClicks(); }, everyMs: 60 * 60_000 },
  // Lender status poller: pulls each in-progress application's latest status
  // from the lender. The 10-min tick only checks which applications are DUE;
  // the actual cadence (default every 2h) and the 9am–7pm IST window are read
  // live from Admin → Timings (status.pollEveryMinutes / status.window*).
  { name: 'status-poll', fn: async () => { await statusPoller(); }, everyMs: 10 * 60_000 },

  // Daily status call: rings each eligible customer once per IST day with where
  // their application stands. The minute tick only finds who is due; the feature
  // is off unless Admin → Timings calls.statusDailyEnabled + calls.nudgeEnabled,
  // and (while testing) calls.allowedNumbers restricts who rings.
  { name: 'status-call', fn: async () => { await runDailyStatusCalls(); }, everyMs: 60_000 },
];

// Kill switch for every outbound-nudge path: the stall detectors that create
// nudges and the workers that drain the dispatch queue. Admin-alert-only jobs
// (idle / loan-stale / onboarding-stale) keep running.
const NUDGE_JOBS = new Set(['stage-stall', 'step-stall', 'dispatch-worker', 'notification-sender', 'install-reminder', 'lender-nudge', 'app-dropoff', 'status-call']);
export const nudgesDisabled = () => /^(1|true|yes)$/i.test(process.env.NUDGES_DISABLED ?? '');

let timers: NodeJS.Timeout[] = [];

/**
 * In-memory heartbeat per job — lets the admin "Calls" page show whether the
 * dialler jobs (and everything else) are actually ticking on schedule, i.e.
 * whether Ruby is being triggered on a regular interval. In-process is enough:
 * the jobs and the admin API run in the same Node process (in-process scheduler,
 * and the BullMQ workers are started here too). Resets on restart, which is fine
 * — "is it running right now?" is the question it answers.
 */
export interface JobHeartbeat {
  name: string;
  everyMs: number;
  runs: number;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
}
const heartbeats = new Map<string, JobHeartbeat>();

export function getJobHeartbeats(): JobHeartbeat[] {
  return [...heartbeats.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Run one job tick and record its heartbeat. Never throws. */
async function runJobTracked(job: { name: string; fn: () => Promise<void>; everyMs: number }): Promise<void> {
  const started = Date.now();
  const hb: JobHeartbeat = heartbeats.get(job.name) ?? {
    name: job.name, everyMs: job.everyMs, runs: 0, lastRunAt: null, lastOkAt: null, lastError: null, lastDurationMs: null,
  };
  hb.everyMs = job.everyMs;
  try {
    await job.fn();
    hb.lastOkAt = new Date().toISOString();
    hb.lastError = null;
  } catch (e) {
    hb.lastError = String((e as Error)?.message ?? e);
  } finally {
    hb.lastRunAt = new Date().toISOString();
    hb.lastDurationMs = Date.now() - started;
    hb.runs += 1;
    heartbeats.set(job.name, hb);
  }
}

// Start the maintenance jobs. Uses BullMQ if REDIS_URL is set, otherwise a simple
// setInterval scheduler in-process (fine for a single API node / dev).
export async function startJobs() {
  const jobs = nudgesDisabled() ? JOBS.filter((j) => !NUDGE_JOBS.has(j.name)) : JOBS;
  if (nudgesDisabled()) console.log('[jobs] NUDGES_DISABLED — stall detectors and dispatch worker are off');
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
      for (const job of jobs) {
        const q = new Queue(job.name, { connection });
        await q.add(job.name, {}, { repeat: { every: job.everyMs }, removeOnComplete: true, removeOnFail: true });
        new Worker(job.name, async () => { await runJobTracked(job); }, { connection });
      }
      console.log(`[jobs] BullMQ scheduler started (${jobs.length} jobs) on Redis`);
      return;
    } catch (e) {
      console.warn('[jobs] Redis/BullMQ unavailable, falling back to in-process scheduler:', (e as Error).message);
    }
  }
  // Fallback: in-process interval scheduler.
  timers = jobs.map((job) => {
    // Run once shortly after boot, then on the interval.
    setTimeout(() => { void runJobTracked(job); }, 10_000);
    return setInterval(() => { void runJobTracked(job); }, job.everyMs);
  });
  console.log(`[jobs] in-process scheduler started (${jobs.length} jobs, no Redis)`);
}

export function stopJobs() {
  timers.forEach(clearInterval);
  timers = [];
}
