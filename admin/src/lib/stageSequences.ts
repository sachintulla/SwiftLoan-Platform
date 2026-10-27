// Which WhatsApp messages and which timing settings belong to each journey stage on Configs → Stage outreach.
// The messages are the keys of the WhatsApp catalogue (server/src/lib/whatsappCatalog.ts); the timings are the keys of the Timings registry
// (server/src/lib/timings.ts). Pure data and two helpers, so it is unit-tested; the screen only renders it.
//
// Several stages share one setting (the website reminder schedule serves both "Signed in" and "Application started"). A stage lists the setting
// anyway, and the screen says which other stages use it, so changing it is never a surprise.

export interface TimingGroup {
  /** What these settings are for, in words. */
  title: string;
  keys: string[];
}

export interface StageSequence {
  /** Catalogue message keys sent at this stage. */
  messages: string[];
  /** Settings that decide when and how much is sent. */
  timings: TimingGroup[];
  /** The sending switches that decide whether the messages above are really sent (shown, not edited here). */
  switches: Array<{ label: string; key: string }>;
  /** A line for a stage that has nothing of its own. */
  note?: string;
}

const DROPOFF_TIMINGS: TimingGroup = {
  title: 'When the drop-off messages go out',
  keys: ['dropoff.schedule', 'dropoff.minGapMinutes', 'dropoff.maxLateHours', 'dropoff.maxAgeHours'],
};
const WEBSITE_REMINDER_TIMINGS: TimingGroup = {
  title: 'Website reminders (a visitor who left the website)',
  keys: ['install.idleMinutes', 'install.schedule', 'install.minGapMinutes', 'install.maxLateHours', 'install.maxCycles'],
};

export const STAGE_SEQUENCES: Readonly<Record<string, StageSequence>> = Object.freeze({
  lead_captured: {
    messages: [],
    timings: [{ title: 'The call after a website enquiry', keys: ['calls.firstDelaySeconds', 'calls.retryMinutes', 'calls.maxAttempts', 'calls.declineFollowupMinutes'] }],
    switches: [],
  },
  app_installed: {
    messages: [],
    timings: [{ title: 'Matching an install to the link they clicked', keys: ['tracking.clickTtlHours', 'tracking.ipWindowMinutes'] }],
    switches: [],
  },
  otp_requested: {
    messages: ['install.reminder'],
    timings: [
      { title: 'The code', keys: ['auth.otpValidityMinutes', 'auth.otpResendWindowMinutes'] },
      { title: 'Asked for a code but never entered it', keys: ['install.unverifiedEnabled', 'install.unverifiedSchedule'] },
    ],
    switches: [{ label: 'Website reminders', key: 'install.sendEnabled' }],
  },
  otp_verified: {
    messages: ['install.reminder'],
    timings: [WEBSITE_REMINDER_TIMINGS],
    switches: [{ label: 'Website reminders', key: 'install.sendEnabled' }],
  },
  eligibility_started: {
    messages: ['dropoff.continue.withLink', 'dropoff.continue.noLink', 'install.reminder'],
    timings: [DROPOFF_TIMINGS, WEBSITE_REMINDER_TIMINGS],
    switches: [{ label: 'Drop-off messages', key: 'dropoff.sendEnabled' }, { label: 'Website reminders', key: 'install.sendEnabled' }],
  },
  eligibility_completed: {
    messages: [],
    timings: [
      { title: 'When the lender finds no offers', keys: ['dropoff.noOffersCallEnabled', 'dropoff.noOffersCallDelayMinutes'] },
      { title: 'Saved offers', keys: ['offers.reuseHours'] },
    ],
    switches: [],
    note: 'The WhatsApp for "no offers" is the notice at the top of this page ("When the eligibility check returns no offers").',
  },
  offer_viewed: {
    messages: ['dropoff.apply_offers.withLink', 'dropoff.apply_offers.noLink'],
    timings: [DROPOFF_TIMINGS],
    switches: [{ label: 'Drop-off messages', key: 'dropoff.sendEnabled' }],
  },
  offer_selected: {
    messages: ['applied.nudge'],
    timings: [{ title: 'After they apply to a lender', keys: ['applied.schedule', 'applied.minGapMinutes', 'applied.maxLateHours', 'applied.maxAgeHours'] }],
    switches: [{ label: '"You applied" messages', key: 'applied.sendEnabled' }],
  },
  loan_rejected: {
    messages: [],
    timings: [],
    switches: [],
    note: 'This stage has no timing settings of its own: its follow-ups above carry the timing.',
  },
});

/** Everything for one stage; an unknown stage gets an empty sequence. */
export function sequenceFor(stageKey: string): StageSequence {
  return STAGE_SEQUENCES[stageKey] ?? { messages: [], timings: [], switches: [] };
}

/** The other stages that use the same setting, so the screen can say "changing this changes those too". */
export function stagesUsing(settingKey: string, exceptStage: string): string[] {
  return Object.entries(STAGE_SEQUENCES)
    .filter(([stage, seq]) => stage !== exceptStage && seq.timings.some((g) => g.keys.includes(settingKey)))
    .map(([stage]) => stage);
}

/** Every setting that appears on some stage. The Timings page keeps the rest (calling hours, login times, limits…). */
export function stageSettingKeys(): string[] {
  return [...new Set(Object.values(STAGE_SEQUENCES).flatMap((s) => s.timings.flatMap((g) => g.keys)))];
}
