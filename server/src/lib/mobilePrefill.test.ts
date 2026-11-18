import { describe, expect, it } from 'vitest';
import { decryptPan } from './pii.js';
import { maskPanForDisplay, prefillFromDetails, shouldFetch, userPatchFromDetails, type ExistingUserFields } from './mobilePrefill.js';
import type { DigitapDetails } from './digitap.js';

const EMPTY: ExistingUserFields = {
  firstName: null, lastName: null, fullName: null, dob: null, gender: null, email: null,
  addressLine1: null, addressLine2: null, city: null, state: null, pincode: null,
  alternateMobile: null, employment: null, monthlyIncome: null, hasPan: false,
};
const DETAILS: DigitapDetails = {
  pan: 'CXXPD1234H', fullName: 'JOHN DOE', firstName: 'JOHN', lastName: 'DOE', dob: '2001-09-19', age: 23, gender: 'male',
  email: 'john.doe@gmail.com', addressLine1: '301, SUNRISE TOWER', addressLine2: 'NAVI MUMBAI', state: 'MAHARASHTRA', pincode: '400708',
  alternateMobile: '9649112345', occupation: 'SALARIED', employment: 'salaried', incomeRange: '4,00,001 - 6,00,000', incomeMax: 600000, creditScore: 800,
};

describe('userPatchFromDetails', () => {
  it('fills an empty profile, stores the PAN encrypted and does NOT mark step 1 as done', () => {
    const p = userPatchFromDetails(DETAILS, EMPTY, true) as Record<string, any>;
    expect(p).toMatchObject({
      firstName: 'JOHN', lastName: 'DOE', fullName: 'JOHN DOE', gender: 'male', email: 'john.doe@gmail.com',
      addressLine1: '301, SUNRISE TOWER', addressLine2: 'NAVI MUMBAI', state: 'MAHARASHTRA', pincode: '400708',
      alternateMobile: '9649112345', employment: 'salaried', monthlyIncome: 600000, creditScore: 800,
    });
    expect((p.dob as Date).toISOString()).toBe('2001-09-19T00:00:00.000Z');
    expect(p.panEnc).not.toContain('CXXPD1234H');
    expect(decryptPan(p.panEnc)).toBe('CXXPD1234H');
    expect(p).not.toHaveProperty('panOnFile');
    expect(p).not.toHaveProperty('panNumber');
  });
  it('never overwrites what is already there', () => {
    const existing: ExistingUserFields = {
      ...EMPTY, firstName: 'Ravi', dob: new Date('1990-01-01'), gender: 'female', email: 'me@x.in', city: 'Pune',
      alternateMobile: '9000000001', employment: 'self_employed', monthlyIncome: 40000, hasPan: true,
    };
    expect(userPatchFromDetails(DETAILS, existing, true)).toEqual({ creditScore: 800 });
  });
  it('skips an email another account already uses, and an income outside the allowed range', () => {
    expect(userPatchFromDetails(DETAILS, EMPTY, false)).not.toHaveProperty('email');
    expect(userPatchFromDetails({ ...DETAILS, incomeMax: 1200 }, EMPTY, true)).not.toHaveProperty('monthlyIncome');
  });
});

describe('prefillFromDetails', () => {
  it('gives step 2 the identity fields only: no PAN, no score, no income', () => {
    const p = prefillFromDetails(DETAILS) as Record<string, unknown>;
    expect(p).toEqual({
      fullName: 'JOHN DOE', firstName: 'JOHN', lastName: 'DOE', dob: '2001-09-19', gender: 'male', email: 'john.doe@gmail.com',
      addressLine1: '301, SUNRISE TOWER', addressLine2: 'NAVI MUMBAI', state: 'MAHARASHTRA', pincode: '400708',
    });
    expect(JSON.stringify(p)).not.toContain('CXXPD1234H');
  });
  it('masks the PAN for display', () => {
    expect(maskPanForDisplay('CXXPD1234H')).toBe('XXXXXX234H');
  });
});

describe('shouldFetch', () => {
  const now = Date.parse('2026-11-18T10:00:00Z');
  const ago = (ms: number) => new Date(now - ms);
  it('looks a number up once', () => {
    expect(shouldFetch(null, now)).toBe(true);
    expect(shouldFetch({ status: 'found', fetchedAt: ago(400 * 86_400_000) }, now)).toBe(false);
  });
  it('asks again after a week for "not found", and after ten minutes for an error', () => {
    expect(shouldFetch({ status: 'not_found', fetchedAt: ago(86_400_000) }, now)).toBe(false);
    expect(shouldFetch({ status: 'not_found', fetchedAt: ago(8 * 86_400_000) }, now)).toBe(true);
    expect(shouldFetch({ status: 'error', fetchedAt: ago(60_000) }, now)).toBe(false);
    expect(shouldFetch({ status: 'error', fetchedAt: ago(11 * 60_000) }, now)).toBe(true);
  });
});
