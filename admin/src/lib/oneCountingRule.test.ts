// The admin must not work out "got offers", "no offers", "applied with a lender" or "rejected" by itself: those numbers
// come from the server's shared rules (server/src/lib/peopleMetrics.ts) so every page shows the same value. This test
// fails if a page starts keeping its own list of customer statuses for a count again (owner's decision, 2026-11-27:
// the Dashboard said 1,624 rejected, Customers 1,548 and the lender chart 3,116 for the same word).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}
const files = sources(ROOT).map((f) => ({ f: f.slice(ROOT.length + 1), text: readFileSync(f, 'utf8') }));

describe('one counting rule for every page', () => {
  it('no admin file groups customer statuses into its own count', () => {
    // A list holding two or more of these customer-status keys is a counting rule (e.g. ['no_offers', 'lender_rejected']).
    const KEYS = ['no_offers', 'lender_rejected', 'lender_failed', 'offers_failed', 'checking_offers'];
    const list = /\[[^\]]*\]/g;
    const bad: string[] = [];
    for (const { f, text } of files) {
      for (const m of text.match(list) ?? []) {
        const hits = KEYS.filter((k) => m.includes(`'${k}'`) || m.includes(`"${k}"`));
        if (hits.length >= 2) bad.push(`${f}: ${m.slice(0, 80)}`);
      }
    }
    expect(bad, 'use the numbers from /api/admin/customers/metrics or dashboard/overview stats.people').toEqual([]);
  });

  it('the old per-page fields and helper are gone', () => {
    const OLD = ['customerCards', 'peopleRejected', 'peopleWithOffers', 'peopleChecked', 'askedOffers'];
    const bad = files.flatMap(({ f, text }) => OLD.filter((w) => text.includes(w)).map((w) => `${f}: ${w}`));
    expect(bad).toEqual([]);
  });

  it('the cards on the Dashboard and on Customers both read the shared people numbers', () => {
    const text = (name: string) => files.find((x) => x.f.endsWith(name))?.text ?? '';
    expect(text('overview/page.tsx')).toContain('stats.people.rejected');
    expect(text('customers/page.tsx')).toContain('/api/admin/customers/metrics');
  });

  it('"rejected" on a card is never no offers plus lender rejections', () => {
    const bad = files.filter(({ text }) => /noOffers\s*\+\s*\w*[rR]ejected|[rR]ejected\s*\+\s*\w*noOffers/.test(text)).map((x) => x.f);
    expect(bad).toEqual([]);
  });
});
