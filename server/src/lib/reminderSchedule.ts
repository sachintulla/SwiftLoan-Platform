/**
 * Pure rules for the website drop-off install reminders. No database, no clock, no network: every
 * input is passed in, so the whole cadence is unit-tested (reminderSchedule.test.ts).
 *
 * The schedule (offsets from `startAt`), SMS first and WhatsApp 30 minutes after each SMS:
 *   start, +4h, +8h, then every day for 7 days (day 1 … day 7)   → 10 points × 2 = 20 messages.
 * A message due outside the calling window waits for it to open; one that is far too late
 * (the server was down) is skipped rather than sent at a stale time.
 */

import { DEFAULT_SCHEDULE, type ScheduleRow } from './timings.js';

export type ReminderChannel = 'sms' | 'whatsapp' | 'call';
export type LastStep = 'otp_requested' | 'otp_only' | 'pan_done' | 'application_started' | 'offers_ready';
export type StopReason = 'installed' | 'app_login' | 'application_finished' | 'do_not_contact' | 'returned';

export interface ScheduleStep {
  index: number;
  channel: ReminderChannel;
  /** Milliseconds after `startAt` that this step becomes due. */
  offsetMs: number;
  label: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** WhatsApp always follows its SMS by this long. */
export const WHATSAPP_GAP_MS = 30 * MIN;
/** The visitor counts as dropped off after this long with no activity on the website. */
export const IDLE_MS = 5 * MIN;
/** A step this far past its due time is skipped, not sent (covers a night of quiet hours, not an outage). */
export const MAX_LATE_MS = 14 * HOUR;
/** Never two messages closer together than this, whatever is due (e.g. after quiet hours end). */
export const MIN_GAP_MS = 30 * MIN;
/** A visitor who keeps coming back and leaving gets at most this many separate runs. */
export const MAX_CYCLES = 3;

/** "start", "+30m", "+4h", "+1h30m", "day 3", "day 3 +4h": a readable name for how long after the drop-off a step is due. */
export function offsetLabel(minutes: number): string {
  if (minutes <= 0) return 'start';
  if (minutes < 60) return `+${minutes}m`;
  if (minutes < 1440) return minutes % 60 === 0 ? `+${minutes / 60}h` : `+${Math.floor(minutes / 60)}h${minutes % 60}m`;
  const days = Math.floor(minutes / 1440);
  const rest = minutes % 1440;
  if (rest === 0) return `day ${days}`;
  return `day ${days} ${offsetLabel(rest)}`;
}

const IST_OFFSET_MS = 330 * MIN;
const DAY_MS = 24 * HOUR;

/** "day 3 19:00": a set-time row's name (day × 1440 + minute of the India day). */
export function clockLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440);
  const m = minutes % 1440;
  return `day ${day} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * The schedule as the code uses it, from the editable rows (admin → Timings). A set-time row (`atClock`, stage timelines only) becomes
 * a delay once `startAt` is known: that India day (startAt's day + N) at that clock time. Without `startAt` it is read as a plain delay.
 * Steps are kept in time order, so a set-time row sits between the delays around it.
 */
export function stepsFromRows(rows: readonly ScheduleRow[], startAt?: Date): ScheduleStep[] {
  const steps = rows.map((r) => {
    let offsetMs = r.afterMinutes * MIN;
    if (r.atClock && startAt) {
      const localDayStart = Math.floor((startAt.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
      offsetMs = localDayStart + r.afterMinutes * MIN - startAt.getTime();
    }
    return { channel: r.channel, offsetMs, label: `${r.atClock ? clockLabel(r.afterMinutes) : offsetLabel(r.afterMinutes)} ${r.channel}` };
  });
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.offsetMs - b.s.offsetMs || a.i - b.i)
    .map(({ s }, index) => ({ index, ...s }));
}

export const SCHEDULE_STEPS: readonly ScheduleStep[] = Object.freeze(stepsFromRows(DEFAULT_SCHEDULE));

/** Everything about the schedule that an admin can change. `DEFAULT_SCHEDULE_CONFIG` is how it behaves out of the box. */
export interface ScheduleConfig {
  steps: readonly ScheduleStep[];
  idleMs: number;
  minGapMs: number;
  maxLateMs: number;
  recheckMs: number;
}

export function stepDueAt(startAt: Date, step: ScheduleStep): Date {
  return new Date(startAt.getTime() + step.offsetMs);
}

export type NextAction =
  | { kind: 'finished' }
  | { kind: 'wait'; step: ScheduleStep; reason: 'not_due' | 'quiet_hours' | 'gap'; dueAt: Date }
  | { kind: 'skip'; step: ScheduleStep; reason: 'too_late' }
  | { kind: 'send'; step: ScheduleStep };

export interface NextActionInput {
  /** The schedule rules; omit for the defaults. */
  cfg?: ScheduleConfig;
  startAt: Date;
  /** How many steps have already been handled (sent, logged or skipped). */
  stepsHandled: number;
  lastSentAt: Date | null;
  now: Date;
  /** Whether `now` is inside the calling window. */
  inCallingWindow: boolean;
}

/** What to do with the reminder right now. Handles one step at a time. */
export function nextAction(i: NextActionInput): NextAction {
  const cfg = i.cfg ?? DEFAULT_SCHEDULE_CONFIG;
  const step = cfg.steps[i.stepsHandled];
  if (!step) return { kind: 'finished' };

  const dueAt = stepDueAt(i.startAt, step);
  if (i.now.getTime() < dueAt.getTime()) return { kind: 'wait', step, reason: 'not_due', dueAt };
  if (i.now.getTime() - dueAt.getTime() > cfg.maxLateMs) return { kind: 'skip', step, reason: 'too_late' };
  if (!i.inCallingWindow) return { kind: 'wait', step, reason: 'quiet_hours', dueAt };
  if (i.lastSentAt && i.now.getTime() - i.lastSentAt.getTime() < cfg.minGapMs) {
    return { kind: 'wait', step, reason: 'gap', dueAt };
  }
  return { kind: 'send', step };
}

/**
 * Where the visitor got to, from what the server knows about them. `offersReady` (offers shown, none applied for) is only passed by
 * the reminder job: the app's resume flow (journeyResume.ts) leaves it out and keeps the three steps it understands.
 */
export function deriveLastStep(i: { panOnFile: boolean; hasApplication: boolean; unverified?: boolean; offersReady?: boolean }): LastStep {
  if (i.unverified) return 'otp_requested';
  if (i.hasApplication) return i.offersReady ? 'offers_ready' : 'application_started';
  return i.panOnFile ? 'pan_done' : 'otp_only';
}

export function isIdle(lastSeenAt: Date, now: Date, idleMs: number = IDLE_MS): boolean {
  return now.getTime() - lastSeenAt.getTime() >= idleMs;
}

export interface StopInput {
  doNotContact: boolean;
  /** The install was matched through the link's reference ID. */
  installed: boolean;
  /** The person has logged in to the app. */
  appLogin: boolean;
  /** The application reached the lender or beyond. */
  applicationFinished: boolean;
  /** Seen on the website again after being marked dropped off. */
  returned: boolean;
}

/** The first reason (in priority order) the reminders must stop, or null to carry on. */
export function stopReason(i: StopInput): StopReason | null {
  if (i.doNotContact) return 'do_not_contact';
  if (i.installed) return 'installed';
  if (i.appLogin) return 'app_login';
  if (i.applicationFinished) return 'application_finished';
  if (i.returned) return 'returned';
  return null;
}

/** Application statuses that count as "finished" for the visitor: the lender took over or it ended. */
export const FINISHED_APPLICATION_STATUSES = ['handoff', 'under_review', 'approved', 'rejected', 'disbursed', 'closed'] as const;

export function isFinishedApplicationStatus(status: string | null | undefined): boolean {
  return !!status && (FINISHED_APPLICATION_STATUSES as readonly string[]).includes(status);
}

/**
 * The lookup ended with no offers because the number is already registered with the lender (stored as `failed` + `duplicate`, see
 * dropoffSteps.ts). Like a rejection, there is nothing left for them to finish, so "your application is incomplete" would be untrue.
 * A plain `failed` (technical error) is not this: they can still retry, so the reminders carry on.
 */
export function isNoOffersOutcome(a: { status: string | null | undefined; prequalifyReason?: string | null }): boolean {
  return a.status === 'failed' && a.prequalifyReason === 'duplicate';
}

/** The app link: opens the store or TestFlight and records the click against this visitor's reference ID. */
export function buildInstallLink(publicBase: string, token: string): string {
  return `${publicBase.replace(/\/$/, '')}/dl?ref=${encodeURIComponent(token)}`;
}

/**
 * What the message calls the step the visitor is STUCK ON: the sentence reads "incomplete at <step>", so each label is
 * the next website step they have not finished, not the one they just completed (an operator setting `installStepLabels`
 * can override any of these). The website's steps: 1 PAN verification, 2 Basic details, 3 Finding offers.
 *   otp_requested       asked for an OTP, never entered it → the OTP step
 *   otp_only            mobile verified, PAN not done      → step 1
 *   pan_done            PAN done, details not submitted    → step 2
 *   application_started details submitted (application row) → step 3
 *   offers_ready        offers shown, none applied for     → choosing one
 */
export const DEFAULT_STEP_LABELS: Readonly<Record<LastStep, string>> = Object.freeze({
  otp_requested: 'OTP verification',
  otp_only: 'PAN verification',
  pan_done: 'Basic details',
  application_started: 'Finding offers',
  offers_ready: 'Choosing an offer',
});

/** A DLT variable is capped (30 characters is common): keep the whole name if it fits, else its first word. */
const SMS_NAME_MAX = 30;

/**
 * The registered SMS text with its variables filled in. `{link}` is required by the caller; `{name}` falls back to
 * "Customer" (the same greeting the registered texts use) and `{step}` is the step label. Every occurrence is replaced.
 */
export function renderSmsBody(body: string, v: { name: string | null | undefined; step: string; link: string }): string {
  const trimmed = (v.name ?? '').trim();
  const name = !trimmed ? 'Customer' : trimmed.length <= SMS_NAME_MAX ? trimmed : trimmed.split(/\s+/)[0].slice(0, SMS_NAME_MAX);
  return body.split('{name}').join(name).split('{step}').join(v.step).split('{link}').join(v.link);
}

/** How soon to look again at a step that is due but held back (quiet hours). */
export const QUIET_RECHECK_MS = 15 * MIN;

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = Object.freeze({
  steps: SCHEDULE_STEPS,
  idleMs: IDLE_MS,
  minGapMs: MIN_GAP_MS,
  maxLateMs: MAX_LATE_MS,
  recheckMs: QUIET_RECHECK_MS,
});

/**
 * When a reminder next needs attention: the earlier of its next step becoming sendable and, until the visitor
 * has been saved as dropped off, the moment they would count as idle. Lets the job pick up only rows that are due.
 */
export function nextCheckTime(i: {
  cfg?: ScheduleConfig;
  now: Date;
  startAt: Date;
  stepsHandled: number;
  lastSentAt: Date | null;
  lastSeenAt: Date;
  dropped: boolean;
}): Date {
  const cfg = i.cfg ?? DEFAULT_SCHEDULE_CONFIG;
  const candidates: number[] = [];
  const step = cfg.steps[i.stepsHandled];
  // Until they are saved as dropped off no message can be sent, so only the idle check matters.
  if (step && i.dropped) {
    let at = stepDueAt(i.startAt, step).getTime();
    if (i.lastSentAt) at = Math.max(at, i.lastSentAt.getTime() + cfg.minGapMs);
    // Already sendable but not sent (it is held for quiet hours): look again soon rather than every minute.
    candidates.push(at <= i.now.getTime() ? i.now.getTime() + cfg.recheckMs : at);
  }
  if (!i.dropped) candidates.push(Math.max(i.lastSeenAt.getTime() + cfg.idleMs, i.now.getTime() + 1000));
  return new Date(candidates.length ? Math.min(...candidates) : i.now.getTime() + cfg.recheckMs);
}
