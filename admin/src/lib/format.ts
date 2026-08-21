// Formatting + status-colour helpers shared across the dashboard.
//
// CAREFUL — the API is not consistent about money units, so pick the right helper:
//
//   RUPEES: LoanApplication.amount, Offer.amount/emi, Loan.principal/outstanding,
//           Repayment.amount. The application create route validates amount as
//           `min(25_000).max(1_500_000)` — a ₹25k–₹15L personal loan, stored as
//           whole rupees. Use `inrR` / `inrCompactR`.
//   PAISE:  fields explicitly suffixed `*Paise`. Use `inr` / `inrCompact`.
//
// Passing a rupee value to `inr` divides it by 100 and understates it 100×.

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

// Rupee-denominated twins of the two helpers above.
export function inrR(rupees: number | null | undefined): string {
  if (rupees == null) return '₹0';
  return '₹' + rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function inrCompactR(rupees: number | null | undefined): string {
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

// "3d", "4h", "12m" — a compact age for dense table cells, where `timeAgo`'s
// trailing " ago" is repeated noise down a column.
export function ageShort(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  // Clamped at zero: this renders an *age*, so a clock skew or a future timestamp
  // should read "0s", never "-42s".
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function pct(n: number | null | undefined): string {
  return `${Math.round(n ?? 0)}%`;
}

/**
 * Relative time, in either direction.
 *
 * This assumed the timestamp was always in the past, so a future one produced a
 * negative count: the campaign page rendered a scheduled calling window as
 * "Next window opens 18 Aug 2026, 09:00 IST (-22800s ago)". Future instants now read
 * "in 6h".
 */
export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 0) {
    const a = Math.abs(diff);
    if (a < 60) return 'in a moment';
    if (a < 3600) return `in ${Math.floor(a / 60)}m`;
    if (a < 86400) return `in ${Math.floor(a / 3600)}h`;
    return `in ${Math.floor(a / 86400)}d`;
  }
  const s = diff;
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

export function humanStatus(status: string | null | undefined): string {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
