/**
 * Shared status → {label, colour} mapping — mirrors mobile's STATUS_META
 * (status.tsx / loans.tsx). Used by both the applications list and the single
 * application's status detail page so the same underlying status (e.g.
 * "disbursed") never reads as "Active" in one place and a raw "disbursed" in
 * another.
 */
import { statusCopy } from '@/i18n/status';
import { useCopy } from '@/lib/i18n';

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'muted';

export const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'In progress', tone: 'warning' },
  pan_pending: { label: 'In progress', tone: 'warning' },
  prequalifying: { label: 'In progress', tone: 'warning' },
  offers_ready: { label: 'In progress', tone: 'warning' },
  handoff: { label: 'Applied', tone: 'info' },
  under_review: { label: 'Under review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  disbursed: { label: 'Active', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  closed: { label: 'Closed', tone: 'muted' },
};

export function statusMeta(status: string): { label: string; tone: StatusTone } {
  return STATUS_META[status] ?? { label: status.replace(/_/g, ' '), tone: 'muted' };
}

const STATUS_KEY: Record<string, keyof (typeof statusCopy)['en']> = {
  draft: 'inProgress',
  pan_pending: 'inProgress',
  prequalifying: 'inProgress',
  offers_ready: 'inProgress',
  handoff: 'applied',
  under_review: 'underReview',
  approved: 'approved',
  disbursed: 'active',
  rejected: 'rejected',
  failed: 'failed',
  closed: 'closed',
};

/**
 * Status → {label, tone} in the visitor's language. Pages use this; the plain `statusMeta()` above
 * stays English because the voice assistant is handed English labels (it speaks the visitor's language
 * itself).
 */
export function useStatusMeta(): (status: string) => { label: string; tone: StatusTone } {
  const t = useCopy(statusCopy);
  return (status: string) => {
    const base = statusMeta(status);
    const key = STATUS_KEY[status];
    return { tone: base.tone, label: key ? t[key] : base.label };
  };
}
