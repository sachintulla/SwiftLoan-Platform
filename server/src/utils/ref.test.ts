import { describe, it, expect } from 'vitest';
import { makeRef, makeRefs, isRefClash, withFreshRef } from './ref.js';

const clash = (target: unknown) => Object.assign(new Error('Unique constraint failed on the fields: (`ref`)'), { code: 'P2002', meta: { target } });

describe('references', () => {
  it('look like SL-123456 (format unchanged)', () => expect(makeRef()).toMatch(/^SL-\d{6}$/));
  it('a batch is all different', () => {
    const refs = makeRefs(200, 'PAY');
    expect(new Set(refs).size).toBe(200);
    expect(refs.every((r) => /^PAY-\d{6}$/.test(r))).toBe(true);
  });
  it('spots a clash on ref, in the shapes Prisma uses, and nothing else', () => {
    expect(isRefClash(clash(['ref']))).toBe(true);
    expect(isRefClash(clash('LoanApplication_ref_key'))).toBe(true);
    expect(isRefClash(clash(['phone']))).toBe(false);
    expect(isRefClash(Object.assign(new Error('x'), { code: 'P2003' }))).toBe(false);
    expect(isRefClash(null)).toBe(false);
  });
});

describe('withFreshRef', () => {
  it('tries again with a new number when the first is taken', async () => {
    let calls = 0;
    const out = await withFreshRef(async () => { calls++; if (calls < 3) throw clash(['ref']); return 'created'; });
    expect([out, calls]).toEqual(['created', 3]);
  });
  it('gives up after 5 attempts and throws the clash', async () => {
    let calls = 0;
    await expect(withFreshRef(async () => { calls++; throw clash(['ref']); })).rejects.toMatchObject({ code: 'P2002' });
    expect(calls).toBe(5);
  });
  it('never retries any other error', async () => {
    let calls = 0;
    await expect(withFreshRef(async () => { calls++; throw new Error('db down'); })).rejects.toThrow('db down');
    expect(calls).toBe(1);
  });
});
