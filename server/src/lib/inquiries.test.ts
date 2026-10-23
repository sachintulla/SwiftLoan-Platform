import { describe, it, expect } from 'vitest';
import { rollupInquiries, type InquiryLeadRow } from './inquiries.js';

const d = (s: string) => new Date(s);

describe('rollupInquiries — website inquiry metrics keyed by phone', () => {
  const leads: InquiryLeadRow[] = [
    // phone A: 3 inquiries, 2 distinct amounts, 1 verified
    { phone: 'A', name: 'Asha', amount: 500000, verifiedAt: d('2026-10-24T05:00:00Z'), createdAt: d('2026-10-24T05:00:00Z') },
    { phone: 'A', name: 'Asha R', amount: 500000, verifiedAt: null, createdAt: d('2026-10-20T05:00:00Z') },
    { phone: 'A', name: 'Asha', amount: 800000, verifiedAt: null, createdAt: d('2026-10-10T05:00:00Z') },
    // phone B: 1 inquiry, verified
    { phone: 'B', name: 'Ben', amount: 300000, verifiedAt: d('2026-10-23T05:00:00Z'), createdAt: d('2026-10-23T05:00:00Z') },
    // phone C: 1 inquiry, unverified, no amount
    { phone: 'C', name: null, amount: null, verifiedAt: null, createdAt: d('2026-10-22T05:00:00Z') },
  ];

  it('totals verified vs unverified inquiries', () => {
    const r = rollupInquiries(leads);
    expect(r.totalInquiries).toBe(5);
    expect(r.verifiedInquiries).toBe(2);
    expect(r.unverifiedInquiries).toBe(3);
  });

  it('counts unique, repeat, and amount-changing inquirers', () => {
    const r = rollupInquiries(leads);
    expect(r.uniqueInquirers).toBe(3); // A, B, C
    expect(r.repeatInquirers).toBe(1); // only A has >1 inquiry
    expect(r.amountChangers).toBe(1); // only A used >1 distinct amount
  });

  it('per-phone: inquiry count, distinct amounts, latest amount/name, verified flag', () => {
    const a = rollupInquiries(leads).perPhone.find((p) => p.phone === 'A')!;
    expect(a.inquiries).toBe(3);
    expect(a.distinctAmounts).toBe(2); // 500000 and 800000
    expect(a.verifiedInquiries).toBe(1);
    expect(a.verified).toBe(true);
    expect(a.latestAmount).toBe(500000); // most recent submission
    expect(a.name).toBe('Asha'); // latest non-empty name
    const c = rollupInquiries(leads).perPhone.find((p) => p.phone === 'C')!;
    expect(c.verified).toBe(false);
    expect(c.distinctAmounts).toBe(0);
  });

  it('sorts perPhone by inquiry count desc', () => {
    const r = rollupInquiries(leads);
    expect(r.perPhone[0].phone).toBe('A');
  });

  it('ignores rows with no phone and handles empty input', () => {
    expect(rollupInquiries([]).totalInquiries).toBe(0);
    expect(rollupInquiries([{ phone: '', name: null, amount: 1, verifiedAt: null, createdAt: d('2026-10-24T00:00:00Z') }]).uniqueInquirers).toBe(0);
  });
});
