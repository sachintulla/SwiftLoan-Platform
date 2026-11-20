// The admin Alerts list as plain data: types, the query strings and the few words the screens need. Pure, so it is
// tested without a browser (alerts.test.ts). The server decides everything about a row (lib/alerts.ts there); this
// file only asks for rows and words them.

export type AlertType = 'whatsapp' | 'sms' | 'push' | 'call';
export type AlertOutcome = 'success' | 'sent' | 'not_answered' | 'failed' | 'pending';
export type AlertPeriod = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export const ALERT_TYPES: { key: AlertType; label: string; plural: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', plural: 'WhatsApp' },
  { key: 'sms', label: 'SMS', plural: 'SMS' },
  { key: 'push', label: 'Push', plural: 'Push' },
  { key: 'call', label: 'Call', plural: 'Calls' },
];

export const ALERT_STATUSES: { key: AlertOutcome; label: string }[] = [
  { key: 'success', label: 'Success' },
  { key: 'sent', label: 'Sent' },
  { key: 'not_answered', label: 'Not answered' },
  { key: 'failed', label: 'Failed' },
  { key: 'pending', label: 'Waiting' },
];

export interface AlertRow {
  id: string;
  type: AlertType;
  typeLabel: string;
  at: string;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  name: string;
  outcome: AlertOutcome;
  status: string;
  error: string | null;
  durationSec: number | null;
}

export type AlertCounts = Record<AlertType, Record<AlertOutcome, number> & { total: number }>;

export interface AlertDetail {
  id: string;
  type: AlertType;
  typeLabel: string;
  name: string;
  outcome: AlertOutcome;
  status: string;
  error: string | null;
  customer: { id: string | null; name: string | null; phone: string | null };
  times: { label: string; at: string }[];
  sentBecause: string | null;
  text: string | null;
  template: string | null;
  call: null | { durationSec: number | null; result: string | null; summary: string | null; recordingUrl: string | null; transcript: unknown };
}

const TYPE_KEYS = ALERT_TYPES.map((t) => t.key) as string[];
const STATUS_KEYS = ALERT_STATUSES.map((s) => s.key) as string[];

export const isAlertType = (v: unknown): v is AlertType => typeof v === 'string' && TYPE_KEYS.includes(v);
export const isAlertOutcome = (v: unknown): v is AlertOutcome => typeof v === 'string' && STATUS_KEYS.includes(v);

/** Badge colour for how a row ended (the admin's shared palette: green worked, blue in progress, amber waiting, red failed). */
export function outcomeTone(outcome: AlertOutcome): 'green' | 'blue' | 'amber' | 'red' | 'grey' {
  switch (outcome) {
    case 'success': return 'green';
    case 'sent': return 'blue';
    case 'not_answered': return 'amber';
    case 'failed': return 'red';
    default: return 'grey';
  }
}

/** "1 min 57 sec", "45 sec", "2 min". Null when there is nothing to show. */
export function callLength(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m === 0) return `${rest} sec`;
  return rest === 0 ? `${m} min` : `${m} min ${rest} sec`;
}

export interface AlertFilters {
  type: AlertType | '';
  status: AlertOutcome | '';
  search: string;
  period: AlertPeriod;
  /** YYYY-MM-DD, used when the period is custom. */
  from: string;
  to: string;
}

export const DEFAULT_ALERT_FILTERS: AlertFilters = { type: '', status: '', search: '', period: 'today', from: '', to: '' };

const PERIOD_KEYS: AlertPeriod[] = ['all', 'today', 'yesterday', '7d', '30d', 'custom'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Filters from the address bar (so /alerts?type=call, where the old Calls page now sends people, opens on calls). */
export function parseAlertFilters(input: string | URLSearchParams | null | undefined): AlertFilters {
  const sp = typeof input === 'string' ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input) : input ?? new URLSearchParams();
  const out: AlertFilters = { ...DEFAULT_ALERT_FILTERS };
  const type = (sp.get('type') ?? '').trim();
  if (isAlertType(type)) out.type = type;
  const status = (sp.get('status') ?? '').trim();
  if (isAlertOutcome(status)) out.status = status;
  out.search = (sp.get('search') ?? '').trim().slice(0, 80);
  const period = (sp.get('period') ?? '').trim() as AlertPeriod;
  if (PERIOD_KEYS.includes(period)) out.period = period;
  const from = (sp.get('from') ?? '').trim();
  const to = (sp.get('to') ?? '').trim();
  if (DATE_RE.test(from)) out.from = from;
  if (DATE_RE.test(to)) out.to = to;
  if (out.period !== 'custom') { out.from = ''; out.to = ''; }
  // Looking someone up should not be cut to today's alerts.
  if (out.search && !sp.get('period')) out.period = 'all';
  return out;
}

/** The address-bar form: only what differs from the untouched page. */
export function serialiseAlertFilters(f: AlertFilters): string {
  const sp = new URLSearchParams();
  if (f.type) sp.set('type', f.type);
  if (f.status) sp.set('status', f.status);
  if (f.search.trim()) sp.set('search', f.search.trim());
  if (f.period !== DEFAULT_ALERT_FILTERS.period) sp.set('period', f.period);
  if (f.period === 'custom') {
    if (f.from) sp.set('from', f.from);
    if (f.to) sp.set('to', f.to);
  }
  return sp.toString();
}

export interface AlertScope {
  /** Only this customer's alerts (the customer page's tab). */
  customerId?: string;
  /** ISO instants computed from the period (lib/period.ts computeRange), passed in so this file does not read the clock. */
  range?: { from?: string; to?: string };
}

function scopeParams(f: Pick<AlertFilters, 'search'>, scope: AlertScope): URLSearchParams {
  const sp = new URLSearchParams();
  if (scope.customerId) sp.set('customerId', scope.customerId);
  if (scope.range?.from) sp.set('from', scope.range.from);
  if (scope.range?.to) sp.set('to', scope.range.to);
  if (f.search.trim()) sp.set('search', f.search.trim());
  return sp;
}

/** Query for the list. */
export function alertListQuery(f: AlertFilters, scope: AlertScope, page: number, pageSize = 25): string {
  const sp = scopeParams(f, scope);
  if (f.type) sp.set('type', f.type);
  if (f.status) sp.set('status', f.status);
  sp.set('page', String(page));
  sp.set('pageSize', String(pageSize));
  return sp.toString();
}

/** Query for the counts: the same slice without the type and status, so each tile says what picking it would show. */
export function alertSummaryQuery(f: AlertFilters, scope: AlertScope): string {
  return scopeParams(f, scope).toString();
}

/** One line under a tile's number: "122 sent · 6 failed". Parts that are zero are left out. */
export function countsLine(type: AlertType, c: Record<AlertOutcome, number> | undefined): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.success) parts.push(`${c.success} ${type === 'call' ? 'answered' : 'success'}`);
  if (c.sent) parts.push(`${c.sent} sent`);
  if (c.not_answered) parts.push(`${c.not_answered} not answered`);
  if (c.failed) parts.push(`${c.failed} failed`);
  if (c.pending) parts.push(`${c.pending} waiting`);
  return parts.join(' · ');
}

/** Every type added up, for the customer page's tile. */
export function totalCounts(counts: AlertCounts | undefined): Record<AlertOutcome, number> & { total: number } {
  const out = { total: 0, success: 0, sent: 0, not_answered: 0, failed: 0, pending: 0 };
  if (!counts) return out;
  for (const t of ALERT_TYPES) {
    const c = counts[t.key];
    if (!c) continue;
    out.total += c.total; out.success += c.success; out.sent += c.sent;
    out.not_answered += c.not_answered; out.failed += c.failed; out.pending += c.pending;
  }
  return out;
}
