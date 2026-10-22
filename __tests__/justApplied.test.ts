import { isJustApplied, JUST_APPLIED_WINDOW_MS } from '../src/utils/justApplied';

describe('isJustApplied', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('shows right after applying', () => {
    expect(isJustApplied('just_applied', ago(60_000), now)).toBe(true);
  });
  it('hides once the window has passed (5 hours old)', () => {
    expect(isJustApplied('just_applied', ago(5 * 3_600_000), now)).toBe(false);
    expect(isJustApplied('just_applied', ago(JUST_APPLIED_WINDOW_MS + 1), now)).toBe(false);
  });
  it('hides for other statuses and bad timestamps', () => {
    expect(isJustApplied('success', ago(1000), now)).toBe(false);
    expect(isJustApplied('just_applied', null, now)).toBe(false);
    expect(isJustApplied('just_applied', 'nope', now)).toBe(false);
  });
});
