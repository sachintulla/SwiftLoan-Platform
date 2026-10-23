import { describe, it, expect } from 'vitest';
import { inr, inrCompact, num, pct, timeAgo, dateStr, statusTone, humanStatus } from './format';

describe('inr', () => {
  it('formats paise as rupees', () => {
    expect(inr(500000)).toBe('₹5,000');
  });
  it('treats null/undefined as zero', () => {
    expect(inr(null)).toBe('₹0');
    expect(inr(undefined)).toBe('₹0');
  });
});

describe('inrCompact', () => {
  it('compacts thousands with a K suffix', () => {
    expect(inrCompact(150000)).toBe('₹1.5K'); // 150000 paise = ₹1,500
  });
  it('handles crore-scale amounts', () => {
    expect(inrCompact(2_00_00_000 * 100)).toBe('₹2.00Cr');
  });
  it('handles lakh-scale amounts', () => {
    expect(inrCompact(3_00_000 * 100)).toBe('₹3.00L');
  });
  it('treats null/undefined as zero', () => {
    expect(inrCompact(null)).toBe('₹0');
  });
});

describe('num', () => {
  it('formats with Indian grouping', () => {
    expect(num(1234567)).toBe('12,34,567');
  });
  it('treats null/undefined as zero', () => {
    expect(num(null)).toBe('0');
    expect(num(undefined)).toBe('0');
  });
});

describe('pct', () => {
  it('rounds and appends a percent sign', () => {
    expect(pct(45.6)).toBe('46%');
  });
  it('treats null/undefined as zero', () => {
    expect(pct(null)).toBe('0%');
  });
});

describe('timeAgo', () => {
  it('returns an em dash for a missing value', () => {
    expect(timeAgo(null)).toBe('—');
    expect(timeAgo(undefined)).toBe('—');
  });
  it('buckets recent times correctly', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 30_000))).toMatch(/^\d+s ago$/);
    expect(timeAgo(new Date(now - 5 * 60_000))).toMatch(/^\d+m ago$/);
    expect(timeAgo(new Date(now - 5 * 3600_000))).toMatch(/^\d+h ago$/);
    expect(timeAgo(new Date(now - 5 * 86400_000))).toMatch(/^\d+d ago$/);
  });
});

describe('dateStr', () => {
  it('returns an em dash for a missing value', () => {
    expect(dateStr(null)).toBe('—');
  });
  it('formats a real date', () => {
    expect(dateStr('2026-01-15T00:00:00.000Z')).toMatch(/2026/);
  });
});

describe('statusTone', () => {
  it('maps known statuses to their tone', () => {
    expect(statusTone('completed')).toBe('green');
    expect(statusTone('failed')).toBe('red');
    expect(statusTone('pending')).toBe('amber');
  });
  it('falls back to grey for unknown or missing status', () => {
    expect(statusTone('some_unmapped_status')).toBe('grey');
    expect(statusTone(null)).toBe('grey');
    expect(statusTone(undefined)).toBe('grey');
  });
});

describe('humanStatus', () => {
  it('title-cases and de-underscores', () => {
    expect(humanStatus('in_progress')).toBe('In Progress');
  });
  it('returns an em dash for a missing value', () => {
    expect(humanStatus(null)).toBe('—');
    expect(humanStatus(undefined)).toBe('—');
    expect(humanStatus('')).toBe('—');
  });
  it('never throws on a non-string status (regression: CampaignBuilder agent picker)', () => {
    // The Ello agents endpoint returns `status` as a real boolean
    // (server/src/lib/integrations.ts's listElloAgents does
    // Boolean(a.status)), and `a.status || 'not_started'` passes the boolean
    // straight through when it's `true` — this used to crash with
    // "status.replace is not a function" the moment an active agent was
    // selected in the campaign builder.
    expect(() => humanStatus(true as unknown as string)).not.toThrow();
    expect(humanStatus(true as unknown as string)).toBe('true');
    expect(humanStatus(false as unknown as string)).toBe('—'); // falsy, short-circuits before the type check
    expect(() => humanStatus(42 as unknown as string)).not.toThrow();
    expect(humanStatus(42 as unknown as string)).toBe('42');
  });
});
