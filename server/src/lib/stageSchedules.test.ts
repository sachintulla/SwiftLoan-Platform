import { describe, expect, it } from 'vitest';
import {
  DROPOFF_STAGE_OF_STATUS, INSTALL_STAGE_OF_STEP, STAGE_SCHEDULE_STAGES, allStageScheduleKeys, dropoffStageOf, installStageOf, stageScheduleKey,
} from './stageSchedules.js';

describe('per-stage schedule map', () => {
  it('names a key per sequence and stage', () => {
    expect(stageScheduleKey('install.schedule', 'otp_verified')).toBe('install.schedule.otp_verified');
    expect(allStageScheduleKeys().sort()).toEqual([
      'dropoff.schedule.eligibility_started', 'dropoff.schedule.offer_viewed', 'install.schedule.eligibility_started', 'install.schedule.otp_verified',
    ]);
  });

  it('every step and status that is mapped lands on a stage that is allowed to have its own schedule', () => {
    for (const stage of Object.values(INSTALL_STAGE_OF_STEP)) expect(STAGE_SCHEDULE_STAGES['install.schedule']).toContain(stage);
    for (const stage of Object.values(DROPOFF_STAGE_OF_STATUS)) expect(STAGE_SCHEDULE_STAGES['dropoff.schedule']).toContain(stage);
  });

  it('maps the website reminder\'s last step and the drop-off status to a stage', () => {
    expect(installStageOf('otp_only')).toBe('otp_verified');
    expect(installStageOf('pan_done')).toBe('eligibility_started');
    expect(installStageOf('application_started')).toBe('eligibility_started');
    expect(dropoffStageOf('pan_verified')).toBe('eligibility_started');
    expect(dropoffStageOf('offers_not_applied')).toBe('offer_viewed');
  });

  it('a status or step that belongs to no stage has none (it keeps the shared schedule)', () => {
    expect(installStageOf('otp_requested')).toBeNull();
    expect(installStageOf(null)).toBeNull();
    expect(dropoffStageOf('rejected')).toBeNull();
    expect(dropoffStageOf('applied')).toBeNull();
    expect(dropoffStageOf(undefined)).toBeNull();
  });
});
