import { describe, expect, it } from 'vitest';
import {
  parseMisBuffer, normalizeMisStatus, parseMisAmount, parseMisDate, misRowIssue, canonHeader,
} from './revasureMis.js';

const csv = (s: string) => Buffer.from(s, 'utf8');

const SAMPLE = `Date,Name,Mobile Number,Loan Amt,Salary Mode,Status,Remark,Approved Amt,Disbursed Amt,Disbursement Date
24-Oct-26,RAJIB SAHU,9876543210,100000,Self Employee,Disbursed,Disbursed,100000,100000,24-Oct-26
23-Oct-26,ISHWARYA,+91 98765 43211,50000,Salaried,approved,Looks good,"50,000",,
,,,,,,,,,
`;

describe('normalizeMisStatus', () => {
  it('canonicalises known synonyms', () => {
    expect(normalizeMisStatus('Disbursed')?.label).toBe('Disbursed');
    expect(normalizeMisStatus('  approved ')?.label).toBe('Approved');
    expect(normalizeMisStatus('SANCTIONED')).toEqual({ label: 'Approved', known: true });
    expect(normalizeMisStatus('under review')).toEqual({ label: 'In Process', known: true });
  });
  it('keeps unknown statuses but flags them', () => {
    expect(normalizeMisStatus('Partially Paid')).toEqual({ label: 'Partially Paid', known: false });
  });
  it('returns null for a blank cell', () => {
    expect(normalizeMisStatus('')).toBeNull();
    expect(normalizeMisStatus(null)).toBeNull();
  });
});

describe('parseMisAmount', () => {
  it('strips currency symbols and commas', () => {
    expect(parseMisAmount('₹1,00,000')).toBe(100000);
    expect(parseMisAmount('50,000.00')).toBe(50000);
    expect(parseMisAmount(100000)).toBe(100000);
  });
  it('returns null for blanks and junk', () => {
    expect(parseMisAmount('')).toBeNull();
    expect(parseMisAmount(null)).toBeNull();
    expect(parseMisAmount('-')).toBeNull();
  });
});

describe('parseMisDate', () => {
  it('parses DD-Mon-YY (the MIS format)', () => {
    expect(parseMisDate('24-Oct-26')?.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(parseMisDate('1-Jan-2026')?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('parses ISO and dd/mm/yyyy', () => {
    expect(parseMisDate('2026-10-24')?.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(parseMisDate('24/10/2026')?.toISOString()).toBe('2026-10-24T00:00:00.000Z');
  });
  it('passes through a Date and rejects junk', () => {
    const d = new Date('2026-05-05T00:00:00Z');
    expect(parseMisDate(d)).toBe(d);
    expect(parseMisDate('not a date')).toBeNull();
    expect(parseMisDate('')).toBeNull();
  });
});

describe('parseMisBuffer', () => {
  it('parses rows, normalises mobiles/status/amounts/dates, drops blanks', () => {
    const { rows, error } = parseMisBuffer(csv(SAMPLE));
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(2); // the blank padding row is dropped

    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      rawName: 'RAJIB SAHU',
      mobile: '9876543210',
      loanAmount: 100000,
      approvedAmount: 100000,
      disbursedAmount: 100000,
    });
    expect(rows[0].status).toEqual({ label: 'Disbursed', known: true });
    expect(rows[0].disbursementDate?.toISOString()).toBe('2026-10-24T00:00:00.000Z');

    // +91 / spaces normalised to a 10-digit mobile; quoted "50,000" parsed.
    expect(rows[1].mobile).toBe('9876543211');
    expect(rows[1].approvedAmount).toBe(50000);
    expect(rows[1].disbursedAmount).toBeNull();
    expect(rows[1].status).toEqual({ label: 'Approved', known: true });
  });

  it('errors clearly when required columns are missing', () => {
    const { error } = parseMisBuffer(csv('Foo,Bar\n1,2\n'));
    expect(error).toMatch(/Mobile Number.*Status/);
  });
});

describe('misRowIssue', () => {
  const base = { rowNumber: 2, rawName: null, loanAmount: null, salaryMode: null, remark: null, approvedAmount: null, disbursedAmount: null, disbursementDate: null };
  it('flags a missing/invalid mobile and missing status', () => {
    expect(misRowIssue({ ...base, mobile: null, status: { label: 'Disbursed', known: true } } as any, false)).toBe('missing_mobile');
    expect(misRowIssue({ ...base, mobile: null, status: { label: 'Disbursed', known: true } } as any, true)).toBe('invalid_mobile');
    expect(misRowIssue({ ...base, mobile: '9876543210', status: null } as any, true)).toBe('missing_status');
    expect(misRowIssue({ ...base, mobile: '9876543210', status: { label: 'Disbursed', known: true } } as any, true)).toBeNull();
  });
});

describe('canonHeader', () => {
  it('strips case and punctuation', () => {
    expect(canonHeader('Mobile Number')).toBe('mobilenumber');
    expect(canonHeader('Approved Amt.')).toBe('approvedamt');
  });
});
