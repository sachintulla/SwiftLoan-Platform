// The Customers page filters as plain data: read from the address bar, written
// back to it, and turned into the list and export query strings. Pure, so the
// round trip and the "Inactive for" options can be tested without a browser.
//
// Why the address bar: the retired Onboarding page redirects to
// /customers?stalledMinutes=60, and a filtered view should survive a reload or
// being pasted to a colleague.

export type CustomerPeriod = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface CustomerFilters {
  stage: string;
  source: string;
  campaignId: string;
  search: string;
  /** Minutes of no website or app activity, as a string ('' = any). */
  stalledMinutes: string;
  period: CustomerPeriod;
  /** YYYY-MM-DD, used when period is custom. */
  from: string;
  to: string;
}

export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = {
  stage: '', source: '', campaignId: '', search: '', stalledMinutes: '', period: 'all', from: '', to: '',
};

const PERIODS: CustomerPeriod[] = ['all', 'today', 'yesterday', '7d', '30d', 'custom'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** The "Inactive for" choices. The value is what the API takes as stalledMinutes. */
export const STALLED_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any inactivity' },
  { value: '60', label: '1 hour' },
  { value: '360', label: '6 hours' },
  { value: '1440', label: '24 hours' },
  { value: '4320', label: '3 days' },
];

/** Words for a number of minutes that is not one of the standard choices (an old bookmark, say). */
export function stalledLabelFor(minutes: string): string {
  const n = parseInt(minutes, 10);
  if (!Number.isFinite(n) || n <= 0) return 'Any inactivity';
  const known = STALLED_OPTIONS.find((o) => o.value === String(n));
  if (known) return known.label;
  if (n % 1440 === 0) return `${n / 1440} days`;
  if (n % 60 === 0) return `${n / 60} hours`;
  return `${n} minutes`;
}

/** The options for the select, with the current value added when it is not a standard one so it never shows as blank. */
export function stalledOptionsFor(current: string): { value: string; label: string }[] {
  if (!current || STALLED_OPTIONS.some((o) => o.value === current)) return STALLED_OPTIONS;
  return [...STALLED_OPTIONS, { value: current, label: stalledLabelFor(current) }];
}

function clean(v: string | null | undefined): string {
  return (v ?? '').trim();
}

/** Accepts a query string with or without the leading "?", or a URLSearchParams. Anything invalid falls back to the default. */
export function parseCustomerFilters(input: string | URLSearchParams | null | undefined): CustomerFilters {
  const sp = typeof input === 'string' ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
    : input ?? new URLSearchParams();
  const out: CustomerFilters = { ...DEFAULT_CUSTOMER_FILTERS };

  const stage = clean(sp.get('stage'));
  if (KEY_RE.test(stage)) out.stage = stage;
  const source = clean(sp.get('source'));
  if (KEY_RE.test(source)) out.source = source;
  const campaignId = clean(sp.get('campaignId'));
  if (KEY_RE.test(campaignId)) out.campaignId = campaignId;
  // Search is free text; keep it modest so a pasted URL cannot carry a novel.
  out.search = clean(sp.get('search')).slice(0, 120);

  const stalled = clean(sp.get('stalledMinutes'));
  if (/^\d{1,6}$/.test(stalled) && parseInt(stalled, 10) > 0) out.stalledMinutes = String(parseInt(stalled, 10));

  const period = clean(sp.get('period')) as CustomerPeriod;
  if (PERIODS.includes(period)) out.period = period;
  const from = clean(sp.get('from'));
  const to = clean(sp.get('to'));
  if (DATE_RE.test(from)) out.from = from;
  if (DATE_RE.test(to)) out.to = to;
  // Dates only mean something for a custom range; a bare from/to gives one.
  if ((out.from || out.to) && out.period === 'all') out.period = 'custom';
  if (out.period !== 'custom') { out.from = ''; out.to = ''; }
  return out;
}

/** The query string for the address bar (no leading "?"): only what differs from the defaults. */
export function serialiseCustomerFilters(f: CustomerFilters): string {
  const sp = new URLSearchParams();
  if (f.stage) sp.set('stage', f.stage);
  if (f.source) sp.set('source', f.source);
  if (f.campaignId) sp.set('campaignId', f.campaignId);
  if (f.search.trim()) sp.set('search', f.search.trim());
  if (f.stalledMinutes) sp.set('stalledMinutes', f.stalledMinutes);
  if (f.period !== 'all') sp.set('period', f.period);
  if (f.period === 'custom') {
    if (f.from) sp.set('from', f.from);
    if (f.to) sp.set('to', f.to);
  }
  return sp.toString();
}

/** True when anything differs from the untouched page. */
export function hasCustomerFilters(f: CustomerFilters): boolean {
  return serialiseCustomerFilters(f) !== '';
}

/**
 * The filter parameters shared by the list and the export. `range` is the ISO
 * range computed from the period (lib/period.ts computeRange), passed in so this
 * file does not depend on the clock. The list adds paging on top; the export
 * does not, which is how the file follows exactly what the table shows.
 */
export function customerFilterParams(f: CustomerFilters, range: { from?: string; to?: string }): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.stage) sp.set('stage', f.stage);
  if (f.source) sp.set('source', f.source);
  if (f.campaignId) sp.set('campaignId', f.campaignId);
  if (f.search.trim()) sp.set('search', f.search.trim());
  if (f.stalledMinutes) sp.set('stalledMinutes', f.stalledMinutes);
  if (range.from) sp.set('from', range.from);
  if (range.to) sp.set('to', range.to);
  return sp;
}

export function customerListQuery(f: CustomerFilters, range: { from?: string; to?: string }, page: number, pageSize = 25): string {
  const sp = customerFilterParams(f, range);
  const out = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  sp.forEach((v, k) => out.set(k, v));
  return out.toString();
}

export function customerExportQuery(f: CustomerFilters, range: { from?: string; to?: string }): string {
  return customerFilterParams(f, range).toString();
}

/** Who may export: the server needs an admin or super admin role (CAN_WRITE). */
export function canExport(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin';
}
