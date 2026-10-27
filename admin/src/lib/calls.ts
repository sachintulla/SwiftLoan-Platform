// Pure helpers for the Calls page: labels, the filter model and its query string,
// the stat strip, and the plain-English wording for job health and errors.
// No React and no fetching here, so every rule can be tested on its own.

/* ── why we called ─────────────────────────────────────────────────────────── */

/**
 * Every `callContext.reason` the server writes, in plain words, plus `campaign`
 * (a call that belongs to a campaign carries no reason). Keep this in step with
 * the reasons in server/src (grep "reason: '") and server/src/lib/callFilters.ts.
 */
export const PURPOSE_LABELS: Record<string, string> = {
  app_dropoff_followup: 'Stuck on a step',
  daily_status_update: 'Daily status update',
  website_lead_followup: 'Website enquiry',
  immediate_callback_optin: 'Immediate callback',
  upshot_journey: 'Journey trigger',
  manual_dashboard_call: 'Called by an admin',
  no_offers_followup: 'No offers found',
  campaign: 'Campaign',
};

/** Options for the "Why we called" select. The empty value means any. */
export const PURPOSE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any reason' },
  { value: 'app_dropoff_followup', label: PURPOSE_LABELS.app_dropoff_followup },
  { value: 'daily_status_update', label: PURPOSE_LABELS.daily_status_update },
  { value: 'website_lead_followup', label: PURPOSE_LABELS.website_lead_followup },
  { value: 'immediate_callback_optin', label: PURPOSE_LABELS.immediate_callback_optin },
  { value: 'upshot_journey', label: PURPOSE_LABELS.upshot_journey },
  { value: 'campaign', label: PURPOSE_LABELS.campaign },
  { value: 'manual_dashboard_call', label: PURPOSE_LABELS.manual_dashboard_call },
  { value: 'no_offers_followup', label: PURPOSE_LABELS.no_offers_followup },
];

/** A reason we have not seen before reads as words (never a raw code); nothing recorded reads as such. */
export function purposeLabel(p: string | null | undefined): string {
  if (!p || p === '(unknown)') return 'Not recorded';
  if (PURPOSE_LABELS[p]) return PURPOSE_LABELS[p];
  const words = p.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Not recorded';
}

/* ── outcome ───────────────────────────────────────────────────────────────── */

export const OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any outcome' },
  { value: 'interested', label: 'Interested' },
  { value: 'callback_requested', label: 'Callback requested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'do_not_call', label: 'Do not call' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'unreachable', label: 'Unreachable' },
  { value: 'installed_app', label: 'Installed the app' },
  { value: 'other', label: 'Other' },
];

/* ── result (call status) ──────────────────────────────────────────────────── */

const STATUS_WORDS: Record<string, string> = {
  queued: 'Queued',
  dialing: 'Ringing',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  no_answer: 'No answer',
  busy: 'Busy',
  cancelled: 'Cancelled',
};

export function statusWord(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return STATUS_WORDS[status] ?? status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

const NOT_FINISHED = new Set(['queued', 'dialing', 'in_progress']);

/** 'Answered', 'Not answered', or '' while the call is still going. */
export function answeredWord(status: string | null | undefined, answered: boolean | null | undefined): string {
  if (answered === true) return 'Answered';
  if (status && NOT_FINISHED.has(status)) return '';
  return 'Not answered';
}

/** Calls worth ringing again: failed, no answer or busy (never one that is still going or that connected). */
export function canCallAgain(status: string | null | undefined, answered: boolean | null | undefined): boolean {
  if (status === 'failed' || status === 'no_answer' || status === 'busy') return true;
  return status === 'cancelled' && answered !== true;
}

/* ── filters ───────────────────────────────────────────────────────────────── */

/**
 * What the status chips and the stat strip both set. One value rather than
 * several so a chip and a stat cell can never disagree.
 */
export type CallView = 'all' | 'answered' | 'no_answer' | 'busy' | 'failed' | 'in_progress' | 'not_answered' | 'follow_up';

export type CallRange = 'today' | '7d' | 'all' | 'custom';

export interface CallFilters {
  search: string;
  view: CallView;
  outcome: string;
  purpose: string;
  range: CallRange;
  /** YYYY-MM-DD, used when range is custom. */
  from: string;
  to: string;
}

export const DEFAULT_FILTERS: CallFilters = {
  search: '', view: 'all', outcome: '', purpose: '', range: 'all', from: '', to: '',
};

/** The six status chips. `not_answered` and `follow_up` are reached from the stat strip, not from chips. */
export const STATUS_CHIPS: { key: CallView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'answered', label: 'Answered' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'busy', label: 'Busy' },
  { key: 'failed', label: 'Failed' },
  { key: 'in_progress', label: 'In progress' },
];

export const RANGE_OPTIONS: { key: CallRange; label: string }[] = [
  { key: 'all', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'custom', label: 'Custom' },
];

const VIEW_PARAMS: Record<CallView, Record<string, string>> = {
  all: {},
  answered: { answered: '1' },
  no_answer: { status: 'no_answer' },
  busy: { status: 'busy' },
  failed: { status: 'failed' },
  in_progress: { status: 'dialing,in_progress' },
  not_answered: { status: 'no_answer,busy' },
  follow_up: { followUp: '1' },
};

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** Midnight today in India, as an instant. The server counts "today" the same way. */
export function istDayStart(now: Date): Date {
  const ist = now.getTime() + IST_OFFSET_MS;
  const midnight = ist - (((ist % 86_400_000) + 86_400_000) % 86_400_000);
  return new Date(midnight - IST_OFFSET_MS);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO instants for the chosen range. "Today" and "Last 7 days" have no end: they
 * run up to now, so a call placed while the page is open appears on the next
 * refresh, and the start is a whole India day so the request (and the cache key
 * built from it) stays the same all day. "Last 7 days" is today plus the six
 * days before it. An unfinished or reversed custom range gives no bounds
 * (callers show an error).
 */
export function rangeBounds(f: Pick<CallFilters, 'range' | 'from' | 'to'>, now: Date = new Date()): { from?: string; to?: string } {
  if (f.range === 'all') return {};
  if (f.range === 'today') return { from: istDayStart(now).toISOString() };
  if (f.range === '7d') return { from: new Date(istDayStart(now).getTime() - 6 * 86_400_000).toISOString() };
  const out: { from?: string; to?: string } = {};
  if (DATE_RE.test(f.from)) out.from = new Date(`${f.from}T00:00:00+05:30`).toISOString();
  if (DATE_RE.test(f.to)) out.to = new Date(`${f.to}T23:59:59.999+05:30`).toISOString();
  return out;
}

/** An error message when the custom range is back to front, else null. */
export function rangeError(f: Pick<CallFilters, 'range' | 'from' | 'to'>): string | null {
  if (f.range !== 'custom') return null;
  if (DATE_RE.test(f.from) && DATE_RE.test(f.to) && f.from > f.to) return '"From" must be on or before "To".';
  return null;
}

/**
 * The query string for the list and the export (no paging). Both use this one
 * function, so the file always follows what is on screen.
 */
export function callQuery(f: CallFilters, now: Date = new Date()): URLSearchParams {
  const qs = new URLSearchParams();
  const search = f.search.trim();
  if (search) qs.set('search', search);
  for (const [k, v] of Object.entries(VIEW_PARAMS[f.view])) qs.set(k, v);
  if (f.outcome) qs.set('outcome', f.outcome);
  if (f.purpose) qs.set('purpose', f.purpose);
  if (!rangeError(f)) {
    const b = rangeBounds(f, now);
    if (b.from) qs.set('from', b.from);
    if (b.to) qs.set('to', b.to);
  }
  return qs;
}

/** True when anything differs from the untouched page. */
export function hasActiveFilters(f: CallFilters): boolean {
  return Boolean(
    f.search.trim() || f.view !== 'all' || f.outcome || f.purpose ||
    f.range !== DEFAULT_FILTERS.range || f.from || f.to,
  );
}

const VIEW_WORDS: Record<CallView, string> = {
  all: '',
  answered: 'answered',
  no_answer: 'no answer',
  busy: 'busy',
  failed: 'failed',
  in_progress: 'in progress',
  not_answered: 'not answered (no answer or busy)',
  follow_up: 'needs a follow-up',
};

const RANGE_WORDS: Record<CallRange, string> = { today: 'today', '7d': 'the last 7 days', all: '', custom: '' };

/** "Showing answered, outcome Interested, search "98"." for the result line. */
export function filterSummary(f: CallFilters): string {
  const parts: string[] = [];
  if (f.view !== 'all') parts.push(VIEW_WORDS[f.view]);
  if (f.outcome) parts.push(`outcome ${OUTCOME_OPTIONS.find((o) => o.value === f.outcome)?.label ?? f.outcome}`);
  if (f.purpose) parts.push(`reason ${purposeLabel(f.purpose)}`);
  if (f.search.trim()) parts.push(`search "${f.search.trim()}"`);
  if (f.range === 'custom') {
    if (f.from || f.to) parts.push(`from ${f.from || 'the start'} to ${f.to || 'now'}`);
  } else if (RANGE_WORDS[f.range]) {
    parts.push(RANGE_WORDS[f.range]);
  }
  return parts.length ? `Showing ${parts.join(', ')}.` : 'Showing every call.';
}

/* ── stat strip ────────────────────────────────────────────────────────────── */

export interface OverviewSummary {
  placed: number;
  answered: number;
  answerRate: number;
  avgDurationSec: number | null;
  interested: number;
  callbacksDue: number;
  doNotCall: number;
  failed: number;
  notAnswered: number;
  needsFollowUp: number;
}

export interface StatCell {
  key: string;
  label: string;
  value: number;
  foot: string;
  tone?: 'red' | 'amber';
  /** What clicking the cell sets on the list below. */
  filter: Partial<CallFilters>;
}

/** The five cells, each with the filter it applies. A coloured number means something: red for failures, amber for follow-ups. */
export function statCells(s: OverviewSummary | null | undefined): StatCell[] {
  const x: OverviewSummary = s ?? {
    placed: 0, answered: 0, answerRate: 0, avgDurationSec: null, interested: 0, callbacksDue: 0,
    doNotCall: 0, failed: 0, notAnswered: 0, needsFollowUp: 0,
  };
  return [
    { key: 'placed', label: 'Calls today', value: x.placed, foot: 'placed by the voice agent', filter: { view: 'all', range: 'today' } },
    { key: 'answered', label: 'Answered', value: x.answered, foot: `${x.answerRate}% of calls today`, filter: { view: 'answered', range: 'today' } },
    { key: 'notAnswered', label: 'Not answered', value: x.notAnswered, foot: 'busy or no answer', filter: { view: 'not_answered', range: 'today' } },
    { key: 'failed', label: 'Failed', value: x.failed, foot: 'provider errors, nothing was dialled', tone: x.failed > 0 ? 'red' : undefined, filter: { view: 'failed', range: 'today' } },
    { key: 'followUp', label: 'Need a follow-up', value: x.needsFollowUp, foot: 'asked for a callback or sounded interested, not called since', tone: x.needsFollowUp > 0 ? 'amber' : undefined, filter: { view: 'follow_up', range: 'all' } },
  ];
}

/** Help text for the follow-up cell; the same definition as the server (lib/callFilters.ts followUpIds). */
export const FOLLOW_UP_HELP =
  'A call in the last 14 days where the customer asked for a callback or sounded interested, and nobody has called them since.';

/* ── dialler job health ────────────────────────────────────────────────────── */

export interface JobHeartbeat {
  name: string;
  everyMs: number;
  runs: number;
  lastRunAt: string | null;
  lastOkAt?: string | null;
  lastError: string | null;
  isCallJob: boolean;
  healthy: boolean;
}

const JOB_NAMES: Record<string, string> = {
  'status-call': 'Daily status calls',
  'step-stall': 'Calls to people stuck on a step',
  'stage-stall': 'Calls to people stuck on a stage',
  'lead-autocaller': 'Calls to website enquiries',
  'immediate-callback': 'Immediate callbacks',
  'call-reconcile': 'Clean-up of unfinished calls',
};

export function jobName(name: string): string {
  return JOB_NAMES[name] ?? name.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function everyLabel(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `Every ${m} min`;
  const h = Math.round(m / 60);
  return `Every ${h} hour${h === 1 ? '' : 's'}`;
}

/** Call jobs that have not run on time. Drives the red notice: nothing is shown while this is empty. */
export function overdueJobs(jobs: JobHeartbeat[] | null | undefined): JobHeartbeat[] {
  return (jobs ?? []).filter((j) => j.isCallJob && !j.healthy);
}

export function overdueMessage(jobs: JobHeartbeat[]): string {
  return `Automatic calls may have stopped. The scheduler has not run on time: ${jobs.map((j) => jobName(j.name)).join(', ')}. If the system just restarted, wait a minute and refresh.`;
}

/* ── calling again ─────────────────────────────────────────────────────────── */

/** Minimal shape of the client's ApiError, so this file needs no import from the fetch layer. */
export interface TriggerError { status: number; message: string; body?: unknown }

function codeOf(body: unknown): string | null {
  const data = (body as { data?: { code?: unknown } } | null | undefined)?.data;
  return typeof data?.code === 'string' ? data.code : null;
}

/** Words for a refused "Call again". The server's own message is used where it is already plain. */
export function triggerErrorMessage(e: TriggerError): string {
  const code = codeOf(e.body);
  if (code === 'do_not_contact') return 'This customer asked not to be contacted, so the call was not placed.';
  if (code === 'not_on_test_allowlist') return 'This number is not on the test allowlist, so the call was not placed.';
  if (e.status === 403) return 'Only a super admin can place calls.';
  return e.message || 'The call could not be placed.';
}

export const CALL_AGAIN_ROLE = 'super_admin';
export const EXPORT_ROLES = ['super_admin', 'admin'];

/* ── small display helpers ─────────────────────────────────────────────────── */

/** Bar width in percent, never below a visible sliver for a non-zero count. */
export function barPercent(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(3, Math.round((count / max) * 100));
}

/** "2026-10-27" to "27 Oct". */
export function shortDay(day: string): string {
  if (!DATE_RE.test(day)) return day;
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/** Average call length as a short phrase for the stat strip. */
export function avgLengthLabel(sec: number | null | undefined): string {
  if (sec == null) return 'no calls with a length yet';
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s on average` : `${sec}s on average`;
}
