import { describe, expect, it } from 'vitest';
import {
  STAGE_SEQUENCES, byTime, findOverlaps, isStageTimingKey, jobSteps, ownScheduleKey, sequenceFor, stageTimingKeys, stagesUsing,
  type SchedRow, type SequenceSource, type TimelineEntry,
} from './stageSequences';

// The stages Configs → Stage outreach shows (server/src/lib/stageOutreach.ts), in journey order.
const STAGES = ['lead_captured', 'app_installed', 'otp_requested', 'otp_verified', 'eligibility_started', 'eligibility_completed', 'offer_viewed', 'offer_selected', 'loan_rejected'];

describe('STAGE_SEQUENCES', () => {
  it('has an entry for every stage, and no stage the screen does not know', () => {
    expect(Object.keys(STAGE_SEQUENCES).sort()).toEqual([...STAGES].sort());
  });

  it('never lists the same setting twice on one stage', () => {
    for (const [stage, seq] of Object.entries(STAGE_SEQUENCES)) {
      const keys = [...seq.sources.map((s) => s.scheduleKey), ...(seq.call ? [seq.call.delayKey] : []), ...seq.rules.flatMap((g) => g.keys)];
      expect(new Set(keys).size, stage).toBe(keys.length);
    }
  });

  it('only names catalogue messages, schedules and switches that look like real keys', () => {
    for (const seq of Object.values(STAGE_SEQUENCES)) {
      for (const s of seq.sources) {
        for (const m of s.messages) expect(m).toMatch(/^(dropoff\.[a-z_]+\.(withLink|noLink)|install\.reminder|applied\.nudge)$/);
        expect(s.scheduleKey).toMatch(/^(install|dropoff|applied)\.(schedule|unverifiedSchedule)$/);
        for (const k of s.switches) expect(k).toMatch(/^[a-z]+\.[A-Za-z]+$/);
      }
      for (const g of seq.rules) for (const k of g.keys) expect(k).toMatch(/^[a-z]+\.[A-Za-z]+$/);
    }
  });

  it('per-stage schedules exist only where the server supports them (install: Signed in, Application started; drop-off: Application started, Offers viewed)', () => {
    const own: Record<string, string[]> = {};
    for (const [stage, seq] of Object.entries(STAGE_SEQUENCES)) for (const s of seq.sources) if (s.ownSchedule) (own[s.scheduleKey] ??= []).push(stage);
    expect(own['install.schedule'].sort()).toEqual(['eligibility_started', 'otp_verified']);
    expect(own['dropoff.schedule'].sort()).toEqual(['eligibility_started', 'offer_viewed']);
    expect(Object.keys(own).sort()).toEqual(['dropoff.schedule', 'install.schedule']);
  });

  it('the key of a stage\'s own schedule', () => {
    const src = sequenceFor('offer_viewed').sources[0];
    expect(ownScheduleKey(src, 'offer_viewed')).toBe('dropoff.schedule.offer_viewed');
    expect(ownScheduleKey(sequenceFor('offer_selected').sources[0], 'offer_selected')).toBeNull();
  });
});

describe('what stays on the Timings page', () => {
  it('moves every schedule, its rules and the no-offers call delay to the stages', () => {
    for (const k of ['install.schedule', 'install.unverifiedSchedule', 'dropoff.schedule', 'applied.schedule', 'install.idleMinutes', 'install.minGapMinutes', 'dropoff.maxAgeHours', 'applied.maxLateHours', 'dropoff.noOffersCallDelayMinutes', 'calls.firstDelaySeconds']) {
      expect(isStageTimingKey(k), k).toBe(true);
    }
  });

  it('keeps what applies to every stage: sending switches, test list, calling hours, call limits, login times', () => {
    for (const k of ['install.sendEnabled', 'dropoff.sendEnabled', 'applied.sendEnabled', 'install.allowedNumbers', 'dropoff.noOffersCallEnabled', 'calling.windowStart', 'calling.windowEnd', 'calls.maxPerHour', 'calls.nudgeEnabled', 'auth.otpValidityMinutes', 'tracking.clickTtlHours', 'offers.reuseHours', 'pan.dailyLimit']) {
      expect(isStageTimingKey(k), k).toBe(false);
    }
  });

  it('lists each setting once', () => {
    expect(stageTimingKeys().size).toBeGreaterThan(15);
  });

  it('says which other stages share a setting', () => {
    expect(stagesUsing('install.schedule', 'otp_verified')).toEqual(['eligibility_started']);
    expect(stagesUsing('dropoff.schedule', 'offer_viewed')).toEqual(['eligibility_started']);
    expect(stagesUsing('applied.schedule', 'offer_selected')).toEqual([]);
  });
});

const rows = (...r: Array<[SchedRow['channel'], number]>): SchedRow[] => r.map(([channel, afterMinutes]) => ({ channel, afterMinutes }));

describe('jobSteps (what the message jobs add to a stage\'s timeline)', () => {
  const none = (): number | null => null;

  it('turns a schedule into steps, live only when every switch is on', () => {
    const shared = rows(['whatsapp', 10], ['sms', 240]);
    const steps = jobSteps('otp_verified', () => shared, (k) => k === 'install.sendEnabled', none);
    expect(steps.map((s) => [s.channel, s.afterMinutes, s.live, s.sourceId])).toEqual([['whatsapp', 10, true, 'install'], ['sms', 240, true, 'install']]);
    expect(jobSteps('otp_verified', () => shared, () => false, none).every((s) => !s.live)).toBe(true);
  });

  it('the unverified reminder needs BOTH the sending switch and its own switch', () => {
    const r = rows(['whatsapp', 10]);
    expect(jobSteps('otp_requested', () => r, (k) => k === 'install.sendEnabled', none)[0].live).toBe(false);
    expect(jobSteps('otp_requested', () => r, () => true, none)[0].live).toBe(true);
  });

  it('a stage with two jobs shows both (Application started: drop-off messages and the website reminder)', () => {
    const steps = jobSteps('eligibility_started', (s: SequenceSource) => (s.id === 'dropoff' ? rows(['whatsapp', 30]) : rows(['whatsapp', 10])), () => true, none);
    expect(steps.map((s) => s.sourceId).sort()).toEqual(['dropoff', 'install']);
  });

  it('the no-offers call is a timed call step, live only with its switches on', () => {
    const steps = jobSteps('eligibility_completed', () => [], (k) => k === 'dropoff.noOffersCallEnabled' || k === 'calls.nudgeEnabled', (k) => (k === 'dropoff.noOffersCallDelayMinutes' ? 45 : null));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'call', channel: 'voice', afterMinutes: 45, live: true });
    expect(jobSteps('eligibility_completed', () => [], () => false, (k) => (k === 'dropoff.noOffersCallDelayMinutes' ? 45 : null))[0].live).toBe(false);
  });

  it('a stage with no jobs adds nothing', () => {
    expect(jobSteps('app_installed', () => [], () => true, none)).toEqual([]);
    expect(jobSteps('nope', () => [], () => true, none)).toEqual([]);
  });
});

const e = (group: 'rule' | 'job', afterMinutes: number, live = true, key = `${group}${afterMinutes}`): TimelineEntry => ({ key, group, channel: 'sms', afterMinutes, live, label: key });

describe('byTime and findOverlaps', () => {
  it('orders by time, rules before jobs on a tie', () => {
    expect(byTime([e('job', 30), e('rule', 15), e('rule', 30)]).map((x) => x.key)).toEqual(['rule15', 'rule30', 'job30']);
  });

  it('warns about a rule and a job that are both live within 15 minutes', () => {
    const o = findOverlaps([e('rule', 15), e('job', 10)]);
    expect(o).toHaveLength(1);
    expect(o[0].map((x) => x.group)).toEqual(['rule', 'job']);
  });

  it('does not warn when they are far apart, when one is not live, or when both are from the same place', () => {
    expect(findOverlaps([e('rule', 15), e('job', 60)])).toEqual([]);
    expect(findOverlaps([e('rule', 15), e('job', 10, false)])).toEqual([]);
    expect(findOverlaps([e('rule', 15, true, 'a'), e('rule', 20, true, 'b')])).toEqual([]);
    expect(findOverlaps([e('job', 15, true, 'a'), e('job', 20, true, 'b')])).toEqual([]);
  });

  it('exactly 15 minutes apart still counts; 16 does not', () => {
    expect(findOverlaps([e('rule', 30), e('job', 15)])).toHaveLength(1);
    expect(findOverlaps([e('rule', 31), e('job', 15)])).toHaveLength(0);
  });
});
