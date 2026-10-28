/**
 * Per-stage schedules: the install reminder and the drop-off messages each have ONE shared schedule (Admin → Timings), and a stage on
 * Configs → Stage outreach can have its own instead. A stage with no schedule of its own keeps using the shared one, exactly as before.
 *
 * Only the schedule (which message, how long after) is per stage. The gap between messages, "skip if too late" and "how old is too old" stay
 * shared. The "you applied" messages belong to a single stage already, and "asked for a code but never entered it" has its own schedule.
 *
 * Pure (no database): the stage lists, the key names and how a row's own state maps to a stage. timings.ts registers the settings and reads them.
 */

export type SharedSchedule = 'install.schedule' | 'dropoff.schedule';

/** The stages (Stage outreach keys) that may have their own copy of each shared schedule. */
export const STAGE_SCHEDULE_STAGES: Readonly<Record<SharedSchedule, readonly string[]>> = Object.freeze({
  'install.schedule': ['otp_verified', 'eligibility_started'],
  'dropoff.schedule': ['eligibility_started', 'offer_viewed'],
});

export const STAGE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  otp_verified: 'Signed in',
  eligibility_started: 'Application started',
  offer_viewed: 'Offers viewed',
});

/** The Timings key that holds one stage's own schedule. */
export const stageScheduleKey = (shared: SharedSchedule, stage: string): string => `${shared}.${stage}`;

/** The website reminder remembers the last step the visitor finished; this is the stage that step belongs to. */
export const INSTALL_STAGE_OF_STEP: Readonly<Record<string, string>> = Object.freeze({
  otp_only: 'otp_verified',
  pan_done: 'eligibility_started',
  application_started: 'eligibility_started',
});

/** Where a drop-off run is (its status) → the stage it belongs to. */
export const DROPOFF_STAGE_OF_STATUS: Readonly<Record<string, string>> = Object.freeze({
  pan_verified: 'eligibility_started',
  application_filled: 'eligibility_started',
  offers_not_applied: 'offer_viewed',
});

export function installStageOf(lastStep: string | null | undefined): string | null {
  return (lastStep && INSTALL_STAGE_OF_STEP[lastStep]) || null;
}

export function dropoffStageOf(status: string | null | undefined): string | null {
  return (status && DROPOFF_STAGE_OF_STATUS[status]) || null;
}

/** Every per-stage key, for the registry and its tests. */
export function allStageScheduleKeys(): string[] {
  return (Object.keys(STAGE_SCHEDULE_STAGES) as SharedSchedule[]).flatMap((s) => STAGE_SCHEDULE_STAGES[s].map((st) => stageScheduleKey(s, st)));
}
