'use client';
// One lender's list on the Applications page: search, dates, Export CSV, status chips with counts, the table and the
// page buttons. Same layout for Aurix, Yubi and Revasure; what differs lives in lenders.tsx.
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, getAdmin } from '@/lib/api';
import { Card, Pagination, TableSkeleton } from '@/components/ui';
import ListActions, { ListError, ListEmpty } from '@/components/ListActions';
import RevasureMisUpload from '@/components/RevasureMisUpload';
import { num } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { buildListQuery, dayBoundIso, dateRangeProblem } from '@/lib/lists';
import {
  AURIX_CHIPS, REVASURE_CHIPS, AurixRowView, YubiRowView, RevasureRowView, yubiChipLabel,
  type LenderKey, type ChipDef, type Summary, type AurixRow, type YubiRow, type RevasureRow,
} from './lenders';

const SETUP: Record<LenderKey, { endpoint: string; kind: 'loans' | 'yubi' | 'revasure'; search: string; noun: string; lenderHead: string; everything: boolean }> = {
  // `everything`: with no status chip picked, ask for every status (the list's own default hides failures), so the
  // "All" count and the rows agree.
  aurix: { endpoint: '/api/admin/loans', kind: 'loans', search: 'Search name, mobile or reference (SL-…)', noun: 'applications', lenderHead: 'Lender', everything: true },
  yubi: { endpoint: '/api/admin/yubi', kind: 'yubi', search: 'Search name or mobile', noun: 'customers', lenderHead: 'Lender', everything: false },
  revasure: { endpoint: '/api/admin/revasure', kind: 'revasure', search: 'Search name, mobile or Revasure lead ID', noun: 'leads', lenderHead: 'Loan status (from sheet)', everything: true },
};

export default function LenderList({ lender }: { lender: LenderKey }) {
  const setup = SETUP[lender];
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [role, setRole] = useState<string | undefined>(undefined);
  useEffect(() => { setRole(getAdmin()?.role || undefined); }, []);

  const debounced = useDebounced(search.trim(), 350);
  const rangeProblem = dateRangeProblem(fromDay, toDay);

  // Search and dates, shared by the list, the chip counts and the export.
  const base = useMemo<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (debounced) f.search = debounced;
    const from = dayBoundIso(fromDay, 'start');
    const to = dayBoundIso(toDay, 'end');
    if (from) f.from = from;
    if (to) f.to = to;
    return f;
  }, [debounced, fromDay, toDay]);
  const filters = useMemo<Record<string, string>>(() => {
    const f = { ...base };
    if (status) f.status = status;
    else if (setup.everything) f.allStatuses = '1';
    return f;
  }, [base, status, setup.everything]);

  const { data, error, isLoading, mutate } = useSWR(`${setup.endpoint}?${buildListQuery({ ...filters, page, pageSize: 20 })}`, swrFetcher, { keepPreviousData: true });
  const { data: sumRes } = useSWR(`/api/admin/applications/summary?${buildListQuery(base)}`, swrFetcher, { keepPreviousData: true });
  const summary = (sumRes?.data as Record<LenderKey, Summary> | undefined)?.[lender];
  const pg = data?.pagination;
  // Aurix's list answers with the rows themselves; Yubi's and Revasure's with { rows, byStatus }.
  const payload = data?.data as unknown[] | { rows?: unknown[] } | undefined;
  const rows: unknown[] = Array.isArray(payload) ? payload : (payload?.rows ?? []);

  // Yubi's chips are whatever statuses Yubi has actually sent; the other two have a fixed list.
  const chips: ChipDef[] = lender === 'aurix' ? AURIX_CHIPS : lender === 'revasure' ? REVASURE_CHIPS : [
    { key: '', label: 'All' },
    ...Object.keys(summary?.counts ?? {}).sort((a, b) => (summary!.counts[b] - summary!.counts[a])).map((k) => ({ key: k, label: yubiChipLabel(k) })),
  ];
  const countOf = (key: string) => (key ? summary?.counts[key] ?? 0 : summary?.total ?? 0);

  const filtered = Boolean(status || search.trim() || fromDay || toDay);
  const reset = () => { setStatus(''); setSearch(''); setFromDay(''); setToDay(''); setPage(1); setOpen(null); };
  const set = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); setOpen(null); };
  const canUpload = role === 'super_admin' || role === 'admin';

  return (
    <>
      {lender === 'revasure' && showUpload && canUpload && <RevasureMisUpload onApplied={() => mutate()} />}
      <Card className="ap-card">
        <div className="ap-bar">
          <input type="search" className="input ap-search" value={search} placeholder={setup.search} aria-label={setup.search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); setOpen(null); }} />
          <input type="date" className="input ap-dateinput" value={fromDay} max={toDay || undefined} aria-label="From" title="From" onChange={(e) => set(setFromDay)(e.target.value)} />
          <input type="date" className="input ap-dateinput" value={toDay} min={fromDay || undefined} aria-label="To" title="To" onChange={(e) => set(setToDay)(e.target.value)} />
          {filtered && <button type="button" className="adm-link-btn" onClick={reset}>Clear</button>}
          <div className="ap-actions">
            {lender === 'revasure' && canUpload && (
              <button type="button" className="btn" aria-expanded={showUpload} onClick={() => setShowUpload((v) => !v)}>
                {showUpload ? 'Close status sheet' : 'Upload status sheet'}
              </button>
            )}
            <ListActions kind={setup.kind} filters={filters} total={isLoading ? undefined : pg?.total} role={role} />
          </div>
        </div>
        {rangeProblem && <p className="adm-fieldmsg" role="alert">{rangeProblem}</p>}

        <div className="ap-chips" role="group" aria-label="Filter by status">
          {/* A status nobody is in is left out (unless it is the one picked). */}
          {chips.filter((c) => !c.key || c.key === status || !summary || countOf(c.key) > 0).map((c) => (
            <button key={c.key || 'all'} type="button" className={`ap-chip${status === c.key ? ' on' : ''}`} aria-pressed={status === c.key} onClick={() => set(setStatus)(c.key)}>
              {c.label} <b>{summary ? num(countOf(c.key)) : '…'}</b>
            </button>
          ))}
        </div>

        {error ? (
          <ListError what={setup.noun} error={error} onRetry={() => mutate()} />
        ) : isLoading && !data ? (
          <div aria-busy="true"><TableSkeleton rows={8} cols={5} /></div>
        ) : rows.length === 0 ? (
          <ListEmpty filtered={filtered} filteredText={`No ${setup.noun} match these filters.`} noneTitle={`No ${setup.noun} yet.`} noneBody="They appear here as customers apply." onClear={reset} />
        ) : (
          <div className="table-wrap">
            <table className="data adm-table ap-table">
              <thead><tr><th>Customer</th><th className="r">Amount</th><th>Status</th><th>{setup.lenderHead}</th><th className="r">Date</th></tr></thead>
              <tbody>
                {lender === 'aurix' && (rows as AurixRow[]).map((r) => <AurixRowView key={r.id} r={r} onOpen={() => router.push(`/loans/${r.id}`)} />)}
                {lender === 'yubi' && (rows as YubiRow[]).map((r) => <YubiRowView key={r.id} r={r} />)}
                {lender === 'revasure' && (rows as RevasureRow[]).map((r) => (
                  <RevasureRowView key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={(p) => { setPage(p); setOpen(null); }} />}
      </Card>
    </>
  );
}
