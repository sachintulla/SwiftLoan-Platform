import {
  DEFAULT_TIMERS, NUDGE_START_MS, NUDGE_ROTATE_MS, NUDGE_SNOOZE_MS,
  setLiveNudgeTimers, nudgeStartMs, nudgeRotateMs, nudgeSnoozeMs, snoozeNudges, nudgeSnoozeRemaining,
} from '../src/voice/nudges';

afterEach(() => { setLiveNudgeTimers(DEFAULT_TIMERS); jest.useRealTimers(); });

describe('bubble timings follow the admin settings (Admin → App config)', () => {
  it('uses today\'s values until the server sends others', () => {
    expect([nudgeStartMs(), nudgeRotateMs(), nudgeSnoozeMs()]).toEqual([5_000, 3_000, 600_000]);
    expect(DEFAULT_TIMERS).toMatchObject({ startMs: NUDGE_START_MS, rotateMs: NUDGE_ROTATE_MS, snoozeMs: NUDGE_SNOOZE_MS });
  });

  it('uses the values from the server', () => {
    setLiveNudgeTimers({ ...DEFAULT_TIMERS, startMs: 8_000, rotateMs: 4_500, snoozeMs: 120_000 });
    expect([nudgeStartMs(), nudgeRotateMs(), nudgeSnoozeMs()]).toEqual([8_000, 4_500, 120_000]);
  });

  it('a server that predates these settings (fields missing) keeps the built-in values', () => {
    setLiveNudgeTimers({ enabled: true, idleMs: 1, dropoffMs: 2, eligibleMs: 3 });
    expect([nudgeStartMs(), nudgeRotateMs(), nudgeSnoozeMs()]).toEqual([5_000, 3_000, 600_000]);
  });

  it('ignores a nonsense value instead of freezing or flooding the screen', () => {
    setLiveNudgeTimers({ ...DEFAULT_TIMERS, startMs: 0, rotateMs: -5, snoozeMs: Number.NaN });
    expect([nudgeStartMs(), nudgeRotateMs(), nudgeSnoozeMs()]).toEqual([5_000, 3_000, 600_000]);
  });

  it('dismissing the bubble snoozes it for the configured time', () => {
    jest.useFakeTimers();
    setLiveNudgeTimers({ ...DEFAULT_TIMERS, snoozeMs: 90_000 });
    snoozeNudges();
    expect(nudgeSnoozeRemaining()).toBeGreaterThan(89_000);
    expect(nudgeSnoozeRemaining()).toBeLessThanOrEqual(90_000);
    jest.advanceTimersByTime(91_000);
    expect(nudgeSnoozeRemaining()).toBe(0);
  });
});
