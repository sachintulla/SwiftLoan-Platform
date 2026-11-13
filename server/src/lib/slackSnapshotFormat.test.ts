import { describe, it, expect } from 'vitest';
import {
  rupeeCompact, istDay, istMinuteOfDay, snapshotDue, snapshotLines, snapshotText, snapshotBlocks,
  type SnapshotMetrics,
} from './slackSnapshotFormat.js';

const metrics: SnapshotMetrics = {
  downloads: { total: 1240, today: 12 },
  users: { total: 806, today: 5 },
  leads: { total: 430, today: 0 },
  applications: { total: 806, today: 7 },
  applicationWorth: { total: 2_45_00_000, today: 3_50_000 },
  offers: { total: 560, today: 4 },
  approvals: { total: 10, today: 1 },
  disbursals: { total: 3, today: 0 },
  disbursedAmount: { total: 12_00_000, today: 0 },
  metaSpend: { total: 0, today: 0, available: false },
  appToDisbursalPct: 0,
};

describe('rupeeCompact', () => {
  it('formats crores, lakhs and plain rupees in Indian style', () => {
    expect(rupeeCompact(2_45_00_000)).toBe('₹2.45Cr');
    expect(rupeeCompact(3_50_000)).toBe('₹3.5L');
    expect(rupeeCompact(5_000)).toBe('₹5,000');
    expect(rupeeCompact(0)).toBe('₹0');
    expect(rupeeCompact(1_00_00_000)).toBe('₹1Cr');
  });
});

describe('IST helpers', () => {
  it('istDay is the India calendar day', () => {
    // 2026-11-13T20:00:00Z = 2026-11-14 01:30 IST
    expect(istDay(Date.parse('2026-11-13T20:00:00Z'))).toBe('2026-11-14');
  });
  it('istMinuteOfDay is minutes past IST midnight', () => {
    // 2026-11-13T01:30:00Z = 07:00 IST = 420
    expect(istMinuteOfDay(Date.parse('2026-11-13T01:30:00Z'))).toBe(420);
    // 00:00 IST = 2026-11-12T18:30:00Z
    expect(istMinuteOfDay(Date.parse('2026-11-12T18:30:00Z'))).toBe(0);
  });
});

describe('snapshotDue', () => {
  const at7IST = Date.parse('2026-11-13T01:30:00Z'); // 07:00 IST on the 13th
  it('fires once the IST clock reaches the target and the day has not been sent', () => {
    expect(snapshotDue(at7IST, null)).toBe(true);
    expect(snapshotDue(at7IST, '2026-11-12')).toBe(true);
  });
  it('does not fire before the target minute', () => {
    const at650 = Date.parse('2026-11-13T01:20:00Z'); // 06:50 IST
    expect(snapshotDue(at650, null)).toBe(false);
  });
  it('does not fire twice on the same India day', () => {
    expect(snapshotDue(at7IST, '2026-11-13')).toBe(false);
  });
  it('catches up later in the day if the 7am tick was missed', () => {
    const at10IST = Date.parse('2026-11-13T04:30:00Z'); // 10:00 IST
    expect(snapshotDue(at10IST, '2026-11-12')).toBe(true);
  });
  it('honours a custom target minute', () => {
    const at8IST = Date.parse('2026-11-13T02:30:00Z'); // 08:00 IST = 480
    expect(snapshotDue(at8IST, null, 480)).toBe(true);
    expect(snapshotDue(at7IST, null, 480)).toBe(false);
  });
});

describe('snapshotLines', () => {
  it('lists exactly the ten headline metrics in order', () => {
    const lines = snapshotLines(metrics);
    expect(lines).toHaveLength(10);
    expect(lines.map((l) => l.label)).toEqual([
      'App downloads', 'Users onboarded', 'Leads captured', 'Applications',
      'Application worth', 'Offers received', 'Approvals', 'Disbursements',
      'Disbursed amount', 'Meta ad spend',
    ]);
  });
  it('shows today deltas only when non-zero', () => {
    const lines = snapshotLines(metrics);
    expect(lines[0].today).toBe('+12');   // downloads +12
    expect(lines[2].today).toBe('');      // leads +0 -> blank
    expect(lines[4].today).toBe('+₹3.5L'); // worth delta
  });
  it('marks Meta spend as not wired yet (and never 0+today)', () => {
    const meta = snapshotLines(metrics)[9];
    expect(meta.value).toContain('not wired');
    expect(meta.today).toBe('');
  });
});

describe('snapshotText / snapshotBlocks', () => {
  it('text includes the header, every metric and the conversion line', () => {
    const t = snapshotText(metrics, 'Fri, 13 Nov 2026');
    expect(t).toContain('SwiftLoan daily snapshot — Fri, 13 Nov 2026');
    expect(t).toContain('App downloads: 1,240');
    expect(t).toContain('Application → disbursal: 0%');
  });
  it('blocks carry a header, a body section and the fallback text', () => {
    const p = snapshotBlocks(metrics, 'Fri, 13 Nov 2026');
    expect(p.text).toContain('SwiftLoan daily snapshot');
    const types = (p.blocks as Array<{ type: string }>).map((b) => b.type);
    expect(types).toContain('header');
    expect(types).toContain('section');
    expect(types).toContain('divider');
  });
});
