import { nudgeFor, NUDGE_START_MS, NUDGE_ROTATE_MS, DEFAULT_TIMERS } from '../src/voice/nudges';

// UC-N16: hard-coded tip timing and before/after-login tip sets.
describe('UC-N16 nudges', () => {
  it('starts after 5s and rotates every 3s (hard-coded, not admin timers)', () => {
    expect(NUDGE_START_MS).toBe(5_000);
    expect(NUDGE_ROTATE_MS).toBe(3_000);
  });
  it('uses the pre-login tips on the sign-in screens when logged out', () => {
    const c = nudgeFor('language', DEFAULT_TIMERS, false);
    expect(c?.reason).toBe('idle_prelogin');
    expect(c?.labels[0]).toBe('New here? I can help you get started.');
    expect(nudgeFor('otp', DEFAULT_TIMERS, false)?.labels.length).toBeGreaterThan(1);
  });
  it('uses the post-login tips once logged in (home, permissions, profile…)', () => {
    for (const s of ['home', 'permissions', 'profile', 'loans'] as const) {
      const c = nudgeFor(s, DEFAULT_TIMERS, true);
      expect(c?.reason).toBe('idle');
      expect(c?.labels.join(' ')).not.toMatch(/New here/);
    }
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
