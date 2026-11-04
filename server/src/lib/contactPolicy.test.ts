import { describe, it, expect } from 'vitest';
import { touchVerdict, type TouchCounts } from './contactPolicy.js';
import { isMissedCall } from './missedCallNote.js';

const caps = { perDay: 2, perWeek: 6, noCallAndMessageSameDay: true };
const c = (x: Partial<TouchCounts>): TouchCounts => ({ today: 0, week: 0, callToday: false, messageToday: false, ...x });

describe('touchVerdict (2 a day, 6 a week, never a call and a new message on the same day)', () => {
  it('allows the first touches', () => {
    expect(touchVerdict(c({}), 'message', caps).ok).toBe(true);
    expect(touchVerdict(c({ today: 1, week: 1, messageToday: true }), 'message', caps).ok).toBe(true);
  });
  it('stops a third touch in a day and a seventh in a week', () => {
    expect(touchVerdict(c({ today: 2, week: 2, messageToday: true }), 'message', caps).ok).toBe(false);
    expect(touchVerdict(c({ today: 0, week: 6 }), 'call', caps).ok).toBe(false);
  });
  it('no call after a message today, and no message after a call today', () => {
    expect(touchVerdict(c({ today: 1, week: 1, messageToday: true }), 'call', caps).ok).toBe(false);
    expect(touchVerdict(c({ today: 1, week: 1, callToday: true }), 'message', caps).ok).toBe(false);
    expect(touchVerdict(c({ today: 1, week: 1, callToday: true }), 'call', caps).ok).toBe(true); // the 24 h call cooldown handles calls
  });
  it('0 = no limit, and the same-day rule can be switched off', () => {
    const off = { perDay: 0, perWeek: 0, noCallAndMessageSameDay: false };
    expect(touchVerdict(c({ today: 9, week: 40, callToday: true, messageToday: true }), 'message', off).ok).toBe(true);
  });
});

describe('isMissedCall', () => {
  it('no answer, busy, or "completed" with nobody picking up; never a failed dial or an answered call', () => {
    expect(isMissedCall({ status: 'no_answer', answered: false })).toBe(true);
    expect(isMissedCall({ status: 'busy', answered: false })).toBe(true);
    expect(isMissedCall({ status: 'completed', answered: false })).toBe(true);
    expect(isMissedCall({ status: 'completed', answered: true })).toBe(false);
    expect(isMissedCall({ status: 'failed', answered: false })).toBe(false);
    expect(isMissedCall({ status: 'in_progress', answered: false })).toBe(false);
  });
});
