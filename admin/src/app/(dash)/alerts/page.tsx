'use client';
// Alerts: everything sent to customers (WhatsApp, SMS, push, calls) as one short list. It replaces the separate
// Messages and Calls pages. A row says when (exact time), what, how it ended and, if it failed, why; clicking it
// opens the message text or the call's recording and transcript.
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, FilterChips, Pagination, SearchBox, Select, TableSkeleton } from '@/components/ui';
import { num } from '@/lib/format';
import { PERIODS, computeRange } from '@/lib/period';
import { AlertDetailModal, AlertsTable } from '@/components/alerts/AlertsTable';
import {
  ALERT_STATUSES, ALERT_TYPES, DEFAULT_ALERT_FILTERS, alertListQuery, alertSummaryQuery, countsLine,
  parseAlertFilters, serialiseAlertFilters, type AlertCounts, type AlertFilters, type AlertRow, type AlertType,
} from '@/lib/alerts';

// useSearchParams needs a Suspense boundary or a production build fails on this page.
export default function AlertsPage() {
  return (
    <Suspense fallback={<div className="page"><div className="skeleton" style={{ height: 58 }} /></div>}>
      <Alerts />
    </Suspense>
  );
}

function Alerts() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<AlertFilters>(() => parseAlertFilters(searchParams));
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AlertRow | null>(null);
  const change = (patch: Partial<AlertFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  useEffect(() => {
    const q = serialiseAlertFilters(filters);
    window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
  }, [filters]);

  const range = useMemo(() => computeRange(filters.period, filters.from, filters.to), [filters.period, filters.from, filters.to]);
  const scope = useMemo(() => ({ range }), [range]);
  const list = useSWR(`/api/admin/alerts?${alertListQuery(filters, scope, page)}`, swrFetcher, { refreshInterval: 30_000 });
  const summaryQuery = alertSummaryQuery(filters, scope);
  const summary = useSWR(`/api/admin/alerts/summary${summaryQuery ? `?${summaryQuery}` : ''}`, swrFetcher, { refreshInterval: 30_000 });

  const rows = (Array.isArray(list.data?.data) ? list.data.data : []) as AlertRow[];
  const pg = list.data?.pagination;
  const sum = summary.data?.data as { counts?: AlertCounts; pushEnabled?: boolean } | undefined;
  const counts = sum?.counts;
  const pushEnabled = sum?.pushEnabled;
  const filtered = serialiseAlertFilters(filters) !== serialiseAlertFilters({ ...DEFAULT_ALERT_FILTERS, period: filters.period, from: filters.from, to: filters.to });

  return (
    <div className="page">
      <h1 className="page-title">Alerts</h1>

      {/* One tile per type. The numbers follow the dates and the search; clicking a tile filters the list to that type. */}
      <div className="row wrap" style={{ gap: 12, margin: '14px 0 16px' }}>
        {ALERT_TYPES.map((t) => {
          const c = counts?.[t.key];
          const off = t.key === 'push' && pushEnabled === false && !c?.total;
          const active = filters.type === t.key;
          return (
            <button
              key={t.key}
              type="button"
              className="card"
              aria-pressed={active}
              onClick={() => change({ type: active ? '' : (t.key as AlertType) })}
              style={{
                flex: '1 1 190px', minWidth: 0, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                borderColor: active ? 'var(--brand)' : undefined, boxShadow: active ? '0 0 0 1px var(--brand)' : undefined,
              }}
            >
              <div className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{t.plural}</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>{c ? num(c.total) : '—'}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2, minHeight: 18 }}>
                {off ? 'Switched off' : c ? countsLine(t.key, c) || 'None' : ''}
              </div>
            </button>
          );
        })}
      </div>

      <Card>
        <div style={{ marginBottom: 12 }}>
          <FilterChips options={PERIODS} value={filters.period} onChange={(v) => change({ period: v })} />
          {filters.period === 'custom' && (
            <div className="row wrap" style={{ gap: 12, marginTop: 10, alignItems: 'center' }}>
              <label className="muted" style={{ fontSize: 13 }}>From&nbsp;
                <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => change({ from: e.target.value })} className="input" />
              </label>
              <label className="muted" style={{ fontSize: 13 }}>To&nbsp;
                <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => change({ to: e.target.value })} className="input" />
              </label>
            </div>
          )}
        </div>

        <div className="toolbar">
          <div className="toolbar-search">
            <SearchBox value={filters.search} onChange={(v) => change({ search: v })} placeholder="Mobile number or name" />
          </div>
          <div style={{ width: 160 }}>
            <Select
              value={filters.type}
              onChange={(v) => change({ type: v as AlertFilters['type'] })}
              options={[{ value: '', label: 'All types' }, ...ALERT_TYPES.map((t) => ({ value: t.key, label: t.label }))]}
            />
          </div>
          <div style={{ width: 170 }}>
            <Select
              value={filters.status}
              onChange={(v) => change({ status: v as AlertFilters['status'] })}
              options={[{ value: '', label: 'All statuses' }, ...ALERT_STATUSES.map((s) => ({ value: s.key, label: s.label }))]}
            />
          </div>
          {filtered && <button type="button" className="btn" onClick={() => change({ type: '', status: '', search: '' })}>Clear</button>}
        </div>

        {list.error ? (
          <div className="empty">Could not load alerts. {(list.error as Error).message}
            <div><button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => { void list.mutate(); }}>Retry</button></div>
          </div>
        ) : list.isLoading ? <TableSkeleton rows={8} cols={6} /> : rows.length === 0 ? (
          <div className="empty-state">
            <h3>No alerts match</h3>
            <p>Nothing was sent in this period with these filters.</p>
          </div>
        ) : (
          <AlertsTable rows={rows} showCustomer onOpen={setOpen} />
        )}

        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>

      {open && <AlertDetailModal row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
