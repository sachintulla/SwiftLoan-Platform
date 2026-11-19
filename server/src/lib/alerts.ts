/**
 * Admin "Alerts": everything we sent to a customer (WhatsApp, SMS, push, call) as ONE short list. Pure rules (no
 * database, no network); tested in alerts.test.ts. The database side is alertsDb.ts.
 *
 * One row = one thing sent: when, what kind, a plain name, how it ended, and the error if it failed. Nothing else.
 *
 * How it ended (`outcome`), the same five words for every type:
 *   success       delivered / read (message), answered (call)
 *   sent          the provider accepted it and has not told us more. This is NOT "delivered": Vox sends no delivery
 *                 report for SMS and, so far, none for WhatsApp, so most messages stay here.
 *   not_answered  a call that rang out (also one the provider never reported on: it sends nothing for an unanswered call)
 *   failed        refused or errored; the row carries the reason
 *   pending       a call still being placed
 */

export const ALERT_TYPES = ['whatsapp', 'sms', 'push', 'call'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_OUTCOMES = ['success', 'sent', 'not_answered', 'failed', 'pending'] as const;
export type AlertOutcome = (typeof ALERT_OUTCOMES)[number];

export const ALERT_TYPE_LABEL: Record<AlertType, string> = { whatsapp: 'WhatsApp', sms: 'SMS', push: 'Push', call: 'Call' };

export function isAlertType(v: unknown): v is AlertType {
  return typeof v === 'string' && (ALERT_TYPES as readonly string[]).includes(v);
}
export function isAlertOutcome(v: unknown): v is AlertOutcome {
  return typeof v === 'string' && (ALERT_OUTCOMES as readonly string[]).includes(v);
}

/** The word on the status pill. A call that connected reads "Answered"; everything else that worked reads "Success". */
export function outcomeLabel(type: AlertType, outcome: AlertOutcome): string {
  switch (outcome) {
    case 'success': return type === 'call' ? 'Answered' : 'Success';
    case 'sent': return 'Sent';
    case 'not_answered': return 'Not answered';
    case 'failed': return 'Failed';
    case 'pending': return 'Waiting';
  }
}

/** The status filter's choices, in the order shown. */
export const ALERT_STATUS_OPTIONS: ReadonlyArray<{ key: AlertOutcome; label: string }> = [
  { key: 'success', label: 'Success' },
  { key: 'sent', label: 'Sent' },
  { key: 'not_answered', label: 'Not answered' },
  { key: 'failed', label: 'Failed' },
  { key: 'pending', label: 'Waiting' },
];

/* ───────────────────────────── the alert's plain name ───────────────────────────── */

/** WhatsApp templates and DLT SMS template ids → what the message is about. */
const TEMPLATE_NAME: Record<string, string> = {
  // "you stopped at <step>"
  continue_application_app: 'Continue application',
  continue_application_link: 'Continue application',
  dropoff_continue_app: 'Continue application',
  install_app_resume_step: 'Continue application',
  '1277179300146510723': 'Continue application', // LINK_SMS
  '1277179266527595706': 'Verify your PAN', // PAN_PENDING_SMS
  // offers
  offers_ready: 'Offers ready',
  offers_ready_open_app: 'Offers ready',
  offers_ready_view_link: 'Offers ready',
  dropoff_apply_offers_app: 'Offers ready',
  no_offers_call: 'No offers',
  dropoff_no_offers_callback: 'No offers',
  no_offers_missed_call: 'Missed call note',
  // others
  welcome_continue_app: 'Welcome',
  loan_applied_install_app: 'You applied',
  loan_application_submitted: 'You applied',
};

/** What sent it, when the template says nothing we know. */
const KIND_NAME: Record<string, string> = {
  app_dropoff: 'Continue application',
  install_reminder: 'Continue application',
  sms_fallback: 'Continue application',
  offers_notice_no_offers: 'No offers',
  welcome: 'Welcome',
  welcome_sms: 'Welcome',
  applied_nudge: 'You applied',
  agent_link: 'App link',
  missed_call_note: 'Missed call note',
  stall: 'Stuck-step reminder',
  admin: 'Sent by admin',
  test: 'Test message',
};

const CALL_NAME: Record<string, string> = {
  no_offers_followup: 'No offers call',
  app_dropoff_followup: 'Why did you stop?',
  inactive_followup: 'Follow-up call',
  manual_dashboard_call: 'Call by admin',
  immediate_callback_optin: 'Enquiry call',
  lead_followup: 'Enquiry call',
  campaign: 'Campaign call',
  status_update: 'Status call',
};

const PUSH_NAME: Record<string, string> = {
  swiftloan_journey_nudge: 'Journey reminder',
  swiftloan_eligibility_incomplete: 'Continue application',
};

/** `some_code-name` → "Some code name". */
export function humanise(code: string): string {
  const s = code.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

export interface AlertNameInput {
  /** WhatsApp template name or DLT SMS template id (messages); the Upshot event name (push). */
  template?: string | null;
  /** What sent it: MessageDelivery.kind. */
  kind?: string | null;
  /** The call's purpose: callContext.reason. */
  reason?: string | null;
}

/** A short, plain name for the row ("Continue application", "No offers call"), never a raw code when we know it. */
export function alertName(type: AlertType, i: AlertNameInput): string {
  const template = (i.template ?? '').trim();
  const kind = (i.kind ?? '').trim();
  const reason = (i.reason ?? '').trim();
  if (type === 'call') return CALL_NAME[reason] ?? (reason ? humanise(reason) : 'Call');
  if (type === 'push') return PUSH_NAME[template] ?? (template ? humanise(template.replace(/^swiftloan_/, '')) : 'Push');
  // A message sent by hand or as a test says so first; otherwise the template is the best description.
  if (kind === 'admin' || kind === 'test') return TEMPLATE_NAME[template] ? `${TEMPLATE_NAME[template]} (${kind === 'admin' ? 'by admin' : 'test'})` : KIND_NAME[kind];
  if (TEMPLATE_NAME[template]) return TEMPLATE_NAME[template];
  if (KIND_NAME[kind]) return KIND_NAME[kind];
  // An unknown template: its own name is clearer than nothing, but an all-digit DLT id says nothing.
  if (template && !/^\d+$/.test(template)) return humanise(template);
  return kind ? humanise(kind) : 'Message';
}

/* ───────────────────────────── the error text ───────────────────────────── */

const ERROR_MAX = 160;

/**
 * The reason a row failed, as one short line. Providers answer with anything (an HTML error page, a bare status code),
 * so tags are dropped and the text is cut; an empty or success row gets null.
 */
export function alertError(outcome: AlertOutcome, raw: string | null | undefined): string | null {
  if (outcome !== 'failed') return null;
  let s = (raw ?? '').trim();
  if (!s) return 'No reason was recorded';
  if (/<[a-z!/][^>]*>/i.test(s)) {
    const title = s.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    s = (title ?? s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  }
  if (/^\d{3}$/.test(s)) s = `Provider error ${s}`;
  if (/^fetch failed$/i.test(s)) s = 'Could not reach the provider';
  return s.length > ERROR_MAX ? `${s.slice(0, ERROR_MAX - 1).trimEnd()}…` : s;
}

/* ───────────────────────────── the call's summary ───────────────────────────── */

/**
 * The call's summary as plain words. The voice provider often stores a whole JSON report in the summary column
 * (disconnect cause, call id, …) with the real summary inside it as `summary`; that inner text is what a person reads.
 * A JSON report with no summary in it gives null rather than a screen of braces.
 */
export function callSummaryText(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (!/^[{[]/.test(s)) return s;
  try {
    const parsed = JSON.parse(s) as unknown;
    const inner = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>).summary : null;
    return typeof inner === 'string' && inner.trim() ? inner.trim() : null;
  } catch {
    // Cut-off or malformed JSON: still try to lift the summary out, else show nothing.
    const m = s.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) return null;
    try { return (JSON.parse(`"${m[1]}"`) as string).trim() || null; } catch { return null; }
  }
}

/* ───────────────────────────── filters ───────────────────────────── */

export interface AlertFilters {
  type: AlertType | null;
  outcome: AlertOutcome | null;
  from: Date | null;
  to: Date | null;
  /** Digits to match against the mobile number (3 or more), or null. */
  phone: string | null;
  /** Text to match against the customer's name, or null. */
  name: string | null;
  customerId: string | null;
}

function asDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Read the list's query string. Anything not understood is ignored, never an error. */
export function parseAlertFilters(q: Record<string, unknown>): AlertFilters {
  const search = typeof q.search === 'string' ? q.search.trim().slice(0, 80) : '';
  const digits = search.replace(/\D/g, '');
  // A search that is mostly digits is a mobile number; anything else is a name.
  const isPhone = digits.length >= 3 && digits.length >= search.replace(/\s/g, '').length - 2;
  const customerId = typeof q.customerId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(q.customerId) ? q.customerId : null;
  return {
    type: isAlertType(q.type) ? q.type : null,
    outcome: isAlertOutcome(q.status) ? q.status : null,
    from: asDate(q.from),
    to: asDate(q.to),
    phone: search && isPhone ? digits.slice(-10) : null,
    name: search && !isPhone ? search : null,
    customerId,
  };
}

/* ───────────────────────────── counts ───────────────────────────── */

export type AlertCounts = Record<AlertType, Record<AlertOutcome, number> & { total: number }>;

export function emptyCounts(): AlertCounts {
  const one = () => ({ total: 0, success: 0, sent: 0, not_answered: 0, failed: 0, pending: 0 });
  return { whatsapp: one(), sms: one(), push: one(), call: one() };
}

/** Fold `type × outcome → n` rows into the tiles' numbers. Unknown types or outcomes are ignored. */
export function foldCounts(rows: Array<{ type: string; outcome: string; n: number | bigint }>): AlertCounts {
  const out = emptyCounts();
  for (const r of rows) {
    if (!isAlertType(r.type) || !isAlertOutcome(r.outcome)) continue;
    const n = Number(r.n) || 0;
    out[r.type][r.outcome] += n;
    out[r.type].total += n;
  }
  return out;
}
