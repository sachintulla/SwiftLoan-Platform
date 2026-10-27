import { describe, expect, it } from 'vitest';
import { STAGE_SEQUENCES, sequenceFor, stageSettingKeys, stagesUsing } from './stageSequences';

// The stages Configs → Stage outreach shows (server/src/lib/stageOutreach.ts), in journey order.
const STAGES = ['lead_captured', 'app_installed', 'otp_requested', 'otp_verified', 'eligibility_started', 'eligibility_completed', 'offer_viewed', 'offer_selected', 'loan_rejected'];

describe('STAGE_SEQUENCES', () => {
  it('has an entry for every stage, and no stage the screen does not know', () => {
    expect(Object.keys(STAGE_SEQUENCES).sort()).toEqual([...STAGES].sort());
  });

  it('never lists the same setting twice on one stage', () => {
    for (const [stage, seq] of Object.entries(STAGE_SEQUENCES)) {
      const keys = seq.timings.flatMap((g) => g.keys);
      expect(new Set(keys).size, stage).toBe(keys.length);
    }
  });

  it('only names catalogue messages and settings that look like real keys', () => {
    for (const seq of Object.values(STAGE_SEQUENCES)) {
      for (const m of seq.messages) expect(m).toMatch(/^(dropoff\.[a-z_]+\.(withLink|noLink)|install\.reminder|applied\.nudge)$/);
      for (const g of seq.timings) for (const k of g.keys) expect(k).toMatch(/^[a-z]+\.[A-Za-z]+$/);
      for (const s of seq.switches) expect(s.key).toMatch(/^(install|dropoff|applied)\.sendEnabled$/);
    }
  });

  it('every group has a title and at least one setting', () => {
    for (const seq of Object.values(STAGE_SEQUENCES)) for (const g of seq.timings) {
      expect(g.title.length).toBeGreaterThan(5);
      expect(g.keys.length).toBeGreaterThan(0);
    }
  });
});

describe('helpers', () => {
  it('says which other stages share a setting', () => {
    expect(stagesUsing('install.schedule', 'otp_verified').sort()).toEqual(['eligibility_started']);
    expect(stagesUsing('dropoff.schedule', 'offer_viewed')).toEqual(['eligibility_started']);
    expect(stagesUsing('applied.schedule', 'offer_selected')).toEqual([]);
  });

  it('lists each setting once across all stages', () => {
    const keys = stageSettingKeys();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('dropoff.schedule');
    expect(keys).not.toContain('calling.windowStart'); // calling hours apply to every stage, so they stay on the Timings page
  });

  it('an unknown stage is empty instead of failing', () => {
    expect(sequenceFor('nope')).toEqual({ messages: [], timings: [], switches: [] });
  });
});
