/**
 * WS5b — campaign schedule evaluation.
 *
 * Pure, dependency-free rules for "may this campaign dial right now?" and
 * "when may this contact be attempted next?". Kept free of Prisma and of
 * network calls so the cadence logic can be reasoned about and unit-tested on
 * its own — the scheduler job in campaignRunner.ts does the I/O.
 *
 * Ello's campaign API cannot express any of this (it takes only a single
 * `scheduleTime`), which is exactly why it lives here.
 */
import type { Campaign, CampaignContact } from '@prisma/client';

/* ───────────────────────── timezone helpers ───────────────────────── */

/**
 * Local wall-clock parts for an instant in an IANA zone.
 *
 * Uses Intl rather than a timezone library: it is built in, always current with
 * the platform's tzdata, and handles DST without us storing offsets. Getting
 * this wrong is not academic — a naive `getHours()` would evaluate a 09:00–19:00
 * IST window against the server's own zone and dial customers at night.
 */
export function localParts(at: Date, timeZone: string): { minutes: number; weekday: number; dayKey: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    }).formatToParts(at);
  } catch {
    // Unknown zone — fall back to UTC rather than throwing inside a job tick.
    return localParts(at, 'UTC');
  }

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // 'en-US' with hour12:false renders midnight as '24' in some ICU versions.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    minutes: hour * 60 + minute,
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/** Format minutes-from-midnight as HH:MM, for UI and log messages. */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/* ───────────────────────── campaign-level gate ───────────────────────── */

export type SkipReason =
  | 'not_running'
  | 'before_start'
  | 'after_end'
  | 'outside_daily_window'
  | 'day_not_allowed';

export interface WindowCheck {
  canDial: boolean;
  reason?: SkipReason;
  /** Human-readable, surfaced in the dashboard so "why isn't it calling?" is answerable. */
  detail?: string;
}

/**
 * Whether a campaign may place calls at `now`. Checks, in order: status, the
 * overall start/end range, the allowed weekdays, and the daily calling window.
 */
export function canDialNow(campaign: Campaign, now: Date = new Date()): WindowCheck {
  if (campaign.status !== 'running') {
    return { canDial: false, reason: 'not_running', detail: `Campaign is ${campaign.status}` };
  }
  if (campaign.startAt && now < campaign.startAt) {
    return { canDial: false, reason: 'before_start', detail: `Starts ${campaign.startAt.toISOString()}` };
  }
  if (campaign.endAt && now > campaign.endAt) {
    return { canDial: false, reason: 'after_end', detail: `Ended ${campaign.endAt.toISOString()}` };
  }

  const { minutes, weekday } = localParts(now, campaign.timezone);

  if (campaign.daysOfWeek.length && !campaign.daysOfWeek.includes(weekday)) {
    return { canDial: false, reason: 'day_not_allowed', detail: `Not scheduled on this weekday` };
  }

  const { dailyStartMinute: start, dailyEndMinute: end } = campaign;
  // A window whose end is before its start wraps past midnight (e.g. 22:00→06:00).
  const inWindow = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;

  if (!inWindow) {
    return {
      canDial: false,
      reason: 'outside_daily_window',
      detail: `Outside ${formatMinutes(start)}–${formatMinutes(end)} ${campaign.timezone}`,
    };
  }
  return { canDial: true };
}

/* ───────────────────────── contact-level gate ───────────────────────── */

/**
 * Whether this contact may be attempted now, given the campaign's retry rules.
 * Assumes canDialNow() already passed.
 */
export function isContactEligible(
  campaign: Campaign,
  contact: CampaignContact,
  now: Date = new Date(),
): { eligible: boolean; reason?: string } {
  if (contact.state === 'called' && campaign.retryStrategy === 'once') {
    return { eligible: false, reason: 'already called (strategy: once)' };
  }
  if (contact.state === 'skipped') return { eligible: false, reason: 'skipped' };
  if (campaign.stopOnAnswer && contact.answered) return { eligible: false, reason: 'already answered' };
  if (contact.attempts >= campaign.maxAttemptsPerContact) {
    return { eligible: false, reason: `max attempts (${campaign.maxAttemptsPerContact}) reached` };
  }
  if (contact.nextEligibleAt && now < contact.nextEligibleAt) {
    return { eligible: false, reason: `next attempt at ${contact.nextEligibleAt.toISOString()}` };
  }

  // Per-day cap. The counter is keyed by local day, so it self-resets at
  // midnight in the campaign's zone without a separate reset job.
  const { dayKey } = localParts(now, campaign.timezone);
  const usedToday = contact.attemptDayKey === dayKey ? contact.attemptsToday : 0;

  if (campaign.retryStrategy === 'n_per_day' || campaign.retryStrategy === 'until_answered') {
    if (usedToday >= campaign.attemptsPerDay) {
      return { eligible: false, reason: `daily cap (${campaign.attemptsPerDay}) reached` };
    }
  }
  if (campaign.retryStrategy === 'once' && contact.attempts >= 1) {
    return { eligible: false, reason: 'already attempted (strategy: once)' };
  }
  return { eligible: true };
}

/**
 * The bookkeeping to apply after an attempt: incremented counters and the
 * earliest time this contact may be tried again.
 *
 * Returns `nextEligibleAt = null` when the contact is finished, so the
 * scheduler's query can skip it cheaply.
 */
export function planNextAttempt(
  campaign: Campaign,
  contact: CampaignContact,
  outcome: { answered: boolean },
  now: Date = new Date(),
): {
  attempts: number;
  attemptsToday: number;
  attemptDayKey: string;
  lastAttemptAt: Date;
  nextEligibleAt: Date | null;
  answered: boolean;
  exhausted: boolean;
} {
  const { dayKey } = localParts(now, campaign.timezone);
  const attempts = contact.attempts + 1;
  const attemptsToday = (contact.attemptDayKey === dayKey ? contact.attemptsToday : 0) + 1;
  const answered = contact.answered || outcome.answered;

  const doneBecauseAnswered = campaign.stopOnAnswer && answered;
  const doneBecauseCap = attempts >= campaign.maxAttemptsPerContact;
  const doneBecauseOnce = campaign.retryStrategy === 'once';

  if (doneBecauseAnswered || doneBecauseCap || doneBecauseOnce) {
    return {
      attempts, attemptsToday, attemptDayKey: dayKey, lastAttemptAt: now,
      nextEligibleAt: null, answered, exhausted: true,
    };
  }

  const minGapMs = Math.max(1, campaign.retryIntervalMinutes) * 60_000;
  let next = new Date(now.getTime() + minGapMs);

  if (campaign.retryStrategy === 'every_n_days') {
    const days = Math.max(1, campaign.retryIntervalDays);
    next = new Date(now.getTime() + days * 86_400_000);
  } else if (attemptsToday >= campaign.attemptsPerDay) {
    // Daily quota spent — the earliest retry is tomorrow's window opening.
    next = nextWindowOpening(campaign, now);
  }

  // Never schedule past the campaign's own end.
  if (campaign.endAt && next > campaign.endAt) {
    return {
      attempts, attemptsToday, attemptDayKey: dayKey, lastAttemptAt: now,
      nextEligibleAt: null, answered, exhausted: true,
    };
  }

  return {
    attempts, attemptsToday, attemptDayKey: dayKey, lastAttemptAt: now,
    nextEligibleAt: next, answered, exhausted: false,
  };
}

/**
 * The next instant the daily window opens after `now`, in the campaign's zone.
 * Walks forward a day at a time (max 8) so an every-weekday campaign lands on a
 * permitted day rather than a skipped one.
 */
export function nextWindowOpening(campaign: Campaign, now: Date = new Date()): Date {
  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 86_400_000);
    const { minutes, weekday } = localParts(probe, campaign.timezone);
    if (campaign.daysOfWeek.length && !campaign.daysOfWeek.includes(weekday)) continue;

    // Same day and the window has not opened yet → today's opening.
    if (dayOffset === 0 && minutes < campaign.dailyStartMinute) {
      return new Date(probe.getTime() + (campaign.dailyStartMinute - minutes) * 60_000);
    }
    if (dayOffset > 0) {
      // Move `probe` back to local midnight, then forward to the window start.
      return new Date(probe.getTime() + (campaign.dailyStartMinute - minutes) * 60_000);
    }
  }
  // No permitted day found in the next week — retry in a day rather than never.
  return new Date(now.getTime() + 86_400_000);
}
