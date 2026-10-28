// Pure helpers for the Notifications page: filter query, date grouping,
// the bulk "mark as read" wording and the empty-state choice. No React and no
// network, so every rule here is covered by notificationsView.test.ts.

/* ───────────────────────────── API shapes ───────────────────────────── */

export type Severity = 'critical' | 'warning' | 'info' | 'success';

export interface NotifRow {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  body: string | null;
  severity: string;
  severityLabel: string;
  read: boolean;
  createdAt: string;
  entityId: string | null;
  target: { kind: 'loan' | 'customer'; id: string; href: string; label: string } | null;
  subject: { name: string | null; phone: string | null; ref: string | null } | null;
}

export interface NotifPayload {
  rows: NotifRow[];
  unread: number;
  needsAttention: number;
  /** Unread rows matching the current type and severity filters. Present on current servers. */
  filteredUnread?: number;
  counts: {
    byType: { type: string; label: string; unread: number; total: number }[];
    bySeverity: { severity: string; unread: number }[];
  };
}

/* ───────────────────────────── query ───────────────────────────── */

export type ReadState = 'unread' | 'all';

export interface NotifFilters { state: ReadState; type: string; severity: string }

export const DEFAULT_NOTIF_FILTERS: NotifFilters = { state: 'unread', type: '', severity: '' };

/** The type and severity selections. The Unread/All switch is a view, not a filter. */
export const filtersActive = (f: Pick<NotifFilters, 'type' | 'severity'>): boolean => !!(f.type || f.severity);

export function buildNotifQuery(f: NotifFilters, page: number, pageSize = 20): string {
  const p = new URLSearchParams({ state: f.state, page: String(page), pageSize: String(pageSize) });
  if (f.type) p.set('type', f.type);
  if (f.severity) p.set('severity', f.severity);
  return p.toString();
}

export const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any severity' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Done' },
];

const SEVERITY_TONE: Record<string, string> = { info: 'blue', success: 'green', warning: 'amber', critical: 'red' };
export const severityTone = (s: string): string => SEVERITY_TONE[s] ?? 'grey';

/** Type filter choices with their unread counts: "Inactive loan (3)". */
export function typeOptions(byType: NotifPayload['counts']['byType'] | undefined): { value: string; label: string }[] {
  const rows = byType ?? [];
  const unread = rows.reduce((n, t) => n + t.unread, 0);
  return [
    { value: '', label: `All types (${unread})` },
    ...rows.map((t) => ({ value: t.type, label: `${t.label} (${t.unread})` })),
  ];
}

/** Unread count for one type, for the stat cells. */
export function unreadForType(byType: NotifPayload['counts']['byType'] | undefined, type: string): number {
  return byType?.find((t) => t.type === type)?.unread ?? 0;
}

export const subtitleText = (unread: number): string =>
  `${unread} unread. Alerts about inactive loans, stuck onboarding and users who need help.`;

/* ───────────────────────────── date groups ───────────────────────────── */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The calendar day in India as a UTC-midnight timestamp. India has no daylight saving. */
const istDay = (d: Date): number => Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS;

export interface DayGroup { key: string; label: string }

/**
 * The heading a row sits under: Today, Yesterday, Earlier this week (two to six
 * days back), then the date. Days are India days whatever the browser's zone,
 * the same as the server's rule in lib/notificationCenter.ts.
 */
export function dayGroup(date: string | Date, now: Date = new Date()): DayGroup {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return { key: 'unknown', label: 'Unknown date' };
  const diff = Math.round((istDay(now) - istDay(d)) / DAY_MS);
  if (diff <= 0) return { key: 'today', label: 'Today' };
  if (diff === 1) return { key: 'yesterday', label: 'Yesterday' };
  if (diff <= 6) return { key: 'week', label: 'Earlier this week' };
  const ist = new Date(istDay(d));
  return { key: ist.toISOString().slice(0, 10), label: `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}` };
}

/** Rows grouped under their day heading, in the order given (the server sorts newest first). */
export function groupByDay<T extends { createdAt: string }>(rows: T[], now: Date = new Date()): { key: string; label: string; rows: T[] }[] {
  const out: { key: string; label: string; rows: T[] }[] = [];
  for (const r of rows) {
    const g = dayGroup(r.createdAt, now);
    const last = out[out.length - 1];
    if (last && last.key === g.key) last.rows.push(r);
    else out.push({ key: g.key, label: g.label, rows: [r] });
  }
  return out;
}

/* ───────────────────────────── bulk mark as read ───────────────────────────── */

/** More than this many rows asks first. */
export const BULK_CONFIRM_ABOVE = 20;

export interface BulkAction {
  label: string;
  /** How many unread rows the button changes. */
  count: number;
  /** True when only the filtered rows are covered. */
  scoped: boolean;
  disabled: boolean;
  needsConfirm: boolean;
  /** Confirm dialog wording: the question, the reassurance, and both together. */
  confirmTitle: string;
  confirmBody: string;
  confirmText: string;
}

/**
 * What the bulk button says and does. With no type or severity filter it
 * covers every unread notification; with one it covers only the unread rows
 * matching it. The label always states the count it will change.
 */
export function bulkAction(args: { unreadTotal: number; filteredUnread: number | null | undefined; filters: Pick<NotifFilters, 'type' | 'severity'> }): BulkAction {
  const scoped = filtersActive(args.filters);
  const count = scoped ? Math.max(0, args.filteredUnread ?? 0) : Math.max(0, args.unreadTotal);
  if (count === 0) {
    return { label: 'Mark all as read', count: 0, scoped, disabled: true, needsConfirm: false, confirmTitle: '', confirmBody: '', confirmText: '' };
  }
  return {
    label: scoped ? `Mark these ${count} as read` : `Mark all ${count} unread as read`,
    count,
    scoped,
    disabled: false,
    needsConfirm: count > BULK_CONFIRM_ABOVE,
    confirmTitle: `Mark ${count} notifications as read?`,
    confirmBody: 'You can still find them under All.',
    confirmText: `Mark ${count} notifications as read? You can still find them under All.`,
  };
}

/** Body for POST /api/admin/notification-center/read from the bulk button. */
export function bulkBody(filters: Pick<NotifFilters, 'type' | 'severity'>): { filter: { type?: string; severity?: string } } {
  return { filter: { ...(filters.type ? { type: filters.type } : {}), ...(filters.severity ? { severity: filters.severity } : {}) } };
}

/* ───────────────────────────── list states ───────────────────────────── */

export type NotifListState = 'loading' | 'error' | 'filtered_empty' | 'caught_up' | 'none' | 'loaded';

export function notifListState(args: { loading: boolean; error: unknown; total: number; filters: NotifFilters }): NotifListState {
  if (args.error) return 'error';
  if (args.loading) return 'loading';
  if (args.total > 0) return 'loaded';
  if (filtersActive(args.filters)) return 'filtered_empty';
  return args.filters.state === 'unread' ? 'caught_up' : 'none';
}

export const EMPTY_TEXT: Record<'filtered_empty' | 'caught_up' | 'none', string> = {
  filtered_empty: 'No notifications match these filters.',
  caught_up: 'You are all caught up. There are no unread notifications.',
  none: 'No notifications yet. Alerts appear here when a loan goes quiet or a user needs help.',
};

/* ───────────────────────────── body clipping and refresh ───────────────────────────── */

const CLIP_AT = 140;

/** Whether the body is long enough that a two-line clip would hide some of it. */
export function needsShowMore(body: string | null | undefined): boolean {
  if (!body) return false;
  return body.length > CLIP_AT || body.split('\n').length > 2;
}

/**
 * True when the latest fetch holds a notification the on-screen list does not.
 * While the pointer or focus is in the list the page keeps what is shown and
 * offers a "New notifications arrived" chip instead of reordering the rows.
 */
export function hasNewRows(shownIds: string[], latestIds: string[]): boolean {
  const shown = new Set(shownIds);
  return latestIds.some((id) => !shown.has(id));
}
