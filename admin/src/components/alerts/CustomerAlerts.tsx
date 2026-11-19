'use client';
// The customer page's Alerts tab: everything we sent to this one customer, with the four send buttons beside the
// counts. It replaces the "Recent messages" list and the reach-out block that used to sit under Milestones.
import React, { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, Pagination, TableSkeleton } from '@/components/ui';
import SendActions from '@/components/SendActions';
import { AlertDetailModal, AlertsTable } from '@/components/alerts/AlertsTable';
import {
  ALERT_TYPES, DEFAULT_ALERT_FILTERS, alertListQuery, alertSummaryQuery, totalCounts,
  type AlertCounts, type AlertFilters, type AlertRow, type AlertType,
} from '@/lib/alerts';

/** The counts for one customer, for all time. The tab and the page's "Alerts sent" tile read the same request. */
export function useCustomerAlertCounts(customerId: string | null | undefined) {
  const q = customerId ? alertSummaryQuery({ ...DEFAULT_ALERT_FILTERS, period: 'all' }, { customerId }) : null;
  const res = useSWR(q ? `/api/admin/alerts/summary?${q}` : null, swrFetcher, { revalidateOnFocus: false });
  return { counts: (res.data?.data as { counts?: AlertCounts } | undefined)?.counts, mutate: res.mutate };
}

export default function CustomerAlerts({ customerId, customerName, stage, onSent }: {
  customerId: string;
  customerName?: string | null;
  /** The customer's journey stage: what the send buttons send about. */
  stage?: string | null;
  /** Called after something was sent from here, so the page can refresh. */
  onSent?: () => void;
}) {
  const [type, setType] = useState<AlertType | ''>('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AlertRow | null>(null);
  const filters: AlertFilters = { ...DEFAULT_ALERT_FILTERS, period: 'all', type };
  const list = useSWR(`/api/admin/alerts?${alertListQuery(filters, { customerId }, page)}`, swrFetcher);
  const { counts, mutate: refreshCounts } = useCustomerAlertCounts(customerId);
  const rows = (Array.isArray(list.data?.data) ? list.data.data : []) as AlertRow[];
  const pg = list.data?.pagination;
  const all = totalCounts(counts);
  const pick = (t: AlertType | '') => { setType(t); setPage(1); };

  return (
    <Card>
      <div className="row between wrap" style={{ gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="row wrap" role="group" aria-label="Filter by type" style={{ gap: 8 }}>
          <button type="button" className={`chip-filter ${type === '' ? 'active' : ''}`} aria-pressed={type === ''} onClick={() => pick('')}>
            All {counts ? all.total : ''}
          </button>
          {ALERT_TYPES.map((t) => (
            <button key={t.key} type="button" className={`chip-filter ${type === t.key ? 'active' : ''}`} aria-pressed={type === t.key} onClick={() => pick(t.key)}>
              {t.plural} {counts ? counts[t.key]?.total ?? 0 : ''}
            </button>
          ))}
        </div>
        <SendActions
          variant="bar"
          customerId={customerId}
          customerName={customerName}
          stage={stage}
          onDone={() => { void list.mutate(); void refreshCounts(); onSent?.(); }}
        />
      </div>

      {list.error ? (
        <div className="empty">Could not load alerts. {(list.error as Error).message}
          <div><button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => { void list.mutate(); }}>Retry</button></div>
        </div>
      ) : list.isLoading ? <TableSkeleton rows={5} cols={5} /> : rows.length === 0 ? (
        <div className="empty-state">
          <h3>{type ? 'Nothing of this type was sent' : 'Nothing has been sent to this customer'}</h3>
        </div>
      ) : (
        <AlertsTable rows={rows} showCustomer={false} onOpen={setOpen} />
      )}

      {pg && pg.totalPages > 1 && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      {open && <AlertDetailModal row={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}
