// What belongs to each journey stage on Configs → Stage outreach, besides the stuck-stage rules the page already lists:
//   - the message JOBS that run at that stage (website install reminders, drop-off messages, "you applied" messages, the no-offers call),
//     whose schedule rows appear as steps on the SAME timeline as the rules;
//   - the RULES for those jobs (gap between messages, "skip if too late", "how old is too old", how long idle counts as a drop);
//   - which sending switches decide whether they really send.
// Everything about when a stage's messages go out is therefore on the stage. The Timings page keeps only what applies to every stage
// (sending switches, test list, calling hours, call limits, login and session times, limits).
//
// Messages are keys of the WhatsApp catalogue (server/src/lib/whatsappCatalog.ts); settings are keys of the Timings registry
// (server/src/lib/timings.ts). `ownSchedule` mirrors the per-stage schedules the server supports (server/src/lib/stageSchedules.ts).
// Pure data and helpers, so it is unit-tested; the screen only renders it.

export interface SchedRow { channel: 'sms' | 'whatsapp'; afterMinutes: number }

export interface TimingGroup {
  title: string;
  keys: string[];
}

/** One message job whose schedule shows as steps on a stage's timeline. */
export interface SequenceSource {
  id: string;
  /** What it is, in words. */
  label: string;
  /** Who gets it. */
  audience: string;
  /** The Timings schedule whose rows are the steps. */
  scheduleKey: string;
  /** This stage may have its own copy of the schedule (installs and drop-off only; mirrors the server). */
  ownSchedule: boolean;
  /** Every one of these switches must be on for it to really send; otherwise it is log-only. */
  switches: string[];
  /** Catalogue messages it sends. */
  messages: string[];
  /** Where the minutes are counted from. */
  from: string;
}

/** A single timed call (the no-offers follow-up call). */
export interface CallStep {
  id: string;
  label: string;
  audience: string;
  /** Minutes after the stage is reached. */
  delayKey: string;
  /** Must all be on for the call to be placed. */
  switches: string[];
}

export interface StageSequence {
  sources: SequenceSource[];
  call?: CallStep;
  /** The rules (not the schedules) for the jobs above. */
  rules: TimingGroup[];
  note?: string;
}

const WEBSITE_REMINDER_RULES: TimingGroup = {
  title: 'Website reminder rules',
  keys: ['install.idleMinutes', 'install.minGapMinutes', 'install.maxLateHours', 'install.maxCycles'],
};
const DROPOFF_RULES: TimingGroup = {
  title: 'Drop-off message rules',
  keys: ['dropoff.minGapMinutes', 'dropoff.maxLateHours', 'dropoff.maxAgeHours'],
};

const WEBSITE_REMINDER: SequenceSource = {
  id: 'install', label: 'Website reminder', audience: 'Website visitors', scheduleKey: 'install.schedule', ownSchedule: true,
  switches: ['install.sendEnabled'], messages: ['install.reminder'], from: 'the visitor is treated as having left the website',
};
const DROPOFF: SequenceSource = {
  id: 'dropoff', label: 'Drop-off message', audience: 'App and website', scheduleKey: 'dropoff.schedule', ownSchedule: true,
  switches: ['dropoff.sendEnabled'], messages: [], from: 'they reached this stage',
};

export const STAGE_SEQUENCES: Readonly<Record<string, StageSequence>> = Object.freeze({
  lead_captured: {
    sources: [],
    rules: [{ title: 'The call after a website enquiry', keys: ['calls.firstDelaySeconds', 'calls.retryMinutes', 'calls.maxAttempts', 'calls.declineFollowupMinutes'] }],
  },
  app_installed: { sources: [], rules: [] },
  otp_requested: {
    sources: [{
      id: 'unverified', label: 'Website reminder: asked for a code, never entered it', audience: 'Website visitors', scheduleKey: 'install.unverifiedSchedule', ownSchedule: false,
      switches: ['install.sendEnabled', 'install.unverifiedEnabled'], messages: ['install.reminder'], from: 'they asked for the code',
    }],
    rules: [],
  },
  otp_verified: {
    sources: [WEBSITE_REMINDER],
    rules: [WEBSITE_REMINDER_RULES],
  },
  eligibility_started: {
    sources: [
      { ...DROPOFF, messages: ['dropoff.continue.withLink', 'dropoff.continue.noLink'] },
      WEBSITE_REMINDER,
    ],
    rules: [DROPOFF_RULES, WEBSITE_REMINDER_RULES],
  },
  eligibility_completed: {
    sources: [],
    call: { id: 'nooffers', label: 'Call when the lender finds no offers', audience: 'App and website', delayKey: 'dropoff.noOffersCallDelayMinutes', switches: ['dropoff.noOffersCallEnabled', 'calls.nudgeEnabled'] },
    rules: [],
    note: 'The "no offers" and "could not complete" WhatsApp notices, at the top of this step, go out the moment the check ends.',
  },
  offer_viewed: {
    sources: [{ ...DROPOFF, messages: ['dropoff.apply_offers.withLink', 'dropoff.apply_offers.noLink'] }],
    rules: [DROPOFF_RULES],
  },
  offer_selected: {
    sources: [{
      id: 'applied', label: '"You applied" message', audience: 'App and website', scheduleKey: 'applied.schedule', ownSchedule: false,
      switches: ['applied.sendEnabled'], messages: ['applied.nudge'], from: 'they applied to a lender',
    }],
    rules: [{ title: '"You applied" message rules', keys: ['applied.minGapMinutes', 'applied.maxLateHours', 'applied.maxAgeHours'] }],
  },
  loan_rejected: { sources: [], rules: [], note: 'This stage has no message jobs of its own: its follow-ups above carry the timing.' },
});

/** Everything for one stage; an unknown stage gets an empty sequence. */
export function sequenceFor(stageKey: string): StageSequence {
  return STAGE_SEQUENCES[stageKey] ?? { sources: [], rules: [] };
}

/** The key that holds a stage's own copy of a source's schedule, or null when that source has no per-stage version. */
export function ownScheduleKey(source: SequenceSource, stageKey: string): string | null {
  return source.ownSchedule ? `${source.scheduleKey}.${stageKey}` : null;
}

/**
 * Settings that now live on the stages instead of the Timings page: every schedule, the rules around them, and the no-offers call delay.
 * What stays on the Timings page is what applies to every stage (sending switches, test list, calling hours, call limits, login times, limits).
 */
export function stageTimingKeys(): Set<string> {
  const keys = new Set<string>();
  for (const seq of Object.values(STAGE_SEQUENCES)) {
    for (const s of seq.sources) keys.add(s.scheduleKey);
    if (seq.call) keys.add(seq.call.delayKey);
    for (const g of seq.rules) for (const k of g.keys) keys.add(k);
  }
  return keys;
}

export const isStageTimingKey = (key: string): boolean => stageTimingKeys().has(key);

/** The other stages that use the same setting, so the screen can say "changing this changes those too". */
export function stagesUsing(settingKey: string, exceptStage: string): string[] {
  return Object.entries(STAGE_SEQUENCES)
    .filter(([stage, seq]) => stage !== exceptStage && (
      seq.sources.some((s) => s.scheduleKey === settingKey) ||
      seq.rules.some((g) => g.keys.includes(settingKey)) ||
      seq.call?.delayKey === settingKey))
    .map(([stage]) => stage);
}

/* ───────────────────────────── the combined timeline ───────────────────────────── */

export type StepGroup = 'rule' | 'job';

/** One entry on a stage's timeline: a stuck-stage rule (from the page) or a step of a message job. */
export interface TimelineEntry {
  key: string;
  group: StepGroup;
  channel: 'whatsapp' | 'sms' | 'email' | 'voice' | 'push';
  afterMinutes: number;
  /** Really going out (a rule that is on, or a job whose sending switches are all on). */
  live: boolean;
  label: string;
}

export interface JobStep extends TimelineEntry {
  group: 'job';
  sourceId: string;
  kind: 'message' | 'call';
  /** Position in its schedule, for the label. */
  index: number;
}

/**
 * The steps a stage's message jobs add to its timeline, from the schedules' current rows. `rowsFor` gives the rows to use for a source (the
 * stage's own schedule if it has one, else the shared one); `isOn` reads a switch; `minutesOf` reads a number setting.
 */
export function jobSteps(
  stageKey: string,
  rowsFor: (source: SequenceSource) => readonly SchedRow[],
  isOn: (switchKey: string) => boolean,
  minutesOf: (key: string) => number | null,
): JobStep[] {
  const seq = sequenceFor(stageKey);
  const out: JobStep[] = [];
  for (const s of seq.sources) {
    const live = s.switches.every(isOn);
    rowsFor(s).forEach((r, index) => out.push({
      key: `${s.id}:${index}`, group: 'job', sourceId: s.id, kind: 'message', index, channel: r.channel, afterMinutes: r.afterMinutes, live, label: s.label,
    }));
  }
  if (seq.call) {
    const m = minutesOf(seq.call.delayKey);
    if (m != null) out.push({ key: `${seq.call.id}:0`, group: 'job', sourceId: seq.call.id, kind: 'call', index: 0, channel: 'voice', afterMinutes: m, live: seq.call.switches.every(isOn), label: seq.call.label });
  }
  return out;
}

/** Entries in time order; ties keep rules first. */
export function byTime<T extends TimelineEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.afterMinutes - b.afterMinutes || (a.group === b.group ? 0 : a.group === 'rule' ? -1 : 1));
}

export const OVERLAP_MINUTES = 15;

/**
 * Pairs of steps from DIFFERENT places (a stuck-stage rule and a message job) that are both really going out within `windowMinutes` of each
 * other. The two systems do not know about each other, so a person could get both close together: the screen warns about it.
 */
export function findOverlaps(entries: readonly TimelineEntry[], windowMinutes = OVERLAP_MINUTES): Array<[TimelineEntry, TimelineEntry]> {
  const live = entries.filter((e) => e.live);
  const out: Array<[TimelineEntry, TimelineEntry]> = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.group !== b.group && Math.abs(a.afterMinutes - b.afterMinutes) <= windowMinutes) out.push(a.group === 'rule' ? [a, b] : [b, a]);
    }
  }
  return out;
}
