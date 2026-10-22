/**
 * Pure rules for the "you applied with <lender>, install the app to track it" messages. No database, no clock, no
 * network, so they are unit-tested (lenderNudgeRules.test.ts). The schedule itself reuses reminderSchedule.ts.
 *
 * Why this exists: lenders do not report back to us, so after someone taps Apply the only thing we can truthfully say
 * is "you applied with <lender>"; the app is where we can track and show them updates. We never claim a status
 * (under review, approved) that we have not been told.
 */

export type LenderNudgeStop = 'installed' | 'app_login' | 'lender_finished' | 'do_not_contact' | 'in_app' | 'no_link' | 'review_phone';

/** A lender application in one of these states is over: telling the person to "track it" no longer helps. */
export const LENDER_FINISHED_STATUSES = ['rejected', 'disbursed', 'closed'] as const;

export function isLenderFinished(status: string | null | undefined): boolean {
  return !status || (LENDER_FINISHED_STATUSES as readonly string[]).includes(status);
}

export interface LenderNudgeStopInput {
  doNotContact: boolean;
  /** The install was matched through this person's link. */
  installed: boolean;
  /** They have logged in to the app. */
  appLogin: boolean;
  /** This lender application ended (or no longer exists). */
  lenderFinished: boolean;
}

/** The first reason (in priority order) this lender's messages must stop, or null to carry on. */
export function lenderNudgeStopReason(i: LenderNudgeStopInput): LenderNudgeStop | null {
  if (i.doNotContact) return 'do_not_contact';
  if (i.installed) return 'installed';
  if (i.appLogin) return 'app_login';
  if (i.lenderFinished) return 'lender_finished';
  return null;
}

/** What the message calls a lender whose name we did not store. */
export const FALLBACK_LENDER = 'your chosen lender';
/** A DLT variable is capped (30 characters is common). */
const VAR_MAX = 30;

/** The lender's name as it goes into a template variable: trimmed, single-spaced, capped. */
export function tidyLender(name: string | null | undefined): string {
  const t = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return FALLBACK_LENDER;
  return t.length <= VAR_MAX ? t : t.slice(0, VAR_MAX).trim();
}

/**
 * The registered SMS text with its variables filled in. `{link}` is required by the caller. `{name}` falls back to
 * "Customer" (the greeting the registered texts use); `{lender}` is the lender's name. Every occurrence is replaced.
 */
export function renderAppliedSms(body: string, v: { name: string | null | undefined; lender: string | null | undefined; link: string }): string {
  const trimmed = (v.name ?? '').trim();
  const name = !trimmed ? 'Customer' : trimmed.length <= VAR_MAX ? trimmed : trimmed.split(/\s+/)[0].slice(0, VAR_MAX);
  return body.split('{name}').join(name).split('{lender}').join(tidyLender(v.lender)).split('{link}').join(v.link);
}

/**
 * One person applying to several lenders must not get those lenders' messages back to back. A sequence's OWN steps
 * keep exactly the spacing the schedule gives them; only a message that would follow ANOTHER lender's message too
 * closely waits. Returns when it may go, or null when it can go now.
 */
export function crossLenderWait(now: Date, otherLenderLastSent: Date | null | undefined, gapMs: number): Date | null {
  if (!otherLenderLastSent || gapMs <= 0) return null;
  const free = otherLenderLastSent.getTime() + gapMs;
  return now.getTime() < free ? new Date(free) : null;
}
