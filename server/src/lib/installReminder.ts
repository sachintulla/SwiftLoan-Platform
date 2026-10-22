/**
 * Website drop-off recovery: remember where a verified website visitor stopped, and send them the
 * app link on a schedule until they install the app (rules in reminderSchedule.ts).
 *
 * Lifecycle of a JourneyReminder:
 *   - armed when the visitor verifies their OTP on the website (`armInstallReminder`)
 *   - kept fresh by the website's activity pings (`pingInstallReminder`)
 *   - advanced once a minute by `installReminderTick`: saves "dropped off at <step>" after 5 idle
 *     minutes, stops on install / app login / finished application / do-not-contact, and sends
 *     (or, by default, only LOGS) whatever step is due.
 *
 * Nothing is sent unless INSTALL_REMINDER_SEND=true. Until the SMS template and WhatsApp are ready the
 * job records what it WOULD send in `history`, so the cadence can be watched without messaging anyone.
 *
 * Guard rails, same spirit as stallSms.ts: calling hours only, never to a do-not-contact customer, a step
 * is claimed with a conditional update BEFORE sending (two workers cannot both send it), and a failed send
 * is recorded and not retried.
 */
import type { JourneyReminder } from '@prisma/client';
import { prisma } from './prisma.js';
import { newReferralCode } from './attribution.js';
import { withinCallingHours } from './leadCaller.js';
import { downloads } from '../config/downloads.js';
import { getProviderConfig } from './integrations.js';
import { sendVoxSms, smsConfigured } from './voxSms.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { buildPlaceholders } from './stallWhatsapp.js';
import { isReviewPhone } from './reviewLogin.js';
import { JOURNEY_EVENTS } from './journey.js';
import { scoped } from './log.js';
import { timing } from './timings.js';
import { phoneKey } from './messageStatus.js';
import {
  DEFAULT_STEP_LABELS, buildInstallLink, deriveLastStep, isFinishedApplicationStatus, isIdle,
  nextAction, nextCheckTime, renderSmsBody, stepsFromRows, stopReason, type LastStep, type ScheduleConfig, type ScheduleStep, type StopReason,
} from './reminderSchedule.js';

const log = scoped('install-reminder');

const PAGE_SIZE = 200;
const MAX_PAGES = 10; // up to 2,000 due reminders per tick; the rest are picked up on the next one

/** Real sending on? Admin → Timings (falls back to INSTALL_REMINDER_SEND). Off = the job only logs what it would send. */
export const installReminderSendEnabled = () => timing.bool('install.sendEnabled');

/** The schedule rules as currently set in Admin → Timings (read every tick, so a change applies within a minute). */
export function currentScheduleConfig(): ScheduleConfig {
  return {
    steps: stepsFromRows(timing.schedule('install.schedule')),
    idleMs: timing.minutesMs('install.idleMinutes'),
    minGapMs: timing.minutesMs('install.minGapMinutes'),
    maxLateMs: timing.hoursMs('install.maxLateHours'),
    recheckMs: timing.minutesMs('install.recheckMinutes'),
  };
}

/** The test-number list: empty means everyone may receive reminders; otherwise only these numbers. */
export function notOnTestList(phone: string): boolean {
  const allowed = timing.phones('install.allowedNumbers');
  return allowed.length > 0 && !allowed.includes(phoneKey(phone) ?? '__none__');
}

export type HistoryOutcome = 'logged' | 'sent' | 'failed' | 'skipped';
export interface HistoryEntry {
  step: number;
  channel: string;
  label: string;
  at: string;
  outcome: HistoryOutcome;
  reason?: string;
}

function readHistory(r: Pick<JourneyReminder, 'history'>): HistoryEntry[] {
  return Array.isArray(r.history) ? (r.history as unknown as HistoryEntry[]) : [];
}

/* ───────────────────────────── arming and pings ───────────────────────────── */

async function createReminder(
  user: { id: string; phone: string },
  cycle: number,
  startAt: Date,
  firstName: string | null,
  unverified = false,
): Promise<JourneyReminder | null> {
  const customer = await prisma.customer.findUnique({ where: { phone: user.phone }, select: { id: true } });
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.journeyReminder.create({
        data: {
          userId: user.id, customerId: customer?.id ?? null, phone: user.phone, token: newReferralCode(), firstName, cycle, startAt, nextCheckAt: startAt,
          ...(unverified ? { unverified: true, lastStep: 'otp_requested' } : {}),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e; // only a token collision is worth retrying
    }
  }
  return null;
}

export async function alreadyInApp(phone: string): Promise<boolean> {
  const customer = await prisma.customer.findUnique({ where: { phone }, select: { id: true } });
  if (!customer) return false;
  const ev = await prisma.journeyEvent.findFirst({
    where: { customerId: customer.id, channel: 'app', name: JOURNEY_EVENTS.OTP_VERIFIED },
    select: { id: true },
  });
  return !!ev;
}

/**
 * Called when a visitor verifies their OTP on the website. Starts their reminder schedule, unless
 * they are already an app user, already finished, or the schedule already ran for them.
 */
export async function armInstallReminder(user: { id: string; phone: string }, now: Date = new Date()): Promise<JourneyReminder | null> {
  if (isReviewPhone(user.phone)) return null;

  const active = await prisma.journeyReminder.findFirst({ where: { userId: user.id, status: 'active' } });
  if (active?.unverified) {
    // They entered the code after all: the short "never entered it" run ends and the normal run starts. It does not use
    // up one of the visitor's runs (same cycle number), and the normal run only begins sending once they go idle.
    await prisma.journeyReminder.update({ where: { id: active.id }, data: { status: 'stopped', stopReason: 'verified' } });
    return createReminder(user, active.cycle, now, active.firstName);
  }
  if (active) {
    if (!active.droppedAt) {
      await prisma.journeyReminder.update({ where: { id: active.id }, data: { lastSeenAt: now } });
      return active;
    }
    // Back on the website after being marked dropped off: stop this run, and start the next one
    // (which only begins sending once they go idle again).
    await prisma.journeyReminder.update({ where: { id: active.id }, data: { status: 'stopped', stopReason: 'returned' } });
    if (active.cycle >= timing.num('install.maxCycles')) return null;
    return createReminder(user, active.cycle + 1, new Date(now.getTime() + timing.minutesMs('install.idleMinutes')), active.firstName);
  }

  const last = await prisma.journeyReminder.findFirst({ where: { userId: user.id, unverified: false }, orderBy: { createdAt: 'desc' } });
  if (last) {
    if (last.status === 'completed') return null; // the full week already ran
    if (last.status === 'stopped' && last.stopReason !== 'returned') return null; // installed, finished, or asked us to stop
    if (last.cycle >= timing.num('install.maxCycles')) return null;
  }
  if (await alreadyInApp(user.phone)) return null;

  const cycle = last ? last.cycle + 1 : 1;
  return createReminder(user, cycle, cycle === 1 ? now : new Date(now.getTime() + timing.minutesMs('install.idleMinutes')), last?.firstName ?? null);
}

/**
 * Called when someone asks for a website OTP. If they never enter it, they get a SHORT sequence (Admin → Timings:
 * "Messages for an OTP that was never entered"), once per number ever: anyone can type any number into the box, so
 * we never repeat it and never send the full week. Not for a number that already has a reminder (verified before, or
 * armed before), a number already in the app, or the store-review phone. The app's own OTP never comes here.
 */
export async function armUnverifiedReminder(user: { id: string; phone: string }, now: Date = new Date()): Promise<JourneyReminder | null> {
  if (!timing.bool('install.unverifiedEnabled')) return null;
  if (isReviewPhone(user.phone)) return null;
  if (await prisma.journeyReminder.findFirst({ where: { userId: user.id }, select: { id: true } })) return null;
  if (await alreadyInApp(user.phone)) return null;
  return createReminder(user, 1, now, null, true);
}

/** The website tab pinged: the visitor is active right now. */
export async function pingInstallReminder(user: { id: string; phone: string }, now: Date = new Date()): Promise<void> {
  const active = await prisma.journeyReminder.findFirst({ where: { userId: user.id, status: 'active' }, select: { id: true, droppedAt: true } });
  if (!active) return;
  if (active.droppedAt) {
    await armInstallReminder(user, now); // returned after being idle: ends this run, starts the next
    return;
  }
  await prisma.journeyReminder.update({ where: { id: active.id }, data: { lastSeenAt: now } });
}

/**
 * PAN records hold names in capitals ("PRIYA"); a greeting reads better as "Priya". Capitalises each word and the
 * part after a hyphen or apostrophe; trims; caps the length; null when blank.
 */
export function tidyName(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!t) return null;
  return t.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** PAN verified on the website: remember the first name (for the greeting) and that step 1 is done. */
export async function markPanVerified(userId: string, firstName: string | null | undefined): Promise<void> {
  const name = tidyName(firstName);
  await prisma.journeyReminder.updateMany({
    where: { userId, status: 'active' },
    data: { lastStep: 'pan_done', ...(name ? { firstName: name } : {}) },
  });
}

/* ───────────────────────────────── sending ───────────────────────────────── */

interface DeliverResult { outcome: HistoryOutcome; reason?: string }

/**
 * Send one step. Templates are operator settings on the Voxvalley integration, because India SMS must
 * match its registered (DLT) text exactly and WhatsApp only allows approved templates:
 *   settings.installSmsTemplateId + settings.installSmsBody (must contain {link})
 *   settings.installWhatsapp = { template, language?, placeholders? } with {name}, {step} and {link} tokens
 */
async function deliver(r: JourneyReminder, step: ScheduleStep, lastStep: LastStep = r.lastStep as LastStep): Promise<DeliverResult> {
  if (!installReminderSendEnabled()) return { outcome: 'logged' };
  // While a test list is set, nobody else is messaged. The step is used up (not saved for later), so clearing the list never sends a backlog.
  if (notOnTestList(r.phone)) return { outcome: 'skipped', reason: 'not on the test-number list' };

  const link = buildInstallLink(downloads.publicBase, r.token);
  const cfg = await getProviderConfig('voxvalley');
  const labels = { ...DEFAULT_STEP_LABELS, ...((cfg.settings.installStepLabels as Partial<Record<LastStep, string>> | undefined) ?? {}) };
  const stepLabel = labels[lastStep] ?? labels.otp_only;

  if (step.channel === 'sms') {
    const templateId = String(cfg.settings.installSmsTemplateId ?? '').trim();
    const body = String(cfg.settings.installSmsBody ?? '');
    if (!templateId || !body.includes('{link}')) return { outcome: 'skipped', reason: 'sms template not configured' };
    if (!(await smsConfigured())) return { outcome: 'skipped', reason: 'sms gateway not configured' };
    const text = renderSmsBody(body, { name: r.firstName, step: stepLabel, link });
    const res = await sendVoxSms({ phone: r.phone, body: text, templateId, track: { kind: 'install_reminder', customerId: r.customerId } });
    return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: (res.error ?? 'sms failed').slice(0, 200) };
  }

  const wa = cfg.settings.installWhatsapp as { template?: string; language?: string; placeholders?: string[] } | undefined;
  if (!wa?.template?.trim()) return { outcome: 'skipped', reason: 'whatsapp template not configured' };
  if (!(await whatsappConfigured())) return { outcome: 'skipped', reason: 'whatsapp not configured' };
  const placeholders = buildPlaceholders(wa.placeholders, { name: r.firstName ?? 'there', link, step: stepLabel });
  if (!placeholders) return { outcome: 'skipped', reason: 'whatsapp placeholder missing' };
  const res = await sendWhatsAppTemplate({
    phone: r.phone, templateName: wa.template, language: wa.language, placeholders, referenceId: `${r.id}:${step.index}`,
    track: { kind: 'install_reminder', customerId: r.customerId },
  });
  return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: (res.error ?? 'whatsapp failed').slice(0, 200) };
}

/* ─────────────────────────────────── the job ─────────────────────────────────── */

export interface TickResult { scanned: number; stopped: number; dropped: number; handled: number; completed: number }

async function stopReasonFor(r: JourneyReminder, user: { panOnFile: boolean } | null, now: Date): Promise<{ reason: StopReason | null; lastStep: LastStep }> {
  const [customer, application, click, appliedToLender] = await Promise.all([
    prisma.customer.findUnique({ where: { phone: r.phone }, select: { id: true, currentStage: true } }),
    prisma.loanApplication.findFirst({ where: { userId: r.userId }, orderBy: { updatedAt: 'desc' }, select: { status: true } }),
    prisma.appClick.findFirst({ where: { ref: r.token, status: 'matched' }, select: { id: true } }),
    // The lender's own status webhook (what moves the application to 'handoff') may never arrive, so tapping Apply is the
    // moment this stops saying "incomplete"; the "you applied with <lender>" messages (lenderNudge.ts) take over.
    prisma.lenderApplication.findFirst({ where: { application: { userId: r.userId } }, select: { id: true } }),
  ]);
  const appLogin = customer
    ? !!(await prisma.journeyEvent.findFirst({
        where: { customerId: customer.id, channel: 'app', name: JOURNEY_EVENTS.OTP_VERIFIED, occurredAt: { gte: r.createdAt } },
        select: { id: true },
      }))
    : false;
  const lastStep = deriveLastStep({ panOnFile: !!user?.panOnFile, hasApplication: !!application, unverified: r.unverified });
  const reason = stopReason({
    doNotContact: customer?.currentStage === 'lost',
    installed: !!click,
    appLogin,
    applicationFinished: isFinishedApplicationStatus(application?.status) || !!appliedToLender,
    returned: !!r.droppedAt && r.lastSeenAt.getTime() > r.droppedAt.getTime() + 60_000 && r.lastSeenAt <= now,
  });
  return { reason, lastStep };
}

/** The rules for one row: the same as everyone's, except an unverified visitor has its own (short) schedule. */
function configFor(r: Pick<JourneyReminder, 'unverified'>, cfg: ScheduleConfig): ScheduleConfig {
  return r.unverified ? { ...cfg, steps: stepsFromRows(timing.schedule('install.unverifiedSchedule')) } : cfg;
}

async function processReminder(r: JourneyReminder, now: Date, out: TickResult, baseCfg: ScheduleConfig = currentScheduleConfig()): Promise<void> {
  const cfg = configFor(r, baseCfg);
  const user = await prisma.user.findUnique({ where: { id: r.userId }, select: { panOnFile: true } });
  const { reason, lastStep } = await stopReasonFor(r, user, now);

  if (reason) {
    await prisma.journeyReminder.update({ where: { id: r.id }, data: { status: 'stopped', stopReason: reason } });
    out.stopped++;
    log.info('stopped', { id: r.id, reason, step: r.stepsSent });
    return;
  }

  // Save "dropped off at <step>" once the visitor has been idle long enough.
  const dropNow = !r.droppedAt && isIdle(r.lastSeenAt, now, cfg.idleMs);
  if (dropNow || lastStep !== r.lastStep) {
    await prisma.journeyReminder.update({
      where: { id: r.id },
      // The schedule runs from the moment they dropped off, so the first message is "idle for 5 minutes", not "5 minutes after login".
      data: { lastStep, ...(dropNow ? { droppedAt: now, startAt: now } : {}) },
    });
    if (dropNow) {
      out.dropped++;
      log.info('dropped off', { id: r.id, lastStep });
    }
  }
  const dropped = !!r.droppedAt || dropNow;
  const startAt = dropNow ? now : r.startAt;

  // When this row next needs attention, given what has been handled so far.
  const checkAfter = (stepsHandled: number, lastSentAt: Date | null) =>
    nextCheckTime({ cfg, now, startAt, stepsHandled, lastSentAt, lastSeenAt: r.lastSeenAt, dropped });

  // Still on the website (or only just left): nothing is sent until they have been idle long enough to count as dropped off.
  if (!dropped) {
    await prisma.journeyReminder.update({ where: { id: r.id }, data: { nextCheckAt: checkAfter(r.stepsSent, r.lastSentAt) } });
    return;
  }

  const action = nextAction({
    cfg,
    startAt,
    stepsHandled: r.stepsSent,
    lastSentAt: r.lastSentAt,
    now,
    inCallingWindow: withinCallingHours(now),
  });
  if (action.kind === 'wait') {
    await prisma.journeyReminder.update({ where: { id: r.id }, data: { nextCheckAt: checkAfter(r.stepsSent, r.lastSentAt) } });
    return;
  }
  if (action.kind === 'finished') {
    await prisma.journeyReminder.update({ where: { id: r.id }, data: { status: 'completed' } });
    out.completed++;
    return;
  }

  // Claim the step before doing anything: a second worker or a re-run finds stepsSent already moved on.
  const claimed = await prisma.journeyReminder.updateMany({
    where: { id: r.id, status: 'active', stepsSent: r.stepsSent },
    data: { stepsSent: r.stepsSent + 1 },
  });
  if (claimed.count !== 1) return;

  const step = action.step;
  const result: DeliverResult = action.kind === 'skip' ? { outcome: 'skipped', reason: action.reason } : await deliver(r, step, lastStep);
  const entry: HistoryEntry = { step: step.index, channel: step.channel, label: step.label, at: now.toISOString(), outcome: result.outcome, ...(result.reason ? { reason: result.reason } : {}) };
  const sentNow = result.outcome === 'sent' || result.outcome === 'logged';
  const lastSentAt = sentNow ? now : r.lastSentAt;
  const isLast = step.index === cfg.steps.length - 1;
  await prisma.journeyReminder.update({
    where: { id: r.id },
    data: {
      history: [...readHistory(r), entry] as unknown as object,
      ...(sentNow ? { lastSentAt: now } : {}),
      ...(isLast ? { status: 'completed' } : { nextCheckAt: checkAfter(r.stepsSent + 1, lastSentAt) }),
    },
  });
  out.handled++;
  log.info(result.outcome === 'logged' ? 'would send (log-only)' : result.outcome, { id: r.id, step: step.index, channel: step.channel, reason: result.reason });
  if (isLast) out.completed++;
}

/**
 * One pass over the reminders that are DUE (their nextCheckAt has come), oldest first, page by page. Safe to run
 * every minute and from more than one worker. Rows that are not due are not even read, so the cost follows the
 * work to do, not the number of active visitors.
 */
export async function installReminderTick(now: Date = new Date()): Promise<TickResult> {
  const out: TickResult = { scanned: 0, stopped: 0, dropped: 0, handled: 0, completed: 0 };
  const cfg = currentScheduleConfig();
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await prisma.journeyReminder.findMany({
      where: { status: 'active', nextCheckAt: { lte: now } },
      orderBy: { nextCheckAt: 'asc' },
      take: PAGE_SIZE,
    });
    if (!rows.length) break;
    for (const r of rows) {
      out.scanned++;
      try {
        await processReminder(r, now, out, cfg);
      } catch (e) {
        log.error('tick failed for one reminder', { id: r.id, error: (e as Error).message }); // one bad row never aborts the scan
        // Look again later: a row that keeps failing must not be picked up again and again within this tick.
        await prisma.journeyReminder.update({ where: { id: r.id }, data: { nextCheckAt: new Date(now.getTime() + 5 * 60_000) } }).catch(() => undefined);
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

let lastThrottledRun = 0;
/**
 * What the background scheduler calls every minute: runs the real tick no more often than "Reminder job runs every"
 * (Admin → Timings). The scheduler's own rhythm is fixed at one minute, so this can only slow the job down.
 */
export async function installReminderTickThrottled(nowMs: number = Date.now()): Promise<TickResult | null> {
  if (nowMs - lastThrottledRun < timing.minutesMs('install.jobEveryMinutes') - 5_000) return null; // 5 s of slack for timer jitter
  lastThrottledRun = nowMs;
  return installReminderTick(new Date(nowMs));
}

/** Test hook: forget when the throttled job last ran. */
export function resetInstallReminderThrottle() {
  lastThrottledRun = 0;
}
