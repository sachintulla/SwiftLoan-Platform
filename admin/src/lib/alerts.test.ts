import { describe, it, expect } from 'vitest';
import {
  ALERT_STATUSES, ALERT_TYPES, DEFAULT_ALERT_FILTERS, alertListQuery, alertSummaryQuery, callLength, countsLine,
  outcomeTone, parseAlertFilters, serialiseAlertFilters, totalCounts, type AlertCounts, type AlertFilters,
} from './alerts';

const counts = (over: Partial<Record<string, number>> = {}) => ({ total: 0, success: 0, sent: 0, not_answered: 0, failed: 0, pending: 0, ...over });

describe('parseAlertFilters', () => {
  it('starts on today with nothing picked', () => {
    expect(parseAlertFilters('')).toEqual(DEFAULT_ALERT_FILTERS);
    expect(DEFAULT_ALERT_FILTERS.period).toBe('today');
  });
  it('reads the type and status the old pages redirect with', () => {
    expect(parseAlertFilters('?type=call')).toMatchObject({ type: 'call', status: '' });
    expect(parseAlertFilters('type=whatsapp&status=failed')).toMatchObject({ type: 'whatsapp', status: 'failed' });
  });
  it('drops what it does not know', () => {
    expect(parseAlertFilters('type=fax&status=delivered&period=forever')).toEqual(DEFAULT_ALERT_FILTERS);
  });
  it('a search with no period looks at every date, not just today', () => {
    expect(parseAlertFilters('search=9876543210')).toMatchObject({ search: '9876543210', period: 'all' });
    expect(parseAlertFilters('search=9876543210&period=7d')).toMatchObject({ period: '7d' });
  });
  it('keeps dates only for a custom range', () => {
    expect(parseAlertFilters('period=custom&from=2026-11-01&to=2026-11-19')).toMatchObject({ period: 'custom', from: '2026-11-01', to: '2026-11-19' });
    expect(parseAlertFilters('period=7d&from=2026-11-01')).toMatchObject({ period: '7d', from: '' });
    expect(parseAlertFilters('period=custom&from=01-11-2026')).toMatchObject({ from: '' });
  });
});

describe('serialiseAlertFilters', () => {
  it('writes only what differs from the untouched page', () => {
    expect(serialiseAlertFilters(DEFAULT_ALERT_FILTERS)).toBe('');
    const f: AlertFilters = { ...DEFAULT_ALERT_FILTERS, type: 'sms', status: 'failed', search: ' asha ', period: '7d' };
    expect(serialiseAlertFilters(f)).toBe('type=sms&status=failed&search=asha&period=7d');
  });
  it('round-trips', () => {
    const f: AlertFilters = { type: 'call', status: 'not_answered', search: '98765', period: 'custom', from: '2026-11-01', to: '2026-11-19' };
    expect(parseAlertFilters(serialiseAlertFilters(f))).toEqual(f);
  });
});

describe('queries', () => {
  const f: AlertFilters = { ...DEFAULT_ALERT_FILTERS, type: 'whatsapp', status: 'failed', search: 'asha' };
  it('the list carries every filter and the page', () => {
    const q = new URLSearchParams(alertListQuery(f, { range: { from: 'A', to: 'B' } }, 3));
    expect(Object.fromEntries(q)).toEqual({ from: 'A', to: 'B', search: 'asha', type: 'whatsapp', status: 'failed', page: '3', pageSize: '25' });
  });
  it('the counts ignore type and status, so each tile says what picking it would show', () => {
    const q = new URLSearchParams(alertSummaryQuery(f, { range: { from: 'A' } }));
    expect(Object.fromEntries(q)).toEqual({ from: 'A', search: 'asha' });
  });
  it('one customer: scoped by id, no dates', () => {
    const q = new URLSearchParams(alertListQuery({ ...DEFAULT_ALERT_FILTERS, period: 'all' }, { customerId: 'c-1' }, 1));
    expect(q.get('customerId')).toBe('c-1');
    expect(q.has('from')).toBe(false);
  });
});

describe('words', () => {
  it('call length', () => {
    expect(callLength(117)).toBe('1 min 57 sec');
    expect(callLength(45)).toBe('45 sec');
    expect(callLength(120)).toBe('2 min');
    expect(callLength(0)).toBeNull();
    expect(callLength(null)).toBeNull();
  });
  it('the line under a tile leaves out zeros and says "answered" for calls', () => {
    expect(countsLine('whatsapp', counts({ sent: 122, failed: 6 }))).toBe('122 sent · 6 failed');
    expect(countsLine('call', counts({ success: 9, not_answered: 10, failed: 3 }))).toBe('9 answered · 10 not answered · 3 failed');
    expect(countsLine('sms', counts({ success: 4, pending: 1 }))).toBe('4 success · 1 waiting');
    expect(countsLine('push', counts())).toBe('');
    expect(countsLine('push', undefined)).toBe('');
  });
  it('adds every type up for the customer tile', () => {
    const all: AlertCounts = {
      whatsapp: counts({ total: 4, sent: 4 }), sms: counts({ total: 2, sent: 1, failed: 1 }),
      push: counts({ total: 1, failed: 1 }), call: counts({ total: 2, success: 1, not_answered: 1 }),
    } as AlertCounts;
    expect(totalCounts(all)).toEqual({ total: 9, success: 1, sent: 5, not_answered: 1, failed: 2, pending: 0 });
    expect(totalCounts(undefined).total).toBe(0);
  });
  it('colours: worked green, accepted blue, rang out amber, failed red', () => {
    expect(outcomeTone('success')).toBe('green');
    expect(outcomeTone('sent')).toBe('blue');
    expect(outcomeTone('not_answered')).toBe('amber');
    expect(outcomeTone('failed')).toBe('red');
    expect(outcomeTone('pending')).toBe('grey');
  });
  it('offers the four types and five statuses once each', () => {
    expect(ALERT_TYPES.map((t) => t.key)).toEqual(['whatsapp', 'sms', 'push', 'call']);
    expect(new Set(ALERT_STATUSES.map((s) => s.key)).size).toBe(5);
  });
});
