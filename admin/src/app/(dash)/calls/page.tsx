'use client';
// Calls: a call log first and a health monitor second. Stat strip (each cell
// sets a filter), an overdue notice that only appears when needed, filters, a
// paginated log whose rows open to what was said and the transcript, the
// by-day and by-reason breakdowns, and the scheduler table folded away.
import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, downloadFile, getAdmin } from '@/lib/api';
import { Card, Pagination } from '@/components/ui';
import { num, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import {
  DEFAULT_FILTERS, STATUS_CHIPS, RANGE_OPTIONS, PURPOSE_OPTIONS, OUTCOME_OPTIONS,
  callQuery, rangeError, hasActiveFilters, filterSummary, CALL_AGAIN_ROLE, EXPORT_ROLES,
  type CallFilters, type JobHeartbeat, type OverviewSummary,
} from '@/lib/calls';
import CallsLog, { type CallListItem } from '@/components/calls/CallsLog';
import { CallsStatStrip, OverdueNotice, CallsBreakdown, ScheduleGuide, SCHEDULE_ID } from '@/components/calls/CallsStats';
import '@/components/calls/calls.css';

interface Overview {
  summary: OverviewSummary;
  byPurpose: { purpose: string; count: number }[];
  perDay: { day: string; count: number }[];
  jobs: JobHeartbeat[];
  generatedAt: string;
}

const PAGE_SIZE = 20;
const REFRESH_MS = 30_000;

export default function CallsPage() {
  const [filters, setFilters] = useState<CallFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [paused, setPaused] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { setRole(getAdmin()?.role ?? null); }, []);
  const isSuperAdmin = role === CALL_AGAIN_ROLE;
  const mayExport = role !== null && EXPORT_ROLES.includes(role);

  // Typing in search waits a moment so each keystroke is not a request.
  const debouncedSearch = useDebounced(filters.search, 300);
  const queryFilters = { ...filters, search: debouncedSearch };
  const dateErr = rangeError(filters);
  const qs = callQuery(queryFilters).toString();

  // Updates stop while Pause is on and while a row is open, so the list does
  // not move under someone who is reading it.
  const refreshing = !paused && !openId;
  const refreshInterval = refreshing ? REFRESH_MS : 0;

  const listKey = `/api/admin/calls?${qs}${qs ? '&' : ''}page=${page}&pageSize=${PAGE_SIZE}`;
  const list = useSWR(dateErr ? null : listKey, swrFetcher, { refreshInterval, keepPreviousData: true });
  const overview = useSWR('/api/admin/calls/overview', swrFetcher, { refreshInterval });
  const items = (list.data?.data as CallListItem[] | undefined) ?? [];
  const pg = list.data?.pagination;
  const ov = overview.data?.data as Overview | undefined;
  const filtered = hasActiveFilters(filters);

  // Re-render now and then so "Updated 2m ago" stays true between refreshes.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  function change(patch: Partial<CallFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
    setOpenId(null);
  }
  const clear = () => { setFilters(DEFAULT_FILTERS); setPage(1); setOpenId(null); };
  const refreshAll = () => { void list.mutate(); void overview.mutate(); };

  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');
  async function exportCsv() {
    setExporting(true); setExportErr('');
    try {
      const q = callQuery(filters).toString();
      await downloadFile(`/api/admin/calls/export.csv${q ? `?${q}` : ''}`, `calls-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setExportErr((e as Error).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const scheduleRef = useRef<HTMLDivElement>(null);
  function seeJobs() {
    setScheduleOpen(true);
    setTimeout(() => scheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  const total = pg?.total ?? 0;
  const loadingList = list.isLoading && !list.data;

  return (
    <div className="adm-calls">
      <div className="adm-calls-head">
        <div>
          <h1 className="page-title">Calls</h1>
          <p className="page-sub">
            Every call the voice agent has placed and what came of it.
            {ov?.generatedAt ? ` Updated ${timeAgo(ov.generatedAt)}.` : ''}
          </p>
        </div>
        <div className="adm-calls-head-actions">
          {openId && !paused && <span className="adm-calls-hint">Updates are paused while a call is open.</span>}
          <button type="button" className="btn" onClick={refreshAll}>Refresh</button>
          <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
            {paused ? 'Resume updates' : 'Pause updates'}
          </button>
        </div>
      </div>

      <CallsStatStrip
        summary={ov?.summary}
        loading={overview.isLoading}
        error={Boolean(overview.error)}
        onRetry={() => overview.mutate()}
        filters={filters}
        onPick={change}
      />

      <OverdueNotice jobs={ov?.jobs} onSeeDetails={seeJobs} />

      <Card>
        {/* filters */}
        <div className="adm-calls-toolbar">
          <div className="adm-calls-field adm-calls-search">
            <label htmlFor="calls-search">Search by mobile or name</label>
            <input
              id="calls-search"
              className="input"
              value={filters.search}
              placeholder="Mobile number or customer name"
              onChange={(e) => change({ search: e.target.value })}
            />
          </div>
          <div className="adm-calls-field" style={{ minWidth: 170 }}>
            <label htmlFor="calls-outcome">Outcome</label>
            <select id="calls-outcome" className="input" value={filters.outcome} onChange={(e) => change({ outcome: e.target.value })}>
              {OUTCOME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="adm-calls-field" style={{ minWidth: 170 }}>
            <label htmlFor="calls-why">Why we called</label>
            <select id="calls-why" className="input" value={filters.purpose} onChange={(e) => change({ purpose: e.target.value })}>
              {PURPOSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {filtered && <button type="button" className="btn" onClick={clear}>Clear filters</button>}
        </div>

        <div className="adm-calls-toolbar" style={{ alignItems: 'center' }}>
          <div className="adm-calls-chips" role="group" aria-label="Filter by result">
            {STATUS_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip-filter"
                aria-pressed={filters.view === c.key}
                onClick={() => change({ view: c.key })}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="adm-calls-chips" role="group" aria-label="Filter by date">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                className="chip-filter"
                aria-pressed={filters.range === r.key}
                onClick={() => change({ range: r.key })}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {filters.range === 'custom' && (
          <div className="adm-calls-dates" style={{ marginBottom: 12 }}>
            <div className="adm-calls-field">
              <label htmlFor="calls-from">From</label>
              <input
                id="calls-from" type="date" className="input" value={filters.from} max={filters.to || undefined}
                aria-invalid={dateErr ? true : undefined} aria-describedby={dateErr ? 'calls-date-err' : undefined}
                onChange={(e) => change({ from: e.target.value })}
              />
            </div>
            <div className="adm-calls-field">
              <label htmlFor="calls-to">To</label>
              <input
                id="calls-to" type="date" className="input" value={filters.to} min={filters.from || undefined}
                aria-invalid={dateErr ? true : undefined} aria-describedby={dateErr ? 'calls-date-err' : undefined}
                onChange={(e) => change({ to: e.target.value })}
              />
            </div>
          </div>
        )}
        {dateErr && <p id="calls-date-err" role="alert" className="adm-calls-error">{dateErr}</p>}

        {/* the log */}
        <div className="row between wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div>
            <h3 className="card-title">Call log</h3>
            <p className="adm-calls-result" aria-live="polite">
              {list.error && !list.data ? '' : `${num(total)} call${total === 1 ? '' : 's'}. ${filterSummary(filters)}`}
            </p>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            {!mayExport && role !== null && <span id="calls-export-note" className="adm-calls-why">Exports need an admin or super admin</span>}
            <button
              type="button"
              className="btn"
              disabled={exporting || !mayExport || Boolean(dateErr)}
              aria-describedby={!mayExport && role !== null ? 'calls-export-note' : undefined}
              onClick={exportCsv}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>
        {exportErr && <p role="alert" className="adm-calls-error" style={{ marginTop: 0 }}>{exportErr}</p>}

        {list.error && !list.data ? (
          <div className="empty" role="alert">
            Could not load calls - {(list.error as Error).message}
            <div><button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => list.mutate()}>Retry</button></div>
          </div>
        ) : !loadingList && items.length === 0 ? (
          <div className="empty-state">
            <h3>{filtered ? 'No calls match these filters.' : 'No calls yet.'}</h3>
            <p>{filtered ? 'Nothing in this slice. Try a wider date range or clear a filter.' : 'They appear here as soon as the voice agent places one.'}</p>
            {filtered && <button type="button" className="btn" onClick={clear}>Clear filters</button>}
          </div>
        ) : (
          <CallsLog
            items={items}
            loading={loadingList}
            openId={openId}
            onOpen={setOpenId}
            isSuperAdmin={isSuperAdmin}
            onCalled={refreshAll}
          />
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={(p) => { setPage(p); setOpenId(null); }} />}
      </Card>

      <CallsBreakdown perDay={ov?.perDay} byPurpose={ov?.byPurpose} loading={overview.isLoading && !ov} />

      <div ref={scheduleRef} id={`${SCHEDULE_ID}-wrap`}>
        <ScheduleGuide jobs={ov?.jobs} loading={overview.isLoading && !ov} open={scheduleOpen} onToggle={setScheduleOpen} />
      </div>
    </div>
  );
}
