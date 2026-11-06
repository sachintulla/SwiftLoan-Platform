import { describe, it, expect } from 'vitest';
import { welcomeKey } from './welcomeMessage.js';

describe('welcomeKey (once per number, or once a day when that rule is off)', () => {
  const now = new Date('2026-11-05T20:00:00Z'); // 1:30 AM on 6 Nov in India
  it('on: one key per number, forever', () => {
    expect(welcomeKey('welcome', '9876543210', now, true)).toBe('welcome:9876543210');
  });
  it('off: one key per number per India day', () => {
    expect(welcomeKey('welcomesms', '9876543210', now, false)).toBe('welcomesms:9876543210:2026-11-06');
  });
});
