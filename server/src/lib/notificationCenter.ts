/**
 * Pure rules for the admin Notifications page: labels, drill-down targets,
 * query filters and date grouping. No database, so they can be unit tested.
 *
 * Only three notification types are ever created in code (verified in
 * jobs/tracking.jobs.ts and lib/appNudge.ts):
 *   loan_stale        entityId = LoanApplication id
 *   onboarding_stale  entityId = User id
 *   app_nudge         entityId = User id
 * Anything else that appears in the table falls back to a title-cased label.
 */

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  loan_stale: 'Inactive loan',
  onboarding_stale: 'Stuck onboarding',
  app_nudge: 'User needs help',
};

export const SEVERITIES = ['critical', 'warning', 'info', 'success'] as const;
export type Severity = (typeof SEVERITIES)[number];

const SEVERITY_LABELS: Record<Severity, string> = { critical: 'Critical', warning: 'Warning', info: 'Info', success: 'Done' };

/** "new_lead" -> "New Lead". Used for a type nothing here knows about. */
function titleCase(raw: string): string {
  const words = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return 'Notification';
  return words.replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

export function typeLabel(type: string | null | undefined): string {
  if (!type) return 'Notification';
  return NOTIFICATION_TYPE_LABELS[type] ?? titleCase(type);
}

export function severityLabel(severity: string | null | undefined): string {
  if (severity && severity in SEVERITY_LABELS) return SEVERITY_LABELS[severity as Severity];
  return severity ? titleCase(severity) : 'Info';
}

export const isSeverity = (v: unknown): v is Severity => typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);

/** Critical and warning are the ones that need a person to look. */
export const needsAttention = (severity: string): boolean => severity === 'critical' || severity === 'warning';

/* ───────────────────────────── drill-down ───────────────────────────── */

export interface ResolvedEntity {
  /** A LoanApplication that exists for this entityId. */
  loan?: { id: string } | null;
  /** The Customer linked to the User this entityId names. */
  customer?: { id: string } | null;
}

export interface NotificationTarget { kind: 'loan' | 'customer'; id: string; href: string; label: string }

/**
 * Where "Open" should go. Null when the type has no destination, the row has
 * no entityId, or the entity no longer resolves (a deleted loan, a user with no
 * customer record): such a row simply has no Open link.
 */
export function targetFor(type: string, entityId: string | null | undefined, resolved: ResolvedEntity | null | undefined): NotificationTarget | null {
  if (!entityId || !resolved) return null;
  if (type === 'loan_stale') {
    return resolved.loan?.id ? { kind: 'loan', id: resolved.loan.id, href: `/loans/${resolved.loan.id}`, label: 'Open loan' } : null;
  }
  if (type === 'onboarding_stale' || type === 'app_nudge') {
    return resolved.customer?.id ? { kind: 'customer', id: resolved.customer.id, href: `/customers/${resolved.customer.id}`, label: 'Open customer' } : null;
  }
  return null;
}

/** Which table each type's entityId points at, so the route can batch its lookups. */
export function entityKind(type: string): 'loan' | 'user' | null {
  if (type === 'loan_stale') return 'loan';
  if (type === 'onboarding_stale' || type === 'app_nudge') return 'user';
  return null;
}

/* ───────────────────────────── filters ───────────────────────────── */

export interface NotificationQuery {
  state?: string | null;
  type?: string | null;
  severity?: string | null;
}

export interface NotificationWhere {
  read?: boolean;
  type?: string;
  severity?: Severity;
}

const TYPE_RE = /^[a-z0-9_-]{1,64}$/i;

/**
 * Prisma `where` for the list. `state` is "unread" or "all"; anything else
 * means all. A type or severity that is malformed or unknown is ignored rather
 * than turned into a query, so a bad URL shows everything instead of an error.
 */
export function buildNotificationWhere(q: NotificationQuery): NotificationWhere {
  const where: NotificationWhere = {};
  if (q.state === 'unread') where.read = false;
  if (q.type && TYPE_RE.test(q.type)) where.type = q.type;
  if (isSeverity(q.severity)) where.severity = q.severity;
  return where;
}

/**
 * A bulk "mark as read" must never widen. buildNotificationWhere quietly ignores a type or
 * severity it does not recognise, which for a bulk clear would mean "everything". So a filter
 * value that is present but invalid is rejected up front. Returns the message, or null when fine.
 */
export function invalidBulkFilter(filter: { type?: string | null; severity?: string | null } | null | undefined): string | null {
  if (!filter) return null;
  if (filter.type != null && filter.type !== '' && !TYPE_RE.test(filter.type)) return 'That notification type is not valid. Nothing was marked as read.';
  if (filter.severity != null && filter.severity !== '' && !isSeverity(filter.severity)) return 'That severity is not valid. Nothing was marked as read.';
  return null;
}

/** The unread rows a bulk "mark these as read" covers: the filter, forced to unread only. */
export function buildBulkReadWhere(filter: { type?: string | null; severity?: string | null }): NotificationWhere {
  return { ...buildNotificationWhere({ type: filter.type, severity: filter.severity }), read: false };
}

/* ───────────────────────────── date groups ───────────────────────────── */

const IST_OFFSET_MS = 330 * 60_000;

/** The calendar day in India (IST, UTC+5:30, no daylight saving) as a UTC-midnight timestamp. */
function istDay(d: Date): number {
  const t = d.getTime() + IST_OFFSET_MS;
  return Math.floor(t / 86_400_000) * 86_400_000;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DayGroup { key: string; label: string }

/**
 * The heading a notification sits under. Days are India days, so a notification
 * at 00:10 IST is "Today" for the admin even though it is still yesterday in UTC.
 * Today, Yesterday, then two to six days ago as "Earlier this week", then the date.
 */
export function dayGroup(date: Date | string, now: Date = new Date()): DayGroup {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return { key: 'unknown', label: 'Unknown date' };
  const diff = Math.round((istDay(now) - istDay(d)) / 86_400_000);
  if (diff <= 0) return { key: 'today', label: 'Today' };
  if (diff === 1) return { key: 'yesterday', label: 'Yesterday' };
  if (diff <= 6) return { key: 'week', label: 'Earlier this week' };
  const ist = new Date(istDay(d));
  return {
    key: ist.toISOString().slice(0, 10),
    label: `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`,
  };
}
