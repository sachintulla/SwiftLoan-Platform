import { describe, expect, it } from 'vitest';
import { offersInputSignature, pickReusable, reuseWindowMs } from './offersReuse.js';

const user = {
  firstName: 'Ravi', lastName: 'Kumar', fullName: 'Ravi Kumar', phone: '9876543210', email: 'ravi@example.com',
  dob: new Date('1991-03-04T00:00:00Z'), gender: 'male', employment: 'salaried', monthlyIncome: 80000, pincode: '560001',
  addressLine1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', panFp: 'fp-a', qualification: 'Graduate', salaryMode: 'Bank Transfer',
};
const app = { loanType: 'personal', amount: 300000, tenureMonths: 24, purpose: 'personal', employment: 'salaried', monthlyIncome: 80000, panNumber: 'ABCPA1234A' };

describe('offersInputSignature — "same details" means the same fingerprint', () => {
  it('is identical for identical details', () => {
    expect(offersInputSignature(user, app)).toBe(offersInputSignature({ ...user }, { ...app }));
  });
  it('ignores things the lender is never asked (ids, tokens, timestamps, status)', () => {
    const noisy = { ...user, id: 'u1', aurixToken: 'secret', updatedAt: new Date(), lastLoginAt: new Date() };
    const noisyApp = { ...app, id: 'a1', status: 'offers_ready', updatedAt: new Date(), offersSignature: 'x' };
    expect(offersInputSignature(noisy, noisyApp)).toBe(offersInputSignature(user, app));
  });
  it('ignores surrounding whitespace and null-vs-undefined', () => {
    expect(offersInputSignature({ ...user, city: '  Bengaluru ' }, app)).toBe(offersInputSignature(user, app));
    expect(offersInputSignature({ ...user, landmark: undefined }, app)).toBe(offersInputSignature({ ...user, landmark: null }, app));
  });
  it.each([
    ['loan amount', {}, { amount: 350000 }],
    ['tenure', {}, { tenureMonths: 36 }],
    ['income', { monthlyIncome: 90000 }, {}],
    ['employment', { employment: 'self_employed' }, {}],
    ['pincode', { pincode: '560002' }, {}],
    ['PAN (keyed hash)', { panFp: 'fp-b' }, {}],
    ['email', { email: 'new@example.com' }, {}],
    ['date of birth', { dob: new Date('1992-03-04T00:00:00Z') }, {}],
    ['city', { city: 'Mysuru' }, {}],
    ['loan purpose', { loanPurpose: 'home renovation' }, {}],
  ])('changes when the applicant changes %s', (_n, u, a) => {
    expect(offersInputSignature({ ...user, ...u }, { ...app, ...a })).not.toBe(offersInputSignature(user, app));
  });
  it('tolerates missing user/app', () => {
    expect(() => offersInputSignature(null, undefined)).not.toThrow();
  });
});

describe('reuseWindowMs', () => {
  it('defaults to 24 hours (the "offers are valid for 24 hours" promise)', () => {
    expect(reuseWindowMs(undefined)).toBe(24 * 3_600_000);
    expect(reuseWindowMs('')).toBe(24 * 3_600_000);
  });
  it('honours OFFERS_REUSE_HOURS, and 0 means never expire', () => {
    expect(reuseWindowMs('6')).toBe(6 * 3_600_000);
    expect(reuseWindowMs('0')).toBeNull();
  });
  it('falls back to the default on junk', () => {
    expect(reuseWindowMs('abc')).toBe(24 * 3_600_000);
    expect(reuseWindowMs('-3')).toBe(24 * 3_600_000);
  });
});

describe('pickReusable — call the lender only when nothing usable exists', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
  const c = (id: string, sig: string | null, h: number | null) => ({ id, offersSignature: sig, offersFetchedAt: h === null ? null : hoursAgo(h) });
  const DAY = 24 * 3_600_000;

  it('nothing stored → fetch', () => {
    expect(pickReusable([], 'a', 'S', now, DAY)).toBeNull();
    expect(pickReusable([c('a', null, null)], 'a', 'S', now, DAY)).toBeNull();
  });
  it('same details, still fresh → reuse', () => {
    expect(pickReusable([c('a', 'S', 2)], 'a', 'S', now, DAY)?.id).toBe('a');
  });
  it('details changed → fetch', () => {
    expect(pickReusable([c('a', 'OLD', 2)], 'a', 'NEW', now, DAY)).toBeNull();
  });
  it('same details but the offers are stale → fetch', () => {
    expect(pickReusable([c('a', 'S', 25)], 'a', 'S', now, DAY)).toBeNull();
    expect(pickReusable([c('a', 'S', 24)], 'a', 'S', now, DAY)?.id).toBe('a'); // exactly at the limit is still fresh
  });
  it('a never-expiring window reuses indefinitely', () => {
    expect(pickReusable([c('a', 'S', 24 * 90)], 'a', 'S', now, null)?.id).toBe('a');
  });
  it("prefers the application's own offers, else the user's newest matching one", () => {
    expect(pickReusable([c('old', 'S', 10), c('self', 'S', 20), c('new', 'S', 1)], 'self', 'S', now, DAY)?.id).toBe('self');
    expect(pickReusable([c('old', 'S', 10), c('new', 'S', 1)], 'self', 'S', now, DAY)?.id).toBe('new');
  });
  it('ignores matching-but-stale applications when a fresh one exists', () => {
    expect(pickReusable([c('stale', 'S', 30), c('fresh', 'S', 5)], 'x', 'S', now, DAY)?.id).toBe('fresh');
  });
});
