import {
  nudgeFor, NUDGE_START_MS, NUDGE_ROTATE_MS, NUDGE_SNOOZE_MS, DEFAULT_TIMERS,
  snoozeNudges, nudgeSnoozeRemaining, onNudgeWake,
} from '../src/voice/nudges';

// UC-N16: hard-coded tip timing and before/after-login tip sets.
describe('UC-N16 nudges', () => {
  it('starts after 5s and rotates every 3s (hard-coded, not admin timers)', () => {
    expect(NUDGE_START_MS).toBe(5_000);
    expect(NUDGE_ROTATE_MS).toBe(3_000);
  });
  it('uses the pre-login tips on the sign-in screens when logged out', () => {
    const c = nudgeFor('language', DEFAULT_TIMERS, false);
    expect(c?.reason).toBe('idle_prelogin');
    expect(c?.labels[0]).toBe("Need any help? I'm right here.");
    expect(nudgeFor('otp', DEFAULT_TIMERS, false)?.labels.length).toBeGreaterThan(1);
  });
  it('uses the same general tips once logged in (home, permissions, profile…)', () => {
    const pre = nudgeFor('language', DEFAULT_TIMERS, false)?.labels;
    for (const s of ['home', 'permissions', 'profile', 'loans'] as const) {
      const c = nudgeFor(s, DEFAULT_TIMERS, true);
      expect(c?.reason).toBe('idle');
      expect(c?.labels).toEqual(pre);
    }
  });
  it('shows tips in the chosen language (Hindi, Telugu), English as the fallback', () => {
    const en = nudgeFor('home', DEFAULT_TIMERS, true, 'en')!.labels;
    for (const lang of ['hi', 'te'] as const) {
      for (const s of ['home', 'basic', 'offers'] as const) {
        const c = nudgeFor(s, DEFAULT_TIMERS, true, lang)!;
        const base = nudgeFor(s, DEFAULT_TIMERS, true, 'en')!;
        expect(c.reason).toBe(base.reason);
        expect(c.labels).toHaveLength(base.labels.length);
        expect(c.labels).not.toEqual(base.labels);
      }
    }
    expect(nudgeFor('home', DEFAULT_TIMERS, true, 'hinglish')!.labels).toEqual(en);
    expect(nudgeFor('home', DEFAULT_TIMERS, true, null)!.labels).toEqual(en);
    expect(nudgeFor('home', DEFAULT_TIMERS, true, 'hi')!.labels[0]).toMatch(/[\u0900-\u097F]/);
    expect(nudgeFor('home', DEFAULT_TIMERS, true, 'te')!.labels[0]).toMatch(/[\u0C00-\u0C7F]/);
  });
  it('keeps the screen-specific funnel and offers tips', () => {
    expect(nudgeFor('basic', DEFAULT_TIMERS, true)?.reason).toBe('dropoff_apply');
    expect(nudgeFor('fare', DEFAULT_TIMERS, true)?.reason).toBe('eligible_no_apply');
  });
  it('shows no tip on splash/privacy, or when the admin switch is off', () => {
    expect(nudgeFor('splash', DEFAULT_TIMERS, false)).toBeNull();
    expect(nudgeFor('privacy', DEFAULT_TIMERS, false)).toBeNull();
    expect(nudgeFor('home', { ...DEFAULT_TIMERS, enabled: false }, true)).toBeNull();
  });
});

// Closing the bubble with its ✕ hides tips for 10 minutes, then wakes the scheduler.
describe('nudge snooze', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('is 10 minutes, blocks tips meanwhile, then wakes listeners', () => {
    expect(NUDGE_SNOOZE_MS).toBe(600_000);
    const wake = jest.fn();
    const off = onNudgeWake(wake);
    snoozeNudges();
    expect(nudgeSnoozeRemaining()).toBe(NUDGE_SNOOZE_MS);
    jest.advanceTimersByTime(NUDGE_SNOOZE_MS - 1);
    expect(wake).not.toHaveBeenCalled();
    expect(nudgeSnoozeRemaining()).toBe(1);
    jest.advanceTimersByTime(1);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(nudgeSnoozeRemaining()).toBe(0);
    off();
  });
});
