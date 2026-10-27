import { describe, it, expect } from 'vitest';
import {
  buildNotifQuery, filtersActive, DEFAULT_NOTIF_FILTERS, typeOptions, unreadForType, subtitleText, dayGroup, groupByDay, bulkAction, bulkBody,
  notifListState, EMPTY_TEXT, needsShowMore, hasNewRows, severityTone, BULK_CONFIRM_ABOVE,
} from './notificationsView';

describe('buildNotifQuery', () => {
  it('sends the read state and paging only by default', () => {
    expect(buildNotifQuery(DEFAULT_NOTIF_FILTERS, 1)).toBe('state=unread&page=1&pageSize=20');
  });
  it('adds type and severity', () => {
    const q = new URLSearchParams(buildNotifQuery({ state: 'all', type: 'loan_stale', severity: 'warning' }, 2, 50));
    expect(Object.fromEntries(q)).toEqual({ state: 'all', type: 'loan_stale', severity: 'warning', page: '2', pageSize: '50' });
  });
  it('treats only type and severity as filters', () => {
    expect(filtersActive({ type: '', severity: '' })).toBe(false);
    expect(filtersActive({ type: 'x', severity: '' })).toBe(true);
    expect(filtersActive({ type: '', severity: 'critical' })).toBe(true);
  });
});

describe('type options and counts', () => {
  const byType = [
    { type: 'loan_stale', label: 'Inactive loan', unread: 3, total: 10 },
    { type: 'app_nudge', label: 'User needs help', unread: 2, total: 4 },
  ];
  it('lists every type with its unread count', () => {
    expect(typeOptions(byType)).toEqual([
      { value: '', label: 'All types (5)' },
      { value: 'loan_stale', label: 'Inactive loan (3)' },
      { value: 'app_nudge', label: 'User needs help (2)' },
    ]);
  });
  it('copes with no counts yet', () => expect(typeOptions(undefined)).toEqual([{ value: '', label: 'All types (0)' }]));
  it('reads the unread count of one type', () => {
    expect(unreadForType(byType, 'loan_stale')).toBe(3);
    expect(unreadForType(byType, 'missing')).toBe(0);
    expect(unreadForType(undefined, 'loan_stale')).toBe(0);
  });
  it('writes the subtitle', () => {
    expect(subtitleText(7)).toBe('7 unread. Alerts about inactive loans, stuck onboarding and users who need help.');
  });
  it('maps severities to tones', () => {
    expect(severityTone('critical')).toBe('red');
    expect(severityTone('success')).toBe('green');
    expect(severityTone('odd')).toBe('grey');
  });
});

describe('dayGroup (India days)', () => {
  const now = new Date('2026-10-27T04:30:00.000Z'); // 10:00 IST on the 27th
  it('puts a few hours ago under Today', () => expect(dayGroup('2026-10-27T01:00:00.000Z', now).label).toBe('Today'));
  it('changes day at midnight IST, not UTC', () => {
    expect(dayGroup('2026-10-26T18:29:59.000Z', now).label).toBe('Yesterday'); // 23:59:59 IST on the 26th
    expect(dayGroup('2026-10-26T18:30:00.000Z', now).label).toBe('Today'); // 00:00 IST on the 27th
    expect(dayGroup('2026-10-25T18:29:59.000Z', now).label).toBe('Earlier this week'); // 23:59:59 IST on the 25th
    expect(dayGroup('2026-10-25T18:30:00.000Z', now).label).toBe('Yesterday');
  });
  it('uses Earlier this week for two to six days back, then dates', () => {
    expect(dayGroup('2026-10-21T04:00:00.000Z', now).label).toBe('Earlier this week');
    expect(dayGroup('2026-10-20T04:00:00.000Z', now)).toEqual({ key: '2026-10-20', label: '20 Oct 2026' });
  });
  it('handles a bad date', () => expect(dayGroup('nope', now).key).toBe('unknown'));
  it('groups consecutive rows under one heading', () => {
    const rows = [
      { id: 'a', createdAt: '2026-10-27T03:00:00.000Z' },
      { id: 'b', createdAt: '2026-10-27T01:00:00.000Z' },
      { id: 'c', createdAt: '2026-10-26T03:00:00.000Z' },
      { id: 'd', createdAt: '2026-10-10T03:00:00.000Z' },
    ];
    const g = groupByDay(rows, now);
    expect(g.map((x) => x.label)).toEqual(['Today', 'Yesterday', '10 Oct 2026']);
    expect(g[0].rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('returns no groups for no rows', () => expect(groupByDay([], now)).toEqual([]));
});

describe('bulkAction', () => {
  const none = { type: '', severity: '' };
  it('covers every unread notification when nothing is filtered', () => {
    const a = bulkAction({ unreadTotal: 12, filteredUnread: 3, filters: none });
    expect(a).toMatchObject({ label: 'Mark all 12 unread as read', count: 12, scoped: false, disabled: false, needsConfirm: false });
  });
  it('covers only the matching unread rows when a type is chosen', () => {
    const a = bulkAction({ unreadTotal: 12, filteredUnread: 3, filters: { type: 'loan_stale', severity: '' } });
    expect(a).toMatchObject({ label: 'Mark these 3 as read', count: 3, scoped: true, disabled: false });
  });
  it('does the same for a severity filter', () => {
    expect(bulkAction({ unreadTotal: 12, filteredUnread: 5, filters: { type: '', severity: 'critical' } }).label).toBe('Mark these 5 as read');
  });
  it('is switched off at zero', () => {
    expect(bulkAction({ unreadTotal: 0, filteredUnread: 0, filters: none })).toMatchObject({ label: 'Mark all as read', count: 0, disabled: true, needsConfirm: false });
    expect(bulkAction({ unreadTotal: 9, filteredUnread: 0, filters: { type: 'app_nudge', severity: '' } }).disabled).toBe(true);
  });
  it('treats a server without the filtered count as zero rather than guessing', () => {
    expect(bulkAction({ unreadTotal: 9, filteredUnread: undefined, filters: { type: 'app_nudge', severity: '' } }).disabled).toBe(true);
  });
  it('asks first only above the limit', () => {
    expect(BULK_CONFIRM_ABOVE).toBe(20);
    expect(bulkAction({ unreadTotal: 20, filteredUnread: 0, filters: none }).needsConfirm).toBe(false);
    const big = bulkAction({ unreadTotal: 21, filteredUnread: 0, filters: none });
    expect(big.needsConfirm).toBe(true);
    expect(big.confirmText).toBe('Mark 21 notifications as read? You can still find them under All.');
    expect(big.confirmTitle).toBe('Mark 21 notifications as read?');
    expect(big.confirmBody).toBe('You can still find them under All.');
  });
  it('builds the request body from the filters', () => {
    expect(bulkBody(none)).toEqual({ filter: {} });
    expect(bulkBody({ type: 'loan_stale', severity: 'warning' })).toEqual({ filter: { type: 'loan_stale', severity: 'warning' } });
  });
});

describe('list state and copy', () => {
  const f = DEFAULT_NOTIF_FILTERS;
  it('shows an error before anything else', () => {
    expect(notifListState({ loading: false, error: new Error('x'), total: 0, filters: f })).toBe('error');
  });
  it('picks the right empty state', () => {
    expect(notifListState({ loading: true, error: null, total: 0, filters: f })).toBe('loading');
    expect(notifListState({ loading: false, error: null, total: 2, filters: f })).toBe('loaded');
    expect(notifListState({ loading: false, error: null, total: 0, filters: { ...f, type: 'loan_stale' } })).toBe('filtered_empty');
    expect(notifListState({ loading: false, error: null, total: 0, filters: f })).toBe('caught_up');
    expect(notifListState({ loading: false, error: null, total: 0, filters: { ...f, state: 'all' } })).toBe('none');
  });
  it('has plain copy without exclamation marks or emoji', () => {
    for (const t of Object.values(EMPTY_TEXT)) {
      expect(t).not.toMatch(/!/);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(EMPTY_TEXT.caught_up).toBe('You are all caught up. There are no unread notifications.');
  });
});

describe('body clipping and refresh', () => {
  it('offers Show more only for long bodies', () => {
    expect(needsShowMore('short')).toBe(false);
    expect(needsShowMore(null)).toBe(false);
    expect(needsShowMore('x'.repeat(141))).toBe(true);
    expect(needsShowMore('a\nb\nc')).toBe(true);
  });
  it('spots a new notification without reordering', () => {
    expect(hasNewRows(['a', 'b'], ['a', 'b'])).toBe(false);
    expect(hasNewRows(['a', 'b'], ['c', 'a', 'b'])).toBe(true);
    expect(hasNewRows(['a', 'b'], ['b'])).toBe(false);
    expect(hasNewRows([], [])).toBe(false);
  });
});
