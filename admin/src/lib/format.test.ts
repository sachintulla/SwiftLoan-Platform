import { describe, it, expect } from 'vitest';
import { inr, inrCompact, num, pct, timeAgo, dateStr, statusTone, humanStatus, inrRupees, inrCompactRupees } from './format';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

describe('rupees vs paise (the bug that showed ₹2,000 for ₹2,00,000 and ₹510 for ₹51,000)', () => {
  it('inrRupees shows a rupee value as it is, in Indian grouping', () => {
    expect(inrRupees(200000)).toBe('₹2,00,000');
    expect(inrRupees(51000)).toBe('₹51,000');
    expect(inrRupees(null)).toBe('₹0');
  });

  it('inr treats its input as paise, so it is only for paise fields', () => {
    expect(inr(25200000)).toBe('₹2,52,000'); // a Lead.amount in paise
    expect(inr(200000)).toBe('₹2,000'); // what you get by using it on a rupee field: wrong by 100x
  });

  it('inrCompactRupees is the compact form of a rupee value', () => {
    expect(inrCompactRupees(51000)).toBe('₹51.0K');
    expect(inrCompactRupees(200000)).toBe('₹2.00L');
    expect(inrCompactRupees(25000000)).toBe('₹2.50Cr');
    expect(inrCompactRupees(750)).toBe('₹750');
    expect(inrCompactRupees(null)).toBe('₹0');
  });

  it('inrCompact (paise) agrees with inrCompactRupees once the unit is converted', () => {
    expect(inrCompact(20000000)).toBe(inrCompactRupees(200000));
    expect(inrCompact(null)).toBe('₹0');
  });
});

describe('guard: rupee fields are never formatted as paise', () => {
  // Fields stored in RUPEES (see the list at the top of format.ts). A line that formats one of them with inr()/inrCompact() is the bug above.
  const RUPEE_FIELDS = /\b(monthlyIncome|principal|emiAmount|outstanding|processingFee)\b/;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? (f === 'node_modules' || f === '.next' ? [] : walk(p)) : /\.(tsx?|jsx?)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
    });

  it('no admin screen passes an income, principal, EMI, outstanding or fee value to the paise formatters', () => {
    const offenders: string[] = [];
    for (const file of walk(join(__dirname, '..'))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/\binr(Compact)?\(/.test(line) && RUPEE_FIELDS.test(line) && !/export function/.test(line)) offenders.push(`${file.split('/src/')[1]}:${i + 1}  ${line.trim().slice(0, 110)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
