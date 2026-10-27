// Pure helpers for the Loan Pipeline, Revasure and Yubi lists: query strings,
// the "Showing ..." wording, export and campaign limits, and a few labels.
// No React and no network, so they are unit tested directly.

/** Most rows one CSV export contains. Matches the server's cap. */
export const EXPORT_LIMIT = 10_000;
/** Most customers a campaign started from a list can take. Matches the server's cap. */
export const CAMPAIGN_CAP = 5_000;

/** Roles the server lets export and create campaigns (CAN_WRITE). The server decides; this only hides a button that would be refused. */
const WRITE_ROLES = ['super_admin', 'admin'];

/** True when the role may export or create a campaign. An unknown role (not loaded yet) is allowed; the server still enforces it. */
export function canWrite(role: string | null | undefined): boolean {
  if (!role) return true;
  return WRITE_ROLES.includes(role);
}

/** Query string (no leading "?") from a filter set. Empty and whitespace-only values are dropped; values are encoded. */
export function buildListQuery(filters: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) p.set(k, s);
  }
  return p.toString();
}

/** Same filters without the empty ones, for sending as a JSON body. */
export function cleanFilters(filters: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    const s = (v ?? '').trim();
    if (s) out[k] = s;
  }
  return out;
}

export interface FilterLabel {
  /** Word shown for the filter, for example "status". */
  name: string;
  /** Turns the raw value into words. Defaults to the value as it is. */
  value?: (v: string) => string;
}
export type FilterLabels = Record<string, FilterLabel>;

/**
 * The active filters in plain words, for example `status Rejected, search "98"`.
 * Only keys that have a label and a value are described, in the order of `labels`.
 * Returns an empty string when nothing is active.
 */
export function describeFilters(filters: Record<string, string | null | undefined>, labels: FilterLabels): string {
  const parts: string[] = [];
  for (const [key, def] of Object.entries(labels)) {
    const raw = (filters[key] ?? '').trim();
    if (!raw) continue;
    const text = def.value ? def.value(raw) : raw;
    parts.push(key === 'search' ? `${def.name} "${text}"` : `${def.name} ${text}`);
  }
  return parts.join(', ');
}

/** "134 applications. Showing status Rejected." / "1 lead." when nothing is filtered. */
export function resultLine(total: number, singular: string, plural: string, description: string): string {
  const n = total.toLocaleString('en-IN');
  const noun = total === 1 ? singular : plural;
  return description ? `${n} ${noun}. Showing ${description}.` : `${n} ${noun}.`;
}

/** An export holds at most EXPORT_LIMIT rows, so a bigger list needs a warning. */
export function shouldWarnTruncation(total: number | null | undefined): boolean {
  return typeof total === 'number' && total > EXPORT_LIMIT;
}

/** Why the Export CSV button is off, or null when it can be used. Shown as visible text, not only a tooltip. */
export function exportBlockedReason(role: string | null | undefined, total: number | null | undefined): string | null {
  if (!canWrite(role)) return 'Exports need an admin or super admin';
  if (total === 0) return 'No rows to export';
  return null;
}

/** Why Start campaign is off, or null when it can be used. */
export function campaignBlockedReason(role: string | null | undefined, total: number | null | undefined): string | null {
  if (!canWrite(role)) return 'Campaigns need an admin or super admin';
  if (total === 0) return 'No rows to start a campaign from';
  return null;
}

/** A date input value (YYYY-MM-DD) as the start or end of that local day, as an ISO instant. Empty or invalid gives ''. */
export function dayBoundIso(ymd: string, edge: 'start' | 'end'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const d = new Date(edge === 'start' ? `${ymd}T00:00:00` : `${ymd}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** A message when From is later than To, otherwise null. */
export function dateRangeProblem(from: string, to: string): string | null {
  if (from && to && from > to) return 'From is later than To. Choose an earlier From date or a later To date.';
  return null;
}

/** "27 Oct 2026" for a date input value or an ISO instant. */
export function dayLabel(v: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Yubi sends raw codes in capitals (OFFER_GENERATED). Shown as "Offer generated". */
export function yubiStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  const s = status.replace(/_/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Revasure status words. An unknown status is shown as it came. */
export const REVASURE_STATUS_LABEL: Record<string, string> = {
  success: 'Success',
  duplicate: 'Duplicate',
  ineligible: 'Ineligible',
  failed: 'Failed',
  pending: 'Pending',
};

/** Whether starting a campaign from these Revasure filters deserves the "already reached Revasure" warning. */
export function revasureReachedWarning(filters: Record<string, string>): boolean {
  return filters.status === 'success' || filters.status === 'duplicate';
}
