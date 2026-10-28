import { describe, it, expect } from 'vitest';
import { SEGMENT_KEYS, SEGMENT_DEFS, rejectedSegmentSql } from './segments.js';

/**
 * The Rejected segment is a raw SQL predicate, so there is no database here to
 * run it against. These tests read the generated SQL text instead: the point is
 * that the safety rules (never contact do-not-call, never chase a customer a
 * lender approved) cannot be removed without a test failing.
 */
describe('segment registry', () => {
  it('has the rejected segment with its label and description', () => {
    expect(SEGMENT_KEYS).toContain('rejected');
    expect(SEGMENT_DEFS.rejected.label).toBe('Rejected by a lender');
    expect(SEGMENT_DEFS.rejected.description).toContain('rejected by a lender');
    expect(SEGMENT_DEFS.rejected.description).toContain('approved or disbursed');
    expect(SEGMENT_DEFS.rejected.description).toContain('our own eligibility check');
    expect(SEGMENT_DEFS.rejected.description).toContain('asked not to be contacted');
  });

  it('keeps the original four segments and their definitions unchanged', () => {
    expect(SEGMENT_KEYS.slice(0, 4)).toEqual(['interested', 'not_interested', 'not_picked_up', 'installed_app_started']);
    expect(SEGMENT_DEFS.interested).toEqual({
      label: 'Interested',
      description: 'Verified their phone (website eligibility check or the app) and have not asked to never be called.',
    });
    expect(SEGMENT_DEFS.not_interested).toEqual({
      label: 'Not interested',
      description: 'Started checking eligibility but never verified the OTP, or verified but asked to never be called again.',
    });
    expect(SEGMENT_DEFS.not_picked_up).toEqual({
      label: "Didn't pick up",
      description: 'Most recent call outcome was "unreachable" — rang, no answer.',
    });
    expect(SEGMENT_DEFS.installed_app_started).toEqual({
      label: 'Installed the app & started',
      description: 'Said they installed the app on a call, or has real in-app onboarding activity.',
    });
  });

  it('defines every key', () => {
    for (const k of SEGMENT_KEYS) expect(SEGMENT_DEFS[k]).toBeDefined();
  });
});

describe('rejectedSegmentSql', () => {
  const text = rejectedSegmentSql({}).sql;

  it('excludes anyone who ever said do not call', () => {
    expect(text).toContain("outcome = 'do_not_call'");
    expect(text).toContain('NOT IN (SELECT "customerId" FROM dnc)');
  });

  it('excludes customers a lender approved or disbursed, on applications and on offers', () => {
    expect(text).toContain(`la2.status IN ('approved'::"ApplicationStatus", 'disbursed'::"ApplicationStatus")`);
    expect(text).toContain(`o2."lenderStatus" IN ('approved'::"ApplicationStatus", 'disbursed'::"ApplicationStatus")`);
    expect(text).toContain('NOT EXISTS');
  });

  it("excludes stage 'lost'", () => {
    expect(text).toContain(`c."currentStage" <> 'lost'::"JourneyStage"`);
  });

  it('excludes customers with no phone', () => {
    expect(text).toContain('c.phone IS NOT NULL');
  });

  it('has each of the four rejection sources', () => {
    // 1. application rejected
    expect(text).toContain(`la.status = 'rejected'::"ApplicationStatus"`);
    // 2. applied lender offer rejected
    expect(text).toContain(`o."lenderStatus" = 'rejected'::"ApplicationStatus"`);
    expect(text).toContain('o.applied IS TRUE');
    // 3. Yubi partner referral rejected, only if the customer proceeded
    expect(text).toContain(`pr."lastStatus" ILIKE 'REJECT%'`);
    expect(text).toContain('pr."appliedAt" IS NOT NULL');
    // 4. journey stage rejected
    expect(text).toContain(`cu."currentStage" = 'rejected'::"JourneyStage"`);
  });

  it('leaves out a customer a Yubi lender approved or disbursed', () => {
    expect(text).toContain('FROM "PartnerReferral" pr2');
    expect(text).toContain(`pr2."lastStatus" ILIKE 'APPROV%'`);
    expect(text).toContain(`pr2."lastStatus" ILIKE 'DISBURS%'`);
    expect(text).toContain('pr2."appliedAt" IS NOT NULL');
  });

  it('does not treat a Revasure ineligible answer as a rejection', () => {
    expect(text.toLowerCase()).not.toContain('revasure');
    expect(text.toLowerCase()).not.toContain('ineligible');
  });

  it('returns the lender and the reason alongside the activity time', () => {
    expect(text).toContain('AS lender');
    expect(text).toContain('AS reason');
    expect(text).toContain('AS "activityAt"');
  });

  it('applies no search or date clause by default', () => {
    expect(text).not.toContain('ILIKE $');
    expect(text).not.toContain('::date');
  });

  it('applies search and the rejected-from and rejected-to dates to the rejection time, as bound parameters', () => {
    const sql = rejectedSegmentSql({ search: 'asha', since: '2026-10-01', until: '2026-10-20' });
    expect(sql.sql).toContain('c.name ILIKE');
    expect(sql.sql).toContain('lr."rejectedAt" >=');
    expect(sql.sql).toContain(`lr."rejectedAt" < (`);
    // Values are bound, never concatenated into the text.
    expect(sql.sql).not.toContain('asha');
    expect(sql.sql).not.toContain('2026-10-01');
    expect(sql.values).toEqual(expect.arrayContaining(['%asha%', '2026-10-01', '2026-10-20']));
  });
});
