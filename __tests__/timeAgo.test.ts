import { timeAgo } from '../src/utils/timeAgo';
import { STR } from '../src/i18n/strings';

const en: any = STR.en;
const NOW = Date.parse('2026-10-13T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

describe('timeAgo', () => {
  it('reads like a person would say it', () => {
    expect(timeAgo(ago(10_000), en, NOW)).toBe('just now');
    expect(timeAgo(ago(1 * MIN), en, NOW)).toBe('1 minute ago');
    expect(timeAgo(ago(45 * MIN), en, NOW)).toBe('45 minutes ago');
    expect(timeAgo(ago(1 * HOUR), en, NOW)).toBe('1 hour ago');
    expect(timeAgo(ago(10 * HOUR), en, NOW)).toBe('10 hours ago');
    expect(timeAgo(ago(1 * DAY), en, NOW)).toBe('1 day ago');
    expect(timeAgo(ago(20 * DAY), en, NOW)).toBe('20 days ago');
    expect(timeAgo(ago(30 * DAY), en, NOW)).toBe('1 month ago');
    expect(timeAgo(ago(95 * DAY), en, NOW)).toBe('3 months ago');
    expect(timeAgo(ago(400 * DAY), en, NOW)).toBe('1 year ago');
  });
  it('returns empty for missing, invalid or future timestamps', () => {
    expect(timeAgo(null, en, NOW)).toBe('');
    expect(timeAgo('nope', en, NOW)).toBe('');
    expect(timeAgo(new Date(NOW + 10 * MIN).toISOString(), en, NOW)).toBe('');
  });
});

describe('timeAgo strings', () => {
  it.each(['en', 'hi', 'te'])('%s has every unit template', (lang) => {
    for (const k of ['agoJustNow', 'agoMinuteOne', 'agoMinuteMany', 'agoHourOne', 'agoHourMany', 'agoDayOne', 'agoDayMany', 'agoMonthOne', 'agoMonthMany', 'agoYearOne', 'agoYearMany']) {
      expect(STR[lang]![k]).toBeTruthy();
    }
  });
});
