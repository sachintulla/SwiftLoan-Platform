import { describe, it, expect } from 'vitest';
import { companyRequired } from './companyRequired';

describe('companyRequired', () => {
  it('is required for everyone who has an employer or a business', () => {
    for (const e of ['Salaried', 'Self-employed', 'Business owner', 'Gig worker', 'Other', 'salaried', 'self_employed', 'business_owner']) {
      expect(companyRequired(e)).toBe(true);
    }
  });
  it('is optional for a student or a retired person, however it is spelled', () => {
    for (const e of ['Student', 'Retired', 'student', 'retired', ' STUDENT ']) expect(companyRequired(e)).toBe(false);
  });
  it('says nothing when no employment type is chosen yet', () => {
    expect(companyRequired(null)).toBe(false);
    expect(companyRequired(undefined)).toBe(false);
    expect(companyRequired('')).toBe(false);
  });
});
