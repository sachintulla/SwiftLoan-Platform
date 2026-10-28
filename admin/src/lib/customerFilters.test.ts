import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CUSTOMER_FILTERS, STALLED_OPTIONS, parseCustomerFilters, serialiseCustomerFilters, hasCustomerFilters,
  customerListQuery, customerExportQuery, stalledLabelFor, stalledOptionsFor, canExport, type CustomerFilters,
} from './customerFilters';

describe('parseCustomerFilters', () => {
  it('gives the defaults for an empty address', () => {
    expect(parseCustomerFilters('')).toEqual(DEFAULT_CUSTOMER_FILTERS);
    expect(parseCustomerFilters(null)).toEqual(DEFAULT_CUSTOMER_FILTERS);
  });

  it('reads the Onboarding redirect, /customers?stalledMinutes=60', () => {
    expect(parseCustomerFilters('?stalledMinutes=60').stalledMinutes).toBe('60');
    expect(parseCustomerFilters('stalledMinutes=60').stalledMinutes).toBe('60');
  });

  it('reads every filter', () => {
    const f = parseCustomerFilters('stage=kyc_started&source=app&campaignId=c1&search=asha&stalledMinutes=1440&period=7d');
    expect(f).toEqual({ stage: 'kyc_started', source: 'app', campaignId: 'c1', search: 'asha', stalledMinutes: '1440', period: '7d', from: '', to: '' });
  });

  it('reads a custom range', () => {
    const f = parseCustomerFilters('period=custom&from=2026-10-01&to=2026-10-15');
    expect(f.period).toBe('custom');
    expect(f.from).toBe('2026-10-01');
    expect(f.to).toBe('2026-10-15');
  });

  it('treats bare dates as a custom range, and drops dates for any other period', () => {
    expect(parseCustomerFilters('from=2026-10-01').period).toBe('custom');
    const f = parseCustomerFilters('period=today&from=2026-10-01&to=2026-10-02');
    expect(f.from).toBe('');
    expect(f.to).toBe('');
  });

  it('ignores junk rather than breaking', () => {
    const f = parseCustomerFilters('stage=<script>&stalledMinutes=abc&period=forever&from=yesterday&campaignId=a b');
    expect(f).toEqual(DEFAULT_CUSTOMER_FILTERS);
    expect(parseCustomerFilters('stalledMinutes=-5').stalledMinutes).toBe('');
    expect(parseCustomerFilters('stalledMinutes=0').stalledMinutes).toBe('');
  });

  it('accepts a URLSearchParams and trims search', () => {
    expect(parseCustomerFilters(new URLSearchParams({ search: '  98765  ' })).search).toBe('98765');
  });
});

describe('serialiseCustomerFilters', () => {
  it('is empty for the defaults, so the address bar stays clean', () => {
    expect(serialiseCustomerFilters(DEFAULT_CUSTOMER_FILTERS)).toBe('');
    expect(hasCustomerFilters(DEFAULT_CUSTOMER_FILTERS)).toBe(false);
  });

  it('writes only what is set', () => {
    const f: CustomerFilters = { ...DEFAULT_CUSTOMER_FILTERS, stage: 'offers_viewed', stalledMinutes: '360' };
    expect(serialiseCustomerFilters(f)).toBe('stage=offers_viewed&stalledMinutes=360');
    expect(hasCustomerFilters(f)).toBe(true);
  });

  it('round trips every filter', () => {
    const cases: CustomerFilters[] = [
      { stage: 'kyc_started', source: 'app', campaignId: 'c1', search: 'asha verma', stalledMinutes: '4320', period: '30d', from: '', to: '' },
      { ...DEFAULT_CUSTOMER_FILTERS, period: 'custom', from: '2026-10-01', to: '2026-10-15' },
      { ...DEFAULT_CUSTOMER_FILTERS, search: 'a&b=c' },
      { ...DEFAULT_CUSTOMER_FILTERS, period: 'yesterday' },
    ];
    for (const f of cases) expect(parseCustomerFilters(serialiseCustomerFilters(f))).toEqual(f);
  });
});

describe('Inactive for options', () => {
  it('maps the five choices to minutes', () => {
    expect(STALLED_OPTIONS.map((o) => [o.label, o.value])).toEqual([
      ['Any inactivity', ''],
      ['1 hour', '60'],
      ['6 hours', '360'],
      ['24 hours', '1440'],
      ['3 days', '4320'],
    ]);
  });

  it('describes a value that is not one of the choices', () => {
    expect(stalledLabelFor('60')).toBe('1 hour');
    expect(stalledLabelFor('120')).toBe('2 hours');
    expect(stalledLabelFor('2880')).toBe('2 days');
    expect(stalledLabelFor('45')).toBe('45 minutes');
    expect(stalledLabelFor('')).toBe('Any inactivity');
  });

  it('adds an unusual value to the select so it never shows blank', () => {
    expect(stalledOptionsFor('60')).toBe(STALLED_OPTIONS);
    const opts = stalledOptionsFor('120');
    expect(opts).toHaveLength(STALLED_OPTIONS.length + 1);
    expect(opts[opts.length - 1]).toEqual({ value: '120', label: '2 hours' });
  });
});

describe('list and export queries', () => {
  const f: CustomerFilters = { stage: 'kyc_started', source: 'app', campaignId: 'c1', search: 'asha', stalledMinutes: '60', period: '7d', from: '', to: '' };
  const range = { from: '2026-10-20T00:00:00.000Z', to: '2026-10-27T00:00:00.000Z' };

  it('puts every filter, including search, from and to, in the export', () => {
    const qs = new URLSearchParams(customerExportQuery(f, range));
    expect(Object.fromEntries(qs)).toEqual({
      stage: 'kyc_started', source: 'app', campaignId: 'c1', search: 'asha', stalledMinutes: '60',
      from: range.from, to: range.to,
    });
  });

  it('never puts paging in the export', () => {
    const qs = new URLSearchParams(customerExportQuery(f, range));
    expect(qs.has('page')).toBe(false);
    expect(qs.has('pageSize')).toBe(false);
  });

  it('gives the list the same filters plus paging', () => {
    const list = new URLSearchParams(customerListQuery(f, range, 3));
    const exp = new URLSearchParams(customerExportQuery(f, range));
    expect(list.get('page')).toBe('3');
    expect(list.get('pageSize')).toBe('25');
    exp.forEach((v, k) => expect(list.get(k)).toBe(v));
  });

  it('leaves out empty filters', () => {
    expect(customerExportQuery(DEFAULT_CUSTOMER_FILTERS, {})).toBe('');
  });
});

describe('canExport', () => {
  it('allows admin and super admin only', () => {
    expect(canExport('super_admin')).toBe(true);
    expect(canExport('admin')).toBe(true);
    expect(canExport('analyst')).toBe(false);
    expect(canExport(null)).toBe(false);
  });
});
