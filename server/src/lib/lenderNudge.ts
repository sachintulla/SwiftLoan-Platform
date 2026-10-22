/**
 * "You applied with <lender>, install the app to track it": one message sequence per lender application.
 *
 * Lenders do not report status back to us, so this says only what is true (they applied with that lender) and points
 * to the app, where we can track the application and show updates. Rules are pure and tested in
 * lenderNudgeRules.ts / reminderSchedule.ts; this file is the database + sending side.
 *
 *   - armed by the job itself: every tick looks for lender applications made recently that have no nudge row yet
 *     (so no edit to the apply route, and the same code catches website and app applications)
 *   - never for someone already in the app, a review-store phone, or a person with no website link to carry
 *   - one row per lender application; several lenders = several sequences, and a message that would follow ANOTHER
 *     lender's message to the same person by less than `applied.minGapMinutes` waits (lenderNudgeRules.ts crossLenderWait)
 *   - stops on install / app login / the lender application ending / do-not-contact
 *
 * Nothing is sent unless `applied.sendEnabled` (Admin → Timings) is on; until then it logs what it WOULD send.
 * Same guard rails as installReminder.ts: calling hours only, the shared test-number list, a step is claimed with a
 * conditional update BEFORE sending, a failed send is recorded and not retried.
 */
import type { LenderNudge } from '@prisma/client';
import { prisma } from './prisma.js';
import { downloads } from '../config/downloads.js';
import { getProviderConfig } from './integrations.js';
import { sendVoxSms, smsConfigured } from './voxSms.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { buildPlaceholders } from './stallWhatsapp.js';
import { isReviewPhone } from './reviewLogin.js';
import { JOURNEY_EVENTS } from './journey.js';
import { withinCallingHours } from './leadCaller.js';
import { scoped } from './log.js';
import { timing } from './timings.js';
import { alreadyInApp, notOnTestList, type HistoryEntry, type HistoryOutcome } from './installReminder.js';
import { buildInstallLink, nextAction, nextCheckTime, stepsFromRows, type ScheduleConfig, type ScheduleStep } from './reminderSchedule.js';
import {
  crossLenderWait, isLenderFinished, lenderNudgeStopReason, renderAppliedSms, tidyLender, type LenderNudgeStop,
} from './lenderNudgeRules.js';

const log = scoped('lender-nudge');

const PAGE_SIZE = 200;
const MAX_PAGES = 10;
const ARM_BATCH = 500;

export const lenderNudgeSendEnabled = () => timing.bool('applied.sendEnabled');

/** The rules as currently set in Admin → Timings (read every tick). */
export function lenderNudgeConfig(): ScheduleConfig {
  return {
    steps: stepsFromRows(timing.schedule('applied.schedule')),
    idleMs: 0, // not used: the person has already applied, there is no "still on the website" wait
    minGapMs: 0, // a sequence's own steps keep the schedule's spacing; the gap between DIFFERENT lenders is crossLenderWait()
    maxLateMs: timing.hoursMs('applied.maxLateHours'),
    recheckMs: timing.minutesMs('install.recheckMinutes'),
  };
}

function readHistory(n: Pick<LenderNudge, 'history'>): HistoryEntry[] {
  return Array.isArray(n.history) ? (n.history as unknown as HistoryEntry[]) : [];
}

/* ───────────────────────────────── arming ───────────────────────────────── */

async function createNudge(app: { id: string; lenderName: string | null; appliedAt: Date; userId: string }): Promise<'created' | 'stopped' | 'skipped'> {
  const user = await prisma.user.findUnique({ where: { id: app.userId }, select: { id: true, phone: true } });
  if (!user?.phone) return 'skipped';
  const customer = await prisma.customer.findUnique({ where: { phone: user.phone }, select: { id: true } });
  const jr = await prisma.journeyReminder.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { token: true, firstName: true } });

  let stop: LenderNudgeStop | null = null;
  if (isReviewPhone(user.phone)) stop = 'review_phone';
  else if (await alreadyInApp(user.phone)) stop = 'in_app';
  else if (!jr?.token) stop = 'no_link'; // never came through the website, so there is no link to carry

  try {
    await prisma.lenderNudge.create({
      data: {
        lenderApplicationId: app.id, userId: user.id, customerId: customer?.id ?? null, phone: user.phone,
        firstName: jr?.firstName ?? null, lenderName: app.lenderName, token: jr?.token ?? null,
        startAt: app.appliedAt, nextCheckAt: app.appliedAt,
        ...(stop ? { status: 'stopped', stopReason: stop } : {}),
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return 'skipped'; // another worker armed it first
    throw e;
  }
  return stop ? 'stopped' : 'created';
}

/**
 * Create a nudge for every recent lender application that has none yet. Only applications newer than
 * `applied.maxAgeHours` count, so enabling this never messages the historical backlog.
 */
export async function armLenderNudges(now: Date = new Date()): Promise<{ created: number; stopped: number }> {
  const since = new Date(now.getTime() - timing.hoursMs('applied.maxAgeHours'));
  const apps = await prisma.lenderApplication.findMany({
    where: { appliedAt: { gte: since } },
    orderBy: { appliedAt: 'asc' },
    take: ARM_BATCH,
    select: { id: true, lenderName: true, appliedAt: true, application: { select: { userId: true } } },
  });
  const out = { created: 0, stopped: 0 };
  if (!apps.length) return out;
  const have = new Set(
    (await prisma.lenderNudge.findMany({ where: { lenderApplicationId: { in: apps.map((a) => a.id) } }, select: { lenderApplicationId: true } }))
      .map((r) => r.lenderApplicationId),
  );
  for (const a of apps) {
    if (have.has(a.id)) continue;
    try {
      const r = await createNudge({ id: a.id, lenderName: a.lenderName, appliedAt: a.appliedAt, userId: a.application.userId });
      if (r === 'created') out.created++;
      else if (r === 'stopped') out.stopped++;
    } catch (e) {
      log.error('arming failed for one lender application', { id: a.id, error: (e as Error).message });
    }
  }
  return out;
}

/* ───────────────────────────────── sending ───────────────────────────────── */

interface DeliverResult { outcome: HistoryOutcome; reason?: string }

/**
 * Send one step. Templates are operator settings on the Voxvalley integration (India SMS must match its registered
 * DLT text exactly; WhatsApp only allows approved templates):
 *   settings.appliedSmsTemplateId + settings.appliedSmsBody (must contain {link}; may use {name} and {lender})
 *   settings.appliedWhatsapp = { template, language?, placeholders? } with {name}, {lender} and {link} tokens
 */
async function deliver(n: LenderNudge, step: ScheduleStep): Promise<DeliverResult> {
  if (!lenderNudgeSendEnabled()) return { outcome: 'logged' };
  // While a test list is set, nobody else is messaged. The step is used up, so clearing the list never sends a backlog.
  if (notOnTestList(n.phone)) return { outcome: 'skipped', reason: 'not on the test-number list' };
  if (!n.token) return { outcome: 'skipped', reason: 'no link' };

  const link = buildInstallLink(downloads.publicBase, n.token);
  const cfg = await getProviderConfig('voxvalley');
  const lender = tidyLender(n.lenderName);

  if (step.channel === 'sms') {
    const templateId = String(cfg.settings.appliedSmsTemplateId ?? '').trim();
    const body = String(cfg.settings.appliedSmsBody ?? '');
    if (!templateId || !body.includes('{link}')) return { outcome: 'skipped', reason: 'sms template not configured' };
    if (!(await smsConfigured())) return { outcome: 'skipped', reason: 'sms gateway not configured' };
    const text = renderAppliedSms(body, { name: n.firstName, lender, link });
    const res = await sendVoxSms({ phone: n.phone, body: text, templateId, track: { kind: 'applied_nudge', customerId: n.customerId } });
    return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: (res.error ?? 'sms failed').slice(0, 200) };
  }

  const wa = cfg.settings.appliedWhatsapp as { template?: string; language?: string; placeholders?: string[] } | undefined;
  if (!wa?.template?.trim()) return { outcome: 'skipped', reason: 'whatsapp template not configured' };
  if (!(await whatsappConfigured())) return { outcome: 'skipped', reason: 'whatsapp not configured' };
  const placeholders = buildPlaceholders(wa.placeholders, { name: n.firstName ?? 'there', lender, link });
  if (!placeholders) return { outcome: 'skipped', reason: 'whatsapp placeholder missing' };
  const res = await sendWhatsAppTemplate({
    phone: n.phone, templateName: wa.template, language: wa.language, placeholders, referenceId: `${n.id}:${step.index}`,
    track: { kind: 'applied_nudge', customerId: n.customerId },
  });
  return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: (res.error ?? 'whatsapp failed').slice(0, 200) };
}

/* ─────────────────────────────────── the job ─────────────────────────────────── */

export interface LenderNudgeTickResult { armed: number; scanned: number; stopped: number; handled: number; completed: number }

async function stopReasonFor(n: LenderNudge): Promise<LenderNudgeStop | null> {
  const [customer, lenderApp, click] = await Promise.all([
    prisma.customer.findUnique({ where: { phone: n.phone }, select: { id: true, currentStage: true } }),
    prisma.lenderApplication.findUnique({ where: { id: n.lenderApplicationId }, select: { status: true } }),
    n.token ? prisma.appClick.findFirst({ where: { ref: n.token, status: 'matched' }, select: { id: true } }) : Promise.resolve(null),
  ]);
  const appLogin = customer
    ? !!(await prisma.journeyEvent.findFirst({
        where: { customerId: customer.id, channel: 'app', name: JOURNEY_EVENTS.OTP_VERIFIED, occurredAt: { gte: n.createdAt } },
        select: { id: true },
      }))
    : false;
  return lenderNudgeStopReason({
    doNotContact: customer?.currentStage === 'lost',
    installed: !!click,
    appLogin,
    lenderFinished: isLenderFinished(lenderApp?.status),
  });
}

async function processNudge(n: LenderNudge, now: Date, out: LenderNudgeTickResult, cfg: ScheduleConfig): Promise<void> {
  const reason = await stopReasonFor(n);
  if (reason) {
    await prisma.lenderNudge.update({ where: { id: n.id }, data: { status: 'stopped', stopReason: reason } });
    out.stopped++;
    log.info('stopped', { id: n.id, reason, step: n.stepsSent });
    return;
  }

  const checkAfter = (stepsHandled: number, sentAt: Date | null) =>
    nextCheckTime({ cfg, now, startAt: n.startAt, stepsHandled, lastSentAt: sentAt, lastSeenAt: now, dropped: true });

  const action = nextAction({ cfg, startAt: n.startAt, stepsHandled: n.stepsSent, lastSentAt: n.lastSentAt, now, inCallingWindow: withinCallingHours(now) });
  if (action.kind === 'wait') {
    await prisma.lenderNudge.update({ where: { id: n.id }, data: { nextCheckAt: checkAfter(n.stepsSent, n.lastSentAt) } });
    return;
  }
  if (action.kind === 'finished') {
    await prisma.lenderNudge.update({ where: { id: n.id }, data: { status: 'completed' } });
    out.completed++;
    return;
  }
  if (action.kind === 'send') {
    // Another lender's message to this person went out recently: wait out the gap (a skipped step needs no wait, nothing is sent).
    const others = await prisma.lenderNudge.aggregate({ where: { phone: n.phone, id: { not: n.id } }, _max: { lastSentAt: true } });
    const hold = crossLenderWait(now, others._max.lastSentAt, timing.minutesMs('applied.minGapMinutes'));
    if (hold) {
      await prisma.lenderNudge.update({ where: { id: n.id }, data: { nextCheckAt: hold } });
      return;
    }
  }

  // Claim the step before doing anything: a second worker or a re-run finds stepsSent already moved on.
  const claimed = await prisma.lenderNudge.updateMany({ where: { id: n.id, status: 'active', stepsSent: n.stepsSent }, data: { stepsSent: n.stepsSent + 1 } });
  if (claimed.count !== 1) return;

  const step = action.step;
  const result: DeliverResult = action.kind === 'skip' ? { outcome: 'skipped', reason: action.reason } : await deliver(n, step);
  const entry: HistoryEntry = { step: step.index, channel: step.channel, label: step.label, at: now.toISOString(), outcome: result.outcome, ...(result.reason ? { reason: result.reason } : {}) };
  const sentNow = result.outcome === 'sent' || result.outcome === 'logged';
  const newLast = sentNow ? now : n.lastSentAt;
  const isLast = step.index === cfg.steps.length - 1;
  await prisma.lenderNudge.update({
    where: { id: n.id },
    data: {
      history: [...readHistory(n), entry] as unknown as object,
      ...(sentNow ? { lastSentAt: now } : {}),
      ...(isLast ? { status: 'completed' } : { nextCheckAt: checkAfter(n.stepsSent + 1, newLast) }),
    },
  });
  out.handled++;
  log.info(result.outcome === 'logged' ? 'would send (log-only)' : result.outcome, { id: n.id, step: step.index, channel: step.channel, reason: result.reason });
  if (isLast) out.completed++;
}

/** One pass: arm new lender applications, then work the sequences that are due, oldest first. Safe to run every minute and from several workers. */
export async function lenderNudgeTick(now: Date = new Date()): Promise<LenderNudgeTickResult> {
  const out: LenderNudgeTickResult = { armed: 0, scanned: 0, stopped: 0, handled: 0, completed: 0 };
  const armed = await armLenderNudges(now);
  out.armed = armed.created;
  out.stopped += armed.stopped;
  const cfg = lenderNudgeConfig();
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await prisma.lenderNudge.findMany({ where: { status: 'active', nextCheckAt: { lte: now } }, orderBy: { nextCheckAt: 'asc' }, take: PAGE_SIZE });
    if (!rows.length) break;
    for (const n of rows) {
      out.scanned++;
      try {
        await processNudge(n, now, out, cfg);
      } catch (e) {
        log.error('tick failed for one lender nudge', { id: n.id, error: (e as Error).message });
        await prisma.lenderNudge.update({ where: { id: n.id }, data: { nextCheckAt: new Date(now.getTime() + 5 * 60_000) } }).catch(() => undefined);
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

let lastThrottledRun = 0;
/** What the scheduler calls every minute: runs the real tick no more often than "Reminder job runs every" (Admin → Timings). */
export async function lenderNudgeTickThrottled(nowMs: number = Date.now()): Promise<LenderNudgeTickResult | null> {
  if (nowMs - lastThrottledRun < timing.minutesMs('install.jobEveryMinutes') - 5_000) return null;
  lastThrottledRun = nowMs;
  return lenderNudgeTick(new Date(nowMs));
}

/** Test hook. */
export function resetLenderNudgeThrottle() {
  lastThrottledRun = 0;
}
