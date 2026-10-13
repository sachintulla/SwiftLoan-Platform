import { describe, it, expect } from 'vitest';
import { timeAgo } from './timeAgo';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

describe('timeAgo', () => {
  it('reads like a person would say it (en)', () => {
    expect(timeAgo(ago(10_000), 'en', NOW)).toBe('just now');
    expect(timeAgo(ago(1 * HOUR), 'en', NOW)).toBe('1 hour ago');
    expect(timeAgo(ago(10 * HOUR), 'en', NOW)).toBe('10 hours ago');
    expect(timeAgo(ago(1 * DAY), 'en', NOW)).toBe('1 day ago');
    expect(timeAgo(ago(20 * DAY), 'en', NOW)).toBe('20 days ago');
    expect(timeAgo(ago(30 * DAY), 'en', NOW)).toBe('1 month ago');
    expect(timeAgo(ago(45 * MIN), 'en', NOW)).toBe('45 minutes ago');
  });
  it('localises for hi and te', () => {
    expect(timeAgo(ago(10 * HOUR), 'hi', NOW)).toMatch(/10/);
    expect(timeAgo(ago(10 * HOUR), 'hi', NOW)).not.toBe('10 hours ago');
    expect(timeAgo(ago(10 * HOUR), 'te', NOW)).not.toBe('10 hours ago');
  });
  it('returns empty for missing, invalid or future timestamps', () => {
    expect(timeAgo(null, 'en', NOW)).toBe('');
    expect(timeAgo('nope', 'en', NOW)).toBe('');
    expect(timeAgo(new Date(NOW + 10 * MIN).toISOString(), 'en', NOW)).toBe('');
  });
});
