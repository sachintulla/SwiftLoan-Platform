// Formatting + status-colour helpers shared across the dashboard.
//
// Every amount in the system is in whole rupees: the API, the database and the screens all use the same number.
// One formatter for money (inr) and one compact form for stat tiles (inrCompact). There is no other unit.

export function inr(rupees: number | null | undefined): string {
  if (rupees == null) return '₹0';
  return '₹' + Math.round(rupees).toLocaleString('en-IN');
}

// Compact for stat tiles: ₹1.2L, ₹3.4Cr
export function inrCompact(rupees: number | null | undefined): string {
  if (rupees == null) return '₹0';
  const r = rupees;
  if (r >= 1e7) return '₹' + (r / 1e7).toFixed(2) + 'Cr';
  if (r >= 1e5) return '₹' + (r / 1e5).toFixed(2) + 'L';
  if (r >= 1e3) return '₹' + (r / 1e3).toFixed(1) + 'K';
  return '₹' + r.toFixed(0);
}

export function num(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-IN');
}

export function pct(n: number | null | undefined): string {
  return `${Math.round(n ?? 0)}%`;
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function dateStr(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Clock time, e.g. "3:07 PM" — for per-activity precision. */
export function timeStr(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Date + time, e.g. "22 Oct 2026, 3:07 PM" — for columns that must show both. */
export function dateTimeStr(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Day-group header: "Today" / "Yesterday" / "Mon, 24 Aug 2026". */
export function dayLabel(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// Status → colour token. Mirrors the palette defined in CLAUDE.md so the mobile app,
// server, and dashboard agree.
export type StatusTone = 'green' | 'blue' | 'amber' | 'red' | 'grey' | 'teal';

const STATUS_TONE: Record<string, StatusTone> = {
  // application / loan
  completed: 'green', approved: 'green', disbursed: 'green', paid: 'green', verified: 'green', closed: 'green',
  in_progress: 'blue', submitted: 'blue', active: 'blue', under_review: 'blue', prequalifying: 'blue', offers_ready: 'blue', started: 'blue',
  // campaigns / outbound calling
  running: 'blue', dialing: 'blue', calling: 'blue', called: 'blue',
  answered: 'green', queued: 'amber', no_answer: 'amber', busy: 'amber', retrying: 'amber',
  paused: 'amber', on_hold: 'amber', pending: 'amber', pan_pending: 'amber', handoff: 'amber', draft: 'amber', scheduled: 'amber', late: 'amber', contacted: 'amber',
  abandoned: 'red', rejected: 'red', failed: 'red', defaulted: 'red', lost: 'red',
  anonymous: 'grey', not_started: 'grey', new: 'grey', skipped: 'grey', cancelled: 'grey',
  converted: 'teal', qualified: 'teal',
  // support tickets (in_progress is blue above)
  open: 'amber', resolved: 'green',
  // message delivery (queued is amber and failed is red above)
  delivered: 'green', read: 'teal', sent: 'blue',
};

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'grey';
  return STATUS_TONE[status] ?? 'grey';
}

/**
 * Loan / lender application status → the DETAILED operational label, used
 * consistently across the whole admin (rows, badges, filters, detail pages) so
 * every surface reads the same stage of the funnel. Unlike the mobile app's My
 * Loans (which collapses everything pre-offer into "In Progress"), the admin
 * shows exactly where an application is. Used for both a parent application's
 * status and a per-lender offer status.
 */
export const LOAN_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pan_pending: 'PAN Pending',
  prequalifying: 'Prequalifying',
  offers_ready: 'Offers',
  handoff: 'Handoff',
  under_review: 'In Review',
  approved: 'Approved',
  disbursed: 'Disbursed',
  rejected: 'Rejected',
  failed: 'Failed',
  closed: 'Closed',
};

export function loanStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return LOAN_STATUS_LABEL[status] ?? humanStatus(status);
}

export function humanStatus(status: string | null | undefined): string {
  if (!status) return '—';
  // Defensive: every call site pulls `status` off a loosely-typed API
  // response (often cast with `as`, not runtime-validated), so a stray
  // boolean/number reaching here — as one already has, see
  // CampaignBuilder.tsx's agent status — must not crash the whole page.
  if (typeof status !== 'string') return String(status);
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
