/**
 * "You dropped here" messages for people who stop partway through the loan journey, on the website OR in the app.
 * Plan: docs/APP_DROPOFF_PLAN.md. Pure rules (tested): dropoffSteps.ts. This file is the database + sending side.
 *
 *   - the job reads where each recently active person stands from data both channels already write (dropoffSteps.ts
 *     deriveDropoff), and arms ONE row per person for the point they stopped at
 *   - messages: WhatsApp 30 min after they reached the step, SMS the next day, WhatsApp on day 3 (Admin → Timings)
 *   - the app link goes to someone who is not in the app yet; someone already in the app gets none; the "no offers, our
 *     team will call you" message never carries it (dropoffSteps.ts includeAppLink)
 *   - a run ends when they move to another step (a fresh run is armed for it), apply to a lender (lenderNudge.ts takes over),
 *     or are marked do-not-contact
 *   - never overlaps the website install reminder or a "you applied" sequence for the same phone
 *
 * PHASE 1 IS LOG-ONLY: nothing is sent unless `dropoff.sendEnabled` (Admin → Timings) is on. Until then each due step is
 * only recorded in the row's `history`. Same guard rails as installReminder.ts and lenderNudge.ts: quiet hours, the shared
 * test-number list, a step is claimed with a conditional update BEFORE sending, a failed send is recorded and not retried.
 */
import type { AppDropoff } from '@prisma/client';
import { prisma } from './prisma.js';
import { downloads } from '../config/downloads.js';
import { getProviderConfig } from './integrations.js';
import { sendVoxSms, smsConfigured } from './voxSms.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { isReviewPhone } from './reviewLogin.js';
import { withinCallingHours } from './leadCaller.js';
import { scoped } from './log.js';
import { timing } from './timings.js';
import { alreadyInApp, notOnTestList, tidyName, type HistoryEntry, type HistoryOutcome } from './installReminder.js';
import { placeNoOffersCalls } from './noOffersCall.js';
import { buildInstallLink, nextAction, nextCheckTime, renderSmsBody, stepsFromRows, type ScheduleConfig, type ScheduleStep } from './reminderSchedule.js';
import {
  DEFAULT_DROPOFF_MESSAGES, DROPOFF_STEP_LABELS, deriveDropoff, dropoffStopReason, includeAppLink, isMessageable, mergeDropoffMessages, messageKindFor, pickSms,
  resolveWhatsappMessage,
  type DropoffMessageKind, type DropoffSnapshot, type DropoffState, type DropoffStatus,
} from './dropoffSteps.js';

const log = scoped('app-dropoff');

const PAGE_SIZE = 200;
const MAX_PAGES = 10;
const ARM_BATCH = 500;
/** A person gets at most one run per drop point in this long, so a status that flickers cannot start the same messages twice. */
const RERUN_AFTER_MS = 14 * 24 * 3_600_000;

export const appDropoffSendEnabled = () => timing.bool('dropoff.sendEnabled');

/** The schedule rules as currently set in Admin → Timings (read every tick). */
export function dropoffConfig(): ScheduleConfig {
  return {
    steps: stepsFromRows(timing.schedule('dropoff.schedule')),
    idleMs: 0, // not used: the person has already stopped, there is no "still active" wait
    minGapMs: timing.minutesMs('dropoff.minGapMinutes'),
    maxLateMs: timing.hoursMs('dropoff.maxLateHours'),
    recheckMs: timing.minutesMs('install.recheckMinutes'),
  };
}

export interface DropoffHistoryEntry extends HistoryEntry {
  /** Which of the four messages this step was. */
  message: DropoffMessageKind;
  /** Whether the app download link was (or would be) in it. */
  withLink: boolean;
}

function readHistory(r: Pick<AppDropoff, 'history'>): DropoffHistoryEntry[] {
  return Array.isArray(r.history) ? (r.history as unknown as DropoffHistoryEntry[]) : [];
}

/* ───────────────────────────── reading where someone stands ───────────────────────────── */

async function loadSnapshot(userId: string): Promise<{ snapshot: DropoffSnapshot; user: { phone: string; firstName: string | null } } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true, firstName: true, panOnFile: true, updatedAt: true } });
  if (!user?.phone) return null;
  const app = await prisma.loanApplication.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      status: true, createdAt: true, updatedAt: true, offersFetchedAt: true, prequalifyReason: true,
      _count: { select: { offers: true } },
      lenderApplications: { select: { id: true }, take: 1 },
    },
  });
  return {
    user: { phone: user.phone, firstName: user.firstName },
    snapshot: {
      panOnFile: user.panOnFile,
      panSince: user.panOnFile ? user.updatedAt : null,
      application: app
        ? {
            status: app.status, createdAt: app.createdAt, updatedAt: app.updatedAt, offersFetchedAt: app.offersFetchedAt,
            prequalifyReason: app.prequalifyReason, offerCount: app._count.offers, appliedToLender: app.lenderApplications.length > 0,
          }
        : null,
    },
  };
}

async function isDoNotContact(phone: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { phone }, select: { currentStage: true } });
  return c?.currentStage === 'lost';
}

/** True while another message sequence already owns this phone, so two never overlap. */
async function otherSequenceActive(phone: string): Promise<boolean> {
  const [reminder, nudge] = await Promise.all([
    prisma.journeyReminder.findFirst({ where: { phone, status: 'active' }, select: { id: true } }),
    prisma.lenderNudge.findFirst({ where: { phone, status: 'active' }, select: { id: true } }),
  ]);
  return !!reminder || !!nudge;
}

/* ───────────────────────────────────── arming ───────────────────────────────────── */

async function armOne(userId: string, now: Date): Promise<'created' | 'stopped' | 'skipped'> {
  const loaded = await loadSnapshot(userId);
  if (!loaded) return 'skipped';
  const { snapshot, user } = loaded;
  const state: DropoffState = deriveDropoff(snapshot);

  const active = await prisma.appDropoff.findFirst({ where: { userId, status: 'active' } });
  if (active && active.dropStatus === state.status) return 'skipped'; // still at the same step: the run carries on
  let stopped = false;
  if (active) {
    // They moved on (or applied, or the lookup changed): end the old run NOW, not at its next message (which can be a day
    // away), so the message for their new step is not held up by a run about a step they have already left.
    const why = dropoffStopReason({ armedStatus: active.dropStatus as DropoffStatus, statusNow: state.status, doNotContact: false }) ?? 'progressed';
    await prisma.appDropoff.update({ where: { id: active.id }, data: { status: 'stopped', stopReason: why } });
    log.info('stopped', { id: active.id, reason: why, step: active.stepsSent });
    stopped = true;
  }
  if (!isMessageable(state.status)) return stopped ? 'stopped' : 'skipped';

  const since = state.since!;
  if (now.getTime() - since.getTime() > timing.hoursMs('dropoff.maxAgeHours')) return 'skipped'; // never message old history

  const recent = await prisma.appDropoff.findFirst({
    where: { userId, dropStatus: state.status, createdAt: { gte: new Date(now.getTime() - RERUN_AFTER_MS) } },
    select: { id: true },
  });
  if (recent) return 'skipped';

  if (isReviewPhone(user.phone)) return 'skipped';
  if (await isDoNotContact(user.phone)) return 'skipped';
  if (await otherSequenceActive(user.phone)) return 'skipped'; // the website reminder / "you applied" sequence owns this person for now

  const customer = await prisma.customer.findUnique({ where: { phone: user.phone }, select: { id: true } });
  const jr = await prisma.journeyReminder.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { token: true, firstName: true } });
  try {
    await prisma.appDropoff.create({
      data: {
        userId, customerId: customer?.id ?? null, phone: user.phone,
        firstName: jr?.firstName ?? tidyName(user.firstName), dropStatus: state.status, reason: state.reason,
        token: jr?.token ?? null, startAt: since, nextCheckAt: now,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return 'skipped'; // another worker armed this person first
    throw e;
  }
  return 'created';
}

/**
 * Create a run for everyone who recently reached a messageable step and has none. Only people who reached it within
 * `dropoff.maxAgeHours` count, so switching this on never reaches into the past.
 */
export async function armAppDropoffs(now: Date = new Date()): Promise<{ created: number; stopped: number }> {
  const since = new Date(now.getTime() - timing.hoursMs('dropoff.maxAgeHours'));
  const [apps, pans] = await Promise.all([
    prisma.loanApplication.findMany({ where: { updatedAt: { gte: since } }, orderBy: { updatedAt: 'asc' }, take: ARM_BATCH, select: { userId: true } }),
    prisma.user.findMany({ where: { panOnFile: true, updatedAt: { gte: since }, applications: { none: {} } }, orderBy: { updatedAt: 'asc' }, take: ARM_BATCH, select: { id: true } }),
  ]);
  const userIds = [...new Set([...apps.map((a) => a.userId), ...pans.map((u) => u.id)])];
  const out = { created: 0, stopped: 0 };
  for (const id of userIds) {
    try {
      const r = await armOne(id, now);
      if (r === 'created') out.created++;
      else if (r === 'stopped') out.stopped++;
    } catch (e) {
      log.error('arming failed for one person', { userId: id, error: (e as Error).message });
    }
  }
  return out;
}

/* ───────────────────────────────────── sending ───────────────────────────────────── */

interface DeliverResult { outcome: HistoryOutcome; reason?: string }

/**
 * Send one step. Message texts are operator settings on the Voxvalley integration (India SMS must match its registered
 * DLT text exactly, WhatsApp only allows approved templates), one per message and per link variant:
 *   settings.dropoffMessages = {
 *     continue | no_offers | apply_offers: {
 *       whatsapp: { withLink: { template, language?, placeholders? }, noLink: { … } },
 *       sms:      { withLink: { templateId, body }, noLink: { templateId, body } },
 *     } }
 * Shipped defaults (dropoffSteps.ts DEFAULT_DROPOFF_MESSAGES) sit underneath what is saved, one variant at a time.
 * Tokens: {name}, {step}, {link}, {ref} (application reference), {offerCount}. `settings.dropoffStepLabels` renames the step labels.
 */
async function deliver(r: AppDropoff, step: ScheduleStep, kind: DropoffMessageKind, withLink: boolean): Promise<DeliverResult> {
  if (!appDropoffSendEnabled()) return { outcome: 'logged' };
  // While a test list is set, nobody else is messaged. The step is used up (not saved for later), so clearing the list never sends a backlog.
  if (notOnTestList(r.phone)) return { outcome: 'skipped', reason: 'not on the test-number list' };
  if (withLink && !r.token) return { outcome: 'skipped', reason: 'no link to carry' };

  const cfg = await getProviderConfig('voxvalley');
  const messages = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, cfg.settings.dropoffMessages);
  const labels = { ...DROPOFF_STEP_LABELS, ...((cfg.settings.dropoffStepLabels as Partial<Record<DropoffStatus, string>> | undefined) ?? {}) };
  const stepLabel = labels[r.dropStatus as DropoffStatus] ?? DROPOFF_STEP_LABELS.application_filled;
  const link = withLink && r.token ? buildInstallLink(downloads.publicBase, r.token) : '';

  if (step.channel === 'sms') {
    const ref = pickSms(messages, kind, withLink);
    if (!ref) return { outcome: 'skipped', reason: 'sms template not configured' };
    if (!(await smsConfigured())) return { outcome: 'skipped', reason: 'sms gateway not configured' };
    const text = renderSmsBody(ref.body!, { name: r.firstName, step: stepLabel, link });
    const res = await sendVoxSms({ phone: r.phone, body: text, templateId: ref.templateId, track: { kind: 'app_dropoff', customerId: r.customerId } });
    return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: (res.error ?? 'sms failed').slice(0, 200) };
  }

  // The offers template carries the application reference and how many offers there are; read them fresh at send time.
  const app = await prisma.loanApplication.findFirst({
    where: { userId: r.userId }, orderBy: { updatedAt: 'desc' }, select: { ref: true, _count: { select: { offers: true } } },
  });
  const msg = resolveWhatsappMessage(messages, kind, withLink, {
    name: r.firstName ?? 'there', step: stepLabel, link, ref: app?.ref ?? null, offerCount: app?._count.offers ?? null,
  });
  if (!msg.ok) return { outcome: 'skipped', reason: msg.reason };
  if (!(await whatsappConfigured())) return { outcome: 'skipped', reason: 'whatsapp not configured' };
  const res = await sendWhatsAppTemplate({
    phone: r.phone, templateName: msg.template, language: msg.language, placeholders: msg.placeholders, category: msg.category, referenceId: `${r.id}:${step.index}`,
    track: {
      kind: 'app_dropoff', customerId: r.customerId,
      trigger: { by: 'Drop-off messages', stage: stepLabel, since: r.startAt.toISOString(), step: `Message ${step.index + 1} · ${step.label}` },
    },
  });
  return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: (res.error ?? 'whatsapp failed').slice(0, 200) };
}

/* ───────────────────────────────────── the job ───────────────────────────────────── */

export interface AppDropoffTickResult { armed: number; scanned: number; stopped: number; handled: number; completed: number; calls: number }

async function processRow(r: AppDropoff, now: Date, out: AppDropoffTickResult, cfg: ScheduleConfig): Promise<void> {
  const loaded = await loadSnapshot(r.userId);
  const statusNow = loaded ? deriveDropoff(loaded.snapshot).status : null;
  const reason = dropoffStopReason({
    armedStatus: r.dropStatus as DropoffStatus,
    statusNow,
    doNotContact: await isDoNotContact(r.phone),
  });
  if (reason) {
    await prisma.appDropoff.update({ where: { id: r.id }, data: { status: 'stopped', stopReason: reason } });
    out.stopped++;
    log.info('stopped', { id: r.id, reason, step: r.stepsSent });
    return;
  }

  const checkAfter = (stepsHandled: number, sentAt: Date | null) =>
    nextCheckTime({ cfg, now, startAt: r.startAt, stepsHandled, lastSentAt: sentAt, lastSeenAt: now, dropped: true });

  // The website install reminder (or a "you applied" sequence) is talking to this person: wait, never talk over it.
  if (await otherSequenceActive(r.phone)) {
    await prisma.appDropoff.update({ where: { id: r.id }, data: { nextCheckAt: new Date(now.getTime() + cfg.recheckMs) } });
    return;
  }

  const action = nextAction({ cfg, startAt: r.startAt, stepsHandled: r.stepsSent, lastSentAt: r.lastSentAt, now, inCallingWindow: withinCallingHours(now) });
  if (action.kind === 'wait') {
    await prisma.appDropoff.update({ where: { id: r.id }, data: { nextCheckAt: checkAfter(r.stepsSent, r.lastSentAt) } });
    return;
  }
  if (action.kind === 'finished') {
    await prisma.appDropoff.update({ where: { id: r.id }, data: { status: 'completed' } });
    out.completed++;
    return;
  }

  // Claim the step before doing anything: a second worker or a re-run finds stepsSent already moved on.
  const claimed = await prisma.appDropoff.updateMany({ where: { id: r.id, status: 'active', stepsSent: r.stepsSent }, data: { stepsSent: r.stepsSent + 1 } });
  if (claimed.count !== 1) return;

  const kind = messageKindFor(r.dropStatus as DropoffStatus) ?? 'continue';
  const withLink = includeAppLink(kind, await alreadyInApp(r.phone));
  const step = action.step;
  const result: DeliverResult = action.kind === 'skip' ? { outcome: 'skipped', reason: action.reason } : await deliver(r, step, kind, withLink);
  const entry: DropoffHistoryEntry = {
    step: step.index, channel: step.channel, label: step.label, at: now.toISOString(), outcome: result.outcome,
    ...(result.reason ? { reason: result.reason } : {}), message: kind, withLink,
  };
  const sentNow = result.outcome === 'sent' || result.outcome === 'logged';
  const newLast = sentNow ? now : r.lastSentAt;
  const isLast = step.index === cfg.steps.length - 1;
  await prisma.appDropoff.update({
    where: { id: r.id },
    data: {
      history: [...readHistory(r), entry] as unknown as object,
      ...(sentNow ? { lastSentAt: now } : {}),
      ...(isLast ? { status: 'completed' } : { nextCheckAt: checkAfter(r.stepsSent + 1, newLast) }),
    },
  });
  out.handled++;
  log.info(result.outcome === 'logged' ? 'would send (log-only)' : result.outcome, { id: r.id, drop: r.dropStatus, step: step.index, channel: step.channel, message: kind, withLink, reason: result.reason });
  if (isLast) out.completed++;
}

/** One pass: arm newly stopped people, then work the runs that are due, oldest first. Safe to run every minute and from several workers. */
export async function appDropoffTick(now: Date = new Date()): Promise<AppDropoffTickResult> {
  const out: AppDropoffTickResult = { armed: 0, scanned: 0, stopped: 0, handled: 0, completed: 0, calls: 0 };
  const armed = await armAppDropoffs(now);
  out.armed = armed.created;
  out.stopped += armed.stopped;
  const cfg = dropoffConfig();
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await prisma.appDropoff.findMany({ where: { status: 'active', nextCheckAt: { lte: now } }, orderBy: { nextCheckAt: 'asc' }, take: PAGE_SIZE });
    if (!rows.length) break;
    for (const r of rows) {
      out.scanned++;
      try {
        await processRow(r, now, out, cfg);
      } catch (e) {
        log.error('tick failed for one drop-off', { id: r.id, error: (e as Error).message }); // one bad row never aborts the scan
        await prisma.appDropoff.update({ where: { id: r.id }, data: { nextCheckAt: new Date(now.getTime() + 5 * 60_000) } }).catch(() => undefined);
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }
  // The follow-up call for people who got no offers. A problem here must never stop the messages above, so it is isolated.
  try {
    out.calls = (await placeNoOffersCalls(now)).placed;
  } catch (e) {
    log.error('no-offers call pass failed', { error: (e as Error).message });
  }
  return out;
}

let lastThrottledRun = 0;
/** What the scheduler calls every minute: runs the real tick no more often than "Reminder job runs every" (Admin → Timings). */
export async function appDropoffTickThrottled(nowMs: number = Date.now()): Promise<AppDropoffTickResult | null> {
  if (nowMs - lastThrottledRun < timing.minutesMs('install.jobEveryMinutes') - 5_000) return null;
  lastThrottledRun = nowMs;
  return appDropoffTick(new Date(nowMs));
}

/** Test hook. */
export function resetAppDropoffThrottle() {
  lastThrottledRun = 0;
}
