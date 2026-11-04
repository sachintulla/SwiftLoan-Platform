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
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { isReviewPhone } from './reviewLogin.js';
import { withinCallingHours } from './leadCaller.js';
import { scoped } from './log.js';
import { timing, hasStageSchedule, stageScheduleRows } from './timings.js';
import { dropoffStageOf } from './stageSchedules.js';
import { alreadyInApp, notOnTestList, reminderSendsWhatsapp, tidyName, type HistoryEntry, type HistoryOutcome } from './installReminder.js';
import { placeNoOffersCalls } from './noOffersCall.js';
import { placeDropoffCall } from './dropoffCall.js';
import { PAN_PENDING_SMS, sendRegisteredSms } from './smsRoute.js';
import { touchAllowed } from './contactPolicy.js';
import { sendMissedCallNotes } from './missedCallNote.js';
import { sendSmsFallbacks } from './smsFallback.js';
import { CUSTOMER_ACTION_CHANNELS, SYSTEM_EVENT_NAMES } from './journey.js';
import { dailyRows, returnVerdict } from './dropoffDaily.js';
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
/** After a run that finished (or stopped for anything but their coming back), the same drop point is not messaged again for this long. Admin → Timings limits.dropoffRerunDays. */
const rerunAfterMs = () => timing.daysMs('limits.dropoffRerunDays');

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

export async function loadSnapshot(userId: string): Promise<{ snapshot: DropoffSnapshot; user: { phone: string; firstName: string | null } } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true, firstName: true, panOnFile: true, updatedAt: true } });
  if (!user?.phone) return null;
  // When they verified their number (either surface records `otp_verified`); the step before the PAN.
  const otp = await prisma.journeyEvent.findFirst({ where: { customer: { phone: user.phone }, name: 'otp_verified' }, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } });
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
      otpVerifiedAt: otp?.occurredAt ?? null,
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

/**
 * True while another message sequence that is really SENDING already owns this phone, so two never overlap. A sequence whose
 * switch is off is log-only and must not silence this one (this is the one WhatsApp journey; the others are kept off).
 */
async function otherSequenceActive(phone: string): Promise<boolean> {
  const [reminder, nudge] = await Promise.all([
    timing.bool('install.sendEnabled')
      ? prisma.journeyReminder.findFirst({ where: { phone, status: 'active' }, select: { unverified: true, lastStep: true } })
      : Promise.resolve(null),
    timing.bool('applied.sendEnabled') ? prisma.lenderNudge.findFirst({ where: { phone, status: 'active' }, select: { id: true } }) : Promise.resolve(null),
  ]);
  // An SMS-only website reminder does not own the person: its SMS and this job's WhatsApp are the two halves of one journey.
  return (!!reminder && reminderSendsWhatsapp(reminder)) || !!nudge;
}

/**
 * The person's last action anywhere: an app screen/event (`ActivityEvent`), a website "still here" ping (`JourneyReminder.lastSeenAt`)
 * or a journey event THEY caused (channel website/app). The drop-off clock runs from this, never from when a step was saved.
 * Never from anything we did: a nudge, a stall detection or a call is not the customer coming back (`Customer.lastActivityAt` used
 * to be bumped by those, so it is not read here).
 */
export async function lastActivityFor(userId: string, phone: string, fallback: Date): Promise<Date> {
  const [ev, jr, je] = await Promise.all([
    prisma.activityEvent.findFirst({
      where: { userId, eventType: { not: 'system' }, eventName: { notIn: [...SYSTEM_EVENT_NAMES] } }, orderBy: { ts: 'desc' }, select: { ts: true },
    }),
    prisma.journeyReminder.findFirst({ where: { userId }, orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }),
    prisma.journeyEvent.findFirst({
      where: { customer: { phone }, channel: { in: [...CUSTOMER_ACTION_CHANNELS] }, name: { notIn: [...SYSTEM_EVENT_NAMES] } },
      orderBy: { occurredAt: 'desc' }, select: { occurredAt: true },
    }),
  ]);
  const ms = Math.max(fallback.getTime(), ev?.ts.getTime() ?? 0, jr?.lastSeenAt.getTime() ?? 0, je?.occurredAt.getTime() ?? 0);
  return new Date(ms);
}

/* ───────────────────────────────────── arming ───────────────────────────────────── */

async function armOne(userId: string, now: Date): Promise<'created' | 'stopped' | 'skipped'> {
  const loaded = await loadSnapshot(userId);
  if (!loaded) return 'skipped';
  const { snapshot, user } = loaded;
  const state: DropoffState = deriveDropoff(snapshot);

  const active = await prisma.appDropoff.findFirst({ where: { userId, status: 'active' } });
  const idleMs = timing.minutesMs('dropoff.idleMinutes');
  const lastActivity = state.since ? await lastActivityFor(userId, user.phone, state.since) : null;
  // "No offers" is a critical moment (Sachin's review): the follow-up call goes straight away, so coming back to the app never
  // restarts or ends that run, and it does not wait for them to go idle.
  const critical = state.status === 'rejected';
  if (active && active.dropStatus === state.status) {
    if (critical) return 'skipped';
    // Still at the same step. Came back since the run was anchored? Before any message: restart the clock from the new last action
    // once they are idle again. After a message: the run is over (they acted); if they stop again a fresh run starts.
    const verdict = lastActivity ? returnVerdict({ startAt: active.startAt, stepsSent: active.stepsSent, lastActivityAt: lastActivity, now, idleMs }) : 'none';
    if (verdict === 'reanchor') {
      await prisma.appDropoff.update({ where: { id: active.id }, data: { startAt: lastActivity!, nextCheckAt: now, history: [...readHistory(active), { step: -1, channel: 'whatsapp', label: 'clock restarted', at: now.toISOString(), outcome: 'skipped', reason: `they came back; counting from ${lastActivity!.toISOString()}`, message: 'continue', withLink: false }] as unknown as object } });
    } else if (verdict === 'returned') {
      await prisma.appDropoff.update({ where: { id: active.id }, data: { status: 'stopped', stopReason: 'returned' } });
      log.info('stopped', { id: active.id, reason: 'returned', step: active.stepsSent });
      return 'stopped';
    }
    return 'skipped';
  }
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

  const since = critical ? state.since! : lastActivity!;
  if (!critical && now.getTime() - since.getTime() < idleMs) return 'skipped'; // still active: not stopped yet
  // Never message old history: BOTH the step itself and their last action must be recent. Someone rejected weeks ago who merely
  // opened the app today is not "someone who just got no offers".
  const maxAgeMs = timing.hoursMs('dropoff.maxAgeHours');
  if (now.getTime() - since.getTime() > maxAgeMs || now.getTime() - state.since!.getTime() > maxAgeMs) return 'skipped';

  // A run that ended because they came back may be followed by a new one (they stopped again); any other recent run blocks a repeat.
  const recent = await prisma.appDropoff.findFirst({
    where: { userId, dropStatus: state.status, createdAt: { gte: new Date(now.getTime() - rerunAfterMs()) }, NOT: { stopReason: 'returned' } },
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
  const [apps, pans, events, pings, otps] = await Promise.all([
    prisma.loanApplication.findMany({ where: { updatedAt: { gte: since } }, orderBy: { updatedAt: 'asc' }, take: ARM_BATCH, select: { userId: true } }),
    prisma.user.findMany({ where: { panOnFile: true, updatedAt: { gte: since }, applications: { none: {} } }, orderBy: { updatedAt: 'asc' }, take: ARM_BATCH, select: { id: true } }),
    // The clock runs from the last ACTION, so someone whose step was saved days ago but who was in the app today is a candidate too.
    prisma.activityEvent.findMany({ where: { ts: { gte: since }, userId: { not: null } }, distinct: ['userId'], take: ARM_BATCH, select: { userId: true } }),
    prisma.journeyReminder.findMany({ where: { lastSeenAt: { gte: since } }, distinct: ['userId'], take: ARM_BATCH, select: { userId: true } }),
    // Verified the number and stopped before the PAN: the earliest step of the journey.
    prisma.journeyEvent.findMany({ where: { name: 'otp_verified', occurredAt: { gte: since } }, distinct: ['customerId'], take: ARM_BATCH, select: { customer: { select: { userId: true } } } }),
  ]);
  const userIds = [...new Set([...apps.map((a) => a.userId), ...pans.map((u) => u.id), ...events.map((e) => e.userId!), ...pings.map((p) => p.userId), ...otps.map((o) => o.customer.userId).filter((id): id is string => !!id)])];
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
async function deliver(r: AppDropoff, step: ScheduleStep, kind: DropoffMessageKind, withLink: boolean, now: Date = new Date()): Promise<DeliverResult> {
  if (!appDropoffSendEnabled()) return { outcome: 'logged' };
  // While a test list is set, nobody else is messaged. The step is used up (not saved for later), so clearing the list never sends a backlog.
  if (notOnTestList(r.phone)) return { outcome: 'skipped', reason: 'not on the test-number list' };
  // The one contact limit (contactPolicy.ts): touches per day / week, and never a call and a new message on the same day.
  const allowed = await touchAllowed(r.phone, step.channel === 'call' ? 'call' : 'message', now);
  if (!allowed.ok) return { outcome: 'skipped', reason: allowed.reason };
  // A call step of a stage timeline (dropoffCall.ts): Ruby, not a message, so the link and template do not apply.
  if (step.channel === 'call') return placeDropoffCall(r, step.index, now);
  if (withLink && !r.token) return { outcome: 'skipped', reason: 'no link to carry' };

  const cfg = await getProviderConfig('voxvalley');
  const messages = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, cfg.settings.dropoffMessages);
  const labels = { ...DROPOFF_STEP_LABELS, ...((cfg.settings.dropoffStepLabels as Partial<Record<DropoffStatus, string>> | undefined) ?? {}) };
  const stepLabel = labels[r.dropStatus as DropoffStatus] ?? DROPOFF_STEP_LABELS.application_filled;
  const link = withLink && r.token ? buildInstallLink(downloads.publicBase, r.token) : '';

  if (step.channel === 'sms') {
    // The two registered texts (smsRoute.ts): an app user stopped before PAN gets "verify your PAN"; everyone else the link text. Someone
    // already in the app has no personal link, so the plain app link (/dl) goes in its place.
    const ref = r.dropStatus === 'otp_verified' && !withLink ? PAN_PENDING_SMS : pickSms(messages, kind, withLink);
    if (!ref) return { outcome: 'skipped', reason: 'sms template not configured' };
    const text = renderSmsBody(ref.body!, { name: r.firstName, step: stepLabel, link: link || `${downloads.publicBase}/dl` });
    const res = await sendRegisteredSms({ phone: r.phone, templateId: ref.templateId!, text, track: { kind: 'app_dropoff', customerId: r.customerId } });
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

/**
 * The rules for one run: the shared schedule plus the daily reminders, except a stage with its own saved timeline (Configs → Stage outreach)
 * uses that timeline ALONE (its messages, calls and set-time days; no daily 7 AM reminders, and inactiveCall.ts leaves it out too).
 */
export function dropoffConfigFor(status: string, base: ScheduleConfig, startAt: Date): ScheduleConfig {
  const stage = dropoffStageOf(status);
  if (hasStageSchedule('dropoff.schedule', stage)) return { ...base, steps: stepsFromRows(stageScheduleRows('dropoff.schedule', stage), startAt) };
  const first = timing.schedule('dropoff.schedule');
  // The journey: the first message(s) counted from the last action, then one WhatsApp at `dropoff.dailyAt` each day for `dropoff.dailyDays`.
  return { ...base, steps: stepsFromRows([...first, ...dailyRows(startAt, first, timing.num('dropoff.dailyAt'), timing.num('dropoff.dailyDays'))]) };
}

async function processRow(r: AppDropoff, now: Date, out: AppDropoffTickResult, baseCfg: ScheduleConfig): Promise<void> {
  const cfg = dropoffConfigFor(r.dropStatus, baseCfg, r.startAt);
  const loaded = await loadSnapshot(r.userId);
  const statusNow = loaded ? deriveDropoff(loaded.snapshot).status : null;
  // Any action since the run was anchored: restart the clock (nothing sent yet) or end the run (a message went out). The arming
  // pass does the same, but it only sees people with recent activity rows; this covers every run that is due.
  const lastActivity = await lastActivityFor(r.userId, r.phone, r.startAt);
  const back = r.dropStatus === 'rejected' ? 'none' // "no offers": activity never restarts or ends it (see armOne)
    : returnVerdict({ startAt: r.startAt, stepsSent: r.stepsSent, lastActivityAt: lastActivity, now, idleMs: timing.minutesMs('dropoff.idleMinutes') });
  if (back === 'returned') {
    await prisma.appDropoff.update({ where: { id: r.id }, data: { status: 'stopped', stopReason: 'returned' } });
    out.stopped++;
    log.info('stopped', { id: r.id, reason: 'returned', step: r.stepsSent });
    return;
  }
  if (back === 'not_idle') {
    await prisma.appDropoff.update({ where: { id: r.id }, data: { nextCheckAt: new Date(now.getTime() + timing.minutesMs('dropoff.idleMinutes')) } });
    return;
  }
  if (back === 'reanchor') {
    await prisma.appDropoff.update({ where: { id: r.id }, data: { startAt: lastActivity, nextCheckAt: now } });
    r = { ...r, startAt: lastActivity };
    return processRow(r, now, out, baseCfg);
  }
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
  const result: DeliverResult = action.kind === 'skip' ? { outcome: 'skipped', reason: action.reason } : await deliver(r, step, kind, withLink, now);
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
  // "Sorry we missed you" after an unanswered timeline call (missedCallNote.ts), isolated the same way.
  try {
    await sendMissedCallNotes(now);
  } catch (e) {
    log.error('missed-call note pass failed', { error: (e as Error).message });
  }
  // WhatsApp not delivered in time → the same step by SMS (smsFallback.ts), isolated the same way.
  try {
    await sendSmsFallbacks(now);
  } catch (e) {
    log.error('sms fallback pass failed', { error: (e as Error).message });
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
