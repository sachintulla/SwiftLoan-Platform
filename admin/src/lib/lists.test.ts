import { describe, it, expect } from 'vitest';
import {
  EXPORT_LIMIT, CAMPAIGN_CAP, buildListQuery, cleanFilters, describeFilters, resultLine, shouldWarnTruncation,
  exportBlockedReason, campaignBlockedReason, canWrite, dayBoundIso, dateRangeProblem, dayLabel,
  yubiStatusLabel, revasureReachedWarning,
} from './lists';

describe('buildListQuery', () => {
  it('drops empty, whitespace-only, null and undefined values', () => {
    expect(buildListQuery({ status: 'rejected', search: '', lenderResult: '  ', from: null, to: undefined })).toBe('status=rejected');
  });

  it('returns an empty string when nothing is set', () => {
    expect(buildListQuery({})).toBe('');
    expect(buildListQuery({ a: '', b: undefined })).toBe('');
  });

  it('encodes values safely', () => {
    const q = buildListQuery({ search: 'a&b=c d#x', from: '2026-10-01T00:00:00.000Z' });
    expect(q).toBe('search=a%26b%3Dc+d%23x&from=2026-10-01T00%3A00%3A00.000Z');
    expect(new URLSearchParams(q).get('search')).toBe('a&b=c d#x');
  });

  it('trims values and accepts numbers', () => {
    expect(buildListQuery({ search: '  98  ', page: 2 })).toBe('search=98&page=2');
  });

  it('keeps the order the filters were given in', () => {
    expect(buildListQuery({ b: '1', a: '2' })).toBe('b=1&a=2');
  });
});

describe('cleanFilters', () => {
  it('keeps only filters that have a value', () => {
    expect(cleanFilters({ status: ' failed ', search: '', from: undefined })).toEqual({ status: 'failed' });
  });
});

describe('describeFilters', () => {
  const labels = {
    status: { name: 'status', value: (v: string) => v.toUpperCase() },
    lenderResult: { name: 'lender result' },
    search: { name: 'search' },
    from: { name: 'from' },
  };

  it('is empty when nothing is active', () => {
    expect(describeFilters({}, labels)).toBe('');
    expect(describeFilters({ status: '', search: '  ' }, labels)).toBe('');
  });

  it('describes each active filter in words', () => {
    expect(describeFilters({ status: 'rejected', search: '98' }, labels)).toBe('status REJECTED, search "98"');
  });

  it('follows the order of the labels, not of the filters', () => {
    expect(describeFilters({ search: '98', lenderResult: 'approved', status: 'draft' }, labels))
      .toBe('status DRAFT, lender result approved, search "98"');
  });

  it('ignores filters that have no label', () => {
    expect(describeFilters({ unknown: 'x', from: '2026-10-01' }, labels)).toBe('from 2026-10-01');
  });
});

describe('resultLine', () => {
  it('says what is shown', () => {
    expect(resultLine(134, 'application', 'applications', 'status Rejected, search "98"'))
      .toBe('134 applications. Showing status Rejected, search "98".');
  });

  it('uses the singular for one and omits Showing when nothing is filtered', () => {
    expect(resultLine(1, 'lead', 'leads', '')).toBe('1 lead.');
    expect(resultLine(0, 'lead', 'leads', '')).toBe('0 leads.');
  });

  it('groups thousands the Indian way', () => {
    expect(resultLine(12345, 'lead', 'leads', '')).toBe('12,345 leads.');
  });
});

describe('truncation', () => {
  it('uses the same cap as the server', () => {
    expect(EXPORT_LIMIT).toBe(10_000);
    expect(CAMPAIGN_CAP).toBe(5_000);
  });

  it('warns only above the export limit', () => {
    expect(shouldWarnTruncation(10_000)).toBe(false);
    expect(shouldWarnTruncation(10_001)).toBe(true);
    expect(shouldWarnTruncation(0)).toBe(false);
    expect(shouldWarnTruncation(undefined)).toBe(false);
    expect(shouldWarnTruncation(null)).toBe(false);
  });
});

describe('roles and blocked reasons', () => {
  it('allows super_admin and admin, refuses the others, and allows an unknown role', () => {
    expect(canWrite('super_admin')).toBe(true);
    expect(canWrite('admin')).toBe(true);
    expect(canWrite('analyst')).toBe(false);
    expect(canWrite(undefined)).toBe(true);
    expect(canWrite('')).toBe(true);
  });

  it('gives a visible reason for export', () => {
    expect(exportBlockedReason('analyst', 10)).toBe('Exports need an admin or super admin');
    expect(exportBlockedReason('admin', 0)).toBe('No rows to export');
    expect(exportBlockedReason('admin', 5)).toBeNull();
    expect(exportBlockedReason('admin', undefined)).toBeNull();
  });

  it('gives a visible reason for campaigns', () => {
    expect(campaignBlockedReason('analyst', 10)).toBe('Campaigns need an admin or super admin');
    expect(campaignBlockedReason('super_admin', 0)).toBe('No rows to start a campaign from');
    expect(campaignBlockedReason('super_admin', 3)).toBeNull();
  });
});

describe('dates', () => {
  it('turns a date input into the start or end of that local day', () => {
    const start = new Date(dayBoundIso('2026-10-01', 'start'));
    const end = new Date(dayBoundIso('2026-10-01', 'end'));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(1);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('gives an empty string for empty or invalid input', () => {
    expect(dayBoundIso('', 'start')).toBe('');
    expect(dayBoundIso('01/10/2026', 'start')).toBe('');
    expect(dayBoundIso('2026-13-45', 'end')).toBe('');
  });

  it('flags a From date later than To', () => {
    expect(dateRangeProblem('2026-10-10', '2026-10-01')).toMatch(/later than/);
    expect(dateRangeProblem('2026-10-01', '2026-10-01')).toBeNull();
    expect(dateRangeProblem('', '2026-10-01')).toBeNull();
    expect(dateRangeProblem('2026-10-01', '')).toBeNull();
  });

  it('words a date', () => {
    expect(dayLabel('2026-10-27')).toMatch(/27 Oct 2026/);
    expect(dayLabel('garbage')).toBe('garbage');
  });
});

describe('labels', () => {
  it('reads Yubi codes in plain words', () => {
    expect(yubiStatusLabel('OFFER_GENERATED')).toBe('Offer generated');
    expect(yubiStatusLabel('NEW_LEAD')).toBe('New lead');
    expect(yubiStatusLabel('REJECTED')).toBe('Rejected');
    expect(yubiStatusLabel(null)).toBe('Unknown');
  });

  it('warns on Revasure Success or Duplicate only', () => {
    expect(revasureReachedWarning({ status: 'success' })).toBe(true);
    expect(revasureReachedWarning({ status: 'duplicate' })).toBe(true);
    expect(revasureReachedWarning({ status: 'failed' })).toBe(false);
    expect(revasureReachedWarning({})).toBe(false);
  });
});
