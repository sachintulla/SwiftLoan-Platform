/**
 * Pure rules for the drop-off call (lib/inactiveCall.ts): on each of the `days` India days AFTER the day someone stopped, one call
 * at `callAtMinute`, as long as they have done nothing since. Tested in inactiveCallRules.test.ts.
 */
import type { DropoffStatus } from './dropoffSteps.js';
import { istDayStart } from './stallCallLimits.js';

const DAY_MS = 86_400_000;

export type InactiveSkip =
  | 'acted_since' | 'not_yet_time' | 'past_last_day' | 'same_day' | 'nothing_started' | 'journey_over' | 'called_today' | 'after_message'
  | 'outside_hours' | 'not_allowed' | 'do_not_contact' | 'daily_limit';

/** Which day after the stop `now` is: 0 = the day they stopped, 1 = the next day … (India days). */
export function dayAfterStop(stoppedAt: Date, now: Date): number {
  return Math.round((istDayStart(now).getTime() - istDayStart(stoppedAt).getTime()) / DAY_MS);
}

export function inactiveCallDue(i: {
  /** Their last action (the run's anchor). */
  stoppedAt: Date;
  now: Date;
  /** Minutes after midnight IST when the call goes out. */
  callAtMinute: number;
  /** How many days after the stop day get a call (3 = days 1, 2, 3). */
  days: number;
  /** Where they stopped (deriveDropoff); null = nothing started. */
  status: DropoffStatus | null;
  /** A drop-off call to this person already today. */
  calledToday: boolean;
  /** A push / SMS / WhatsApp to this person inside calls.quietAfterMessageMinutes. */
  messagedRecently: boolean;
  inCallingHours: boolean;
  /** Master call switch on AND the number passes the call test-number list. */
  callAllowed: boolean;
  doNotContact: boolean;
  dailyLimitReached: boolean;
}): { due: true; day: number } | { due: false; reason: InactiveSkip } {
  const day = dayAfterStop(i.stoppedAt, i.now);
  if (day < 1) return { due: false, reason: 'same_day' };
  if (day > i.days) return { due: false, reason: 'past_last_day' };
  if (!i.status) return { due: false, reason: 'nothing_started' };
  if (i.status === 'finished' || i.status === 'failed') return { due: false, reason: 'journey_over' };
  if (i.doNotContact) return { due: false, reason: 'do_not_contact' };
  const minute = Math.floor((i.now.getTime() - istDayStart(i.now).getTime()) / 60_000);
  if (minute < i.callAtMinute) return { due: false, reason: 'not_yet_time' };
  if (i.calledToday) return { due: false, reason: 'called_today' };
  if (i.dailyLimitReached) return { due: false, reason: 'daily_limit' };
  if (i.messagedRecently) return { due: false, reason: 'after_message' };
  if (!i.inCallingHours) return { due: false, reason: 'outside_hours' };
  if (!i.callAllowed) return { due: false, reason: 'not_allowed' };
  return { due: true, day };
}

/** What the agent is told, in plain words: where they stopped and how many days ago. Never a label or number read aloud. */
export function inactiveBrief(status: Exclude<DropoffStatus, 'finished' | 'failed'>, days: number, stepLabel: string): {
  reason: string; lastStep: string; expectedStep: string; help: string;
} {
  const since = days === 1 ? 'yesterday' : `${days} days ago`;
  const where: Record<typeof status, { last: string; next: string }> = {
    otp_verified: { last: 'verified their mobile number', next: 'verify their PAN' },
    pan_verified: { last: 'verified their PAN', next: 'fill in their basic details' },
    application_filled: { last: 'filled in their details', next: 'see their loan offers' },
    rejected: { last: 'checked for offers and none were found', next: 'wait for our update or try again later' },
    offers_not_applied: { last: 'received their loan offers', next: 'choose an offer and apply' },
    applied: { last: 'applied with a lender', next: 'track the application in the SwiftLoan app' },
  };
  const w = where[status];
  return {
    reason: `They ${w.last} ${since} and have done nothing since; the next step is to ${w.next}.`,
    lastStep: stepLabel,
    expectedStep: w.next,
    help:
      `Open by saying, kindly, that they left this ${since} and you wanted to check whether everything is alright. ` +
      'Ask why they have not continued and whether there was any problem (an error, a doubt, no time, not needed any more), and listen. ' +
      `Then, if they want, encourage them to ${w.next}. Do not ask for, or note down, any personal or application details.`,
  };
}
