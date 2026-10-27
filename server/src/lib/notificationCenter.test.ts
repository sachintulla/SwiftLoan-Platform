import { describe, it, expect } from 'vitest';
import { typeLabel, severityLabel, targetFor, entityKind, buildNotificationWhere, buildBulkReadWhere, dayGroup, needsAttention, isSeverity, invalidBulkFilter } from './notificationCenter.js';

describe('typeLabel', () => {
  it('names the three types the code creates', () => {
    expect(typeLabel('loan_stale')).toBe('Inactive loan');
    expect(typeLabel('onboarding_stale')).toBe('Stuck onboarding');
    expect(typeLabel('app_nudge')).toBe('User needs help');
  });
  it('title-cases an unknown type', () => {
    expect(typeLabel('new_lead')).toBe('New Lead');
    expect(typeLabel('system')).toBe('System');
    expect(typeLabel('some-odd__type')).toBe('Some Odd Type');
  });
  it('copes with empty input', () => {
    expect(typeLabel('')).toBe('Notification');
    expect(typeLabel(null)).toBe('Notification');
  });
});

describe('severityLabel', () => {
  it('uses plain words', () => {
    expect(severityLabel('critical')).toBe('Critical');
    expect(severityLabel('warning')).toBe('Warning');
    expect(severityLabel('info')).toBe('Info');
    expect(severityLabel('success')).toBe('Done');
  });
  it('falls back for unknown values', () => {
    expect(severityLabel('weird')).toBe('Weird');
    expect(severityLabel(undefined)).toBe('Info');
  });
  it('flags critical and warning as needing attention', () => {
    expect(needsAttention('critical')).toBe(true);
    expect(needsAttention('warning')).toBe(true);
    expect(needsAttention('info')).toBe(false);
    expect(needsAttention('success')).toBe(false);
    expect(isSeverity('warning')).toBe(true);
    expect(isSeverity('bogus')).toBe(false);
  });
});

describe('targetFor', () => {
  it('links an inactive loan to the loan', () => {
    expect(targetFor('loan_stale', 'L1', { loan: { id: 'L1' } })).toEqual({ kind: 'loan', id: 'L1', href: '/loans/L1', label: 'Open loan' });
  });
  it('links onboarding and help alerts to the customer, not the user', () => {
    expect(targetFor('onboarding_stale', 'U1', { customer: { id: 'C9' } })).toEqual({ kind: 'customer', id: 'C9', href: '/customers/C9', label: 'Open customer' });
    expect(targetFor('app_nudge', 'U1', { customer: { id: 'C9' } })?.href).toBe('/customers/C9');
  });
  it('returns null when the entity is missing or does not resolve', () => {
    expect(targetFor('loan_stale', null, { loan: { id: 'L1' } })).toBeNull();
    expect(targetFor('loan_stale', 'L1', { loan: null })).toBeNull();
    expect(targetFor('loan_stale', 'L1', null)).toBeNull();
    expect(targetFor('app_nudge', 'U1', { customer: null })).toBeNull();
    expect(targetFor('loan_stale', 'L1', { customer: { id: 'C1' } })).toBeNull();
  });
  it('returns null for a type with no destination', () => {
    expect(targetFor('new_lead', 'X', { loan: { id: 'X' }, customer: { id: 'X' } })).toBeNull();
  });
  it('maps each type to the table its entityId points at', () => {
    expect(entityKind('loan_stale')).toBe('loan');
    expect(entityKind('app_nudge')).toBe('user');
    expect(entityKind('onboarding_stale')).toBe('user');
    expect(entityKind('other')).toBeNull();
  });
});

describe('buildNotificationWhere', () => {
  it('is empty with no filters', () => {
    expect(buildNotificationWhere({})).toEqual({});
    expect(buildNotificationWhere({ state: 'all' })).toEqual({});
  });
  it('filters unread', () => expect(buildNotificationWhere({ state: 'unread' })).toEqual({ read: false }));
  it('filters by type', () => expect(buildNotificationWhere({ type: 'loan_stale' })).toEqual({ type: 'loan_stale' }));
  it('filters by severity', () => expect(buildNotificationWhere({ severity: 'critical' })).toEqual({ severity: 'critical' }));
  it('combines every filter', () => {
    expect(buildNotificationWhere({ state: 'unread', type: 'app_nudge', severity: 'warning' })).toEqual({ read: false, type: 'app_nudge', severity: 'warning' });
  });
  it('ignores a malformed type or unknown severity', () => {
    expect(buildNotificationWhere({ type: "x'; drop table", severity: 'bogus' })).toEqual({});
    expect(buildNotificationWhere({ type: '', severity: null })).toEqual({});
  });
  it('bulk read always targets unread rows only', () => {
    expect(buildBulkReadWhere({})).toEqual({ read: false });
    expect(buildBulkReadWhere({ type: 'loan_stale', severity: 'warning' })).toEqual({ read: false, type: 'loan_stale', severity: 'warning' });
  });
});

describe('dayGroup (India days)', () => {
  // 27 Oct 2026, 10:00 IST = 04:30 UTC
  const now = new Date('2026-10-27T04:30:00.000Z');
  it('groups the same day as Today', () => {
    expect(dayGroup(new Date('2026-10-27T04:00:00.000Z'), now)).toEqual({ key: 'today', label: 'Today' });
  });
  it('starts Today at midnight IST, which is 18:30 UTC the evening before', () => {
    expect(dayGroup(new Date('2026-10-26T18:29:59.000Z'), now).key).toBe('yesterday'); // 23:59:59 IST on the 26th
    expect(dayGroup(new Date('2026-10-26T18:30:00.000Z'), now).key).toBe('today'); // 00:00:00 IST on the 27th
  });
  it('ends Today at the next midnight IST', () => {
    const lateNow = new Date('2026-10-27T18:29:00.000Z'); // 23:59 IST
    expect(dayGroup(new Date('2026-10-27T04:00:00.000Z'), lateNow).key).toBe('today');
    expect(dayGroup(new Date('2026-10-27T04:00:00.000Z'), new Date('2026-10-27T18:31:00.000Z')).key).toBe('yesterday'); // 00:01 IST on the 28th
  });
  it('groups two to six days back as earlier this week', () => {
    expect(dayGroup(new Date('2026-10-25T04:00:00.000Z'), now)).toEqual({ key: 'week', label: 'Earlier this week' });
    expect(dayGroup(new Date('2026-10-21T04:00:00.000Z'), now).key).toBe('week');
  });
  it('shows a date from seven days back', () => {
    expect(dayGroup(new Date('2026-10-20T04:00:00.000Z'), now)).toEqual({ key: '2026-10-20', label: '20 Oct 2026' });
  });
  it('keys a late-evening UTC time under the next India day', () => {
    expect(dayGroup(new Date('2026-10-10T19:00:00.000Z'), now)).toEqual({ key: '2026-10-11', label: '11 Oct 2026' });
  });
  it('treats a future time as today and a bad date as unknown', () => {
    expect(dayGroup(new Date('2026-10-30T04:00:00.000Z'), now).key).toBe('today');
    expect(dayGroup('not a date', now).key).toBe('unknown');
  });
  it('accepts an ISO string', () => expect(dayGroup('2026-10-26T04:00:00.000Z', now).key).toBe('yesterday'));
});

describe('invalidBulkFilter', () => {
  it('rejects a bulk filter value it does not recognise instead of widening to every unread row', () => {
    expect(invalidBulkFilter({ type: 'bad type!' })).toMatch(/not valid/);
    expect(invalidBulkFilter({ severity: 'bogus' })).toMatch(/not valid/);
  });

  it('accepts known values, an absent filter and empty values', () => {
    expect(invalidBulkFilter({ type: 'loan_stale', severity: 'warning' })).toBeNull();
    expect(invalidBulkFilter(undefined)).toBeNull();
    expect(invalidBulkFilter({ type: '', severity: null })).toBeNull();
  });
});
