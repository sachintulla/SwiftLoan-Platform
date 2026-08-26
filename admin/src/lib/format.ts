// Formatting + status-colour helpers shared across the dashboard.
// Amounts from the API are in PAISE (existing server convention).

export function inr(paise: number | null | undefined): string {
  if (paise == null) return '₹0';
  const rupees = paise / 100;
  return '₹' + rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// Compact for stat tiles: ₹1.2L, ₹3.4Cr
export function inrCompact(paise: number | null | undefined): string {
  if (paise == null) return '₹0';
  const r = paise / 100;
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
  anonymous: 'grey', not_started: 'grey', new: 'grey', skipped: 'grey',
  converted: 'teal', qualified: 'teal',
};

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'grey';
  return STATUS_TONE[status] ?? 'grey';
}

/**
 * Loan / lender application status → the EXACT label the customer sees in the
 * mobile app's My Loans (src/screens/loans.tsx STATUS_META). Kept in sync so a
 * status an ops user reads in the admin matches what the customer was shown —
 * e.g. `disbursed` reads "Active", and every pre-offer state reads "In Progress".
 * Used for both a parent application's status and a per-lender offer status.
 */
export const LOAN_STATUS_LABEL: Record<string, string> = {
  draft: 'In Progress',
  pan_pending: 'In Progress',
  prequalifying: 'In Progress',
  offers_ready: 'In Progress',
  handoff: 'In Progress',
  under_review: 'Under Review',
  approved: 'Approved',
  disbursed: 'Active',
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
