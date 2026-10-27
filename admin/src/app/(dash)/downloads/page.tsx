'use client';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, Stat, Select, FilterChips, Pagination, TableSkeleton, Callout } from '@/components/ui';
import { num } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { STAGES, stageLabel } from '@/components/journey';
import AppBuilds from '@/components/AppBuilds';
import InstallsTable from '@/components/installs/InstallsTable';
import '@/components/installs/installs.css';
import {
  INSTALL_PERIODS, DEFAULT_INSTALL_PERIOD, EMPTY_INSTALL_FILTERS, computeInstallRange, rangeError, buildInstallsQuery, hasActiveFilters,
  listState, emptyNoneText, percentOf, barWidth, sentByLabel, platformLabel, SENT_BY_OPTIONS, CHANNEL_OPTIONS, PLATFORM_OPTIONS,
  type InstallPeriod, type InstallFilters, type InstallsPayload,
} from '@/lib/installs';

const PAGE_SIZE = 20;
const STAGE_OPTIONS = [{ value: '', label: 'Any stage' }, ...STAGES.map((s) => ({ value: s.key, label: s.label }))];

function BarList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  return (
    <div>
      <h4>{title}</h4>
      {rows.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>No installs in this period.</p> : rows.map((r) => (
        <div key={r.label} className="adm-inst-bar-row">
          <span>{r.label}</span>
          <div className="mini-bar" aria-hidden="true"><span style={{ width: `${barWidth(r.count, max)}%` }} /></div>
          <span className="adm-inst-bar-count">{num(r.count)}</span>
        </div>
      ))}
    </div>
  );
}

function FilterSelect({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="adm-inst-field" role="group" aria-labelledby={id}>
      <span id={id} className="adm-inst-label">{label}</span>
      <Select value={value} onChange={onChange} options={options} />
    </div>
  );
}

export default function DownloadsPage() {
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<InstallPeriod>(DEFAULT_INSTALL_PERIOD);
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [filters, setFilters] = useState<InstallFilters>(EMPTY_INSTALL_FILTERS);
  // The box shows what is typed; the request waits for a short pause so it is not sent on every keystroke.
  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText, 300);

  useEffect(() => {
    setFilters((f) => (f.search === search ? f : { ...f, search }));
    setPage(1);
  }, [search]);

  const dateError = period === 'custom' ? rangeError(cFrom, cTo) : null;
  const range = useMemo(() => computeInstallRange(period, cFrom, cTo), [period, cFrom, cTo]);
  const qs = useMemo(() => buildInstallsQuery(filters, range, page, PAGE_SIZE), [filters, range, page]);

  const { data, error, isLoading, mutate } = useSWR(dateError ? null : `/api/admin/installs?${qs}`, swrFetcher, {
    keepPreviousData: true,
    refreshInterval: 60_000,
  });
  const p = data?.data as InstallsPayload | undefined;
  const pg = data?.pagination;
  const active = hasActiveFilters(filters) || !!searchText.trim();
  const state = listState({ loading: isLoading, error, total: pg?.total ?? 0, filtersActive: active });

  const setFilter = (patch: Partial<InstallFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const onPeriod = (v: InstallPeriod) => { setPeriod(v); setPage(1); };
  const clearFilters = () => { setSearchText(''); setFilters(EMPTY_INSTALL_FILTERS); setPage(1); };

  const stats = p?.stats;
  const periodLabel = INSTALL_PERIODS.find((x) => x.key === period)?.label.toLowerCase() ?? 'this period';
  const pctFoot = (n: number) => (stats ? `${percentOf(n, stats.total)}% of installs` : undefined);

  return (
    <div className="page">
      <h1 className="page-title">App Downloads</h1>
      <p className="page-sub">Who installed the app, the details we sent with the link, and what to do next.</p>

      <div className="adm-inst-stack">
        <Card>
          <div className="stat-strip adm-inst-stat-wrap">
            <Stat label="Installs" value={stats ? num(stats.total) : '-'} foot={`In ${periodLabel}`} />
            <Stat label="With customer details" value={stats ? num(stats.withContext) : '-'} foot={pctFoot(stats?.withContext ?? 0)} />
            <Stat label="Without details" value={stats ? num(stats.withoutContext) : '-'} foot={pctFoot(stats?.withoutContext ?? 0)} />
            <Stat label="Reached the next step since install" value={stats ? num(stats.reachedNextStep) : '-'} foot={pctFoot(stats?.reachedNextStep ?? 0)} />
            <Stat label="Not signed in yet" value={stats ? num(stats.notSignedIn) : '-'} foot={pctFoot(stats?.notSignedIn ?? 0)} />
          </div>
        </Card>

        <Card>
          <div className="adm-inst-filters">
            <div role="group" aria-label="Period">
              <FilterChips options={INSTALL_PERIODS} value={period} onChange={onPeriod} />
            </div>

            {period === 'custom' && (
              <div>
                <div className="adm-inst-dates">
                  <div className="adm-inst-field">
                    <label htmlFor="adm-inst-from">From</label>
                    <input id="adm-inst-from" type="date" className="input" value={cFrom} max={cTo || undefined}
                      aria-invalid={!!dateError} aria-describedby={dateError ? 'adm-inst-date-err' : undefined}
                      onChange={(e) => { setCFrom(e.target.value); setPage(1); }} />
                  </div>
                  <div className="adm-inst-field">
                    <label htmlFor="adm-inst-to">To</label>
                    <input id="adm-inst-to" type="date" className="input" value={cTo} min={cFrom || undefined}
                      aria-invalid={!!dateError} aria-describedby={dateError ? 'adm-inst-date-err' : undefined}
                      onChange={(e) => { setCTo(e.target.value); setPage(1); }} />
                  </div>
                </div>
                {dateError && <p id="adm-inst-date-err" className="adm-inst-err" role="alert" style={{ marginTop: 6 }}>{dateError}</p>}
              </div>
            )}

            <div className="toolbar">
              <div className="adm-inst-field toolbar-search" style={{ flex: '1 1 240px' }}>
                <label htmlFor="adm-inst-search">Search</label>
                <input id="adm-inst-search" type="search" className="input" value={searchText} placeholder="Search by name or mobile"
                  onChange={(e) => setSearchText(e.target.value)} autoComplete="off" />
              </div>
              <FilterSelect id="adm-inst-stage" label="Stage" value={filters.stage} onChange={(v) => setFilter({ stage: v })} options={STAGE_OPTIONS} />
              <FilterSelect id="adm-inst-by" label="Sent by" value={filters.sentBy} onChange={(v) => setFilter({ sentBy: v })} options={SENT_BY_OPTIONS} />
              <FilterSelect id="adm-inst-channel" label="Channel" value={filters.channel} onChange={(v) => setFilter({ channel: v })} options={CHANNEL_OPTIONS} />
              <FilterSelect id="adm-inst-platform" label="Platform" value={filters.platform} onChange={(v) => setFilter({ platform: v })} options={PLATFORM_OPTIONS} />
            </div>

            <div className="row wrap" style={{ gap: 16 }}>
              <label className="adm-inst-check">
                <input type="checkbox" checked={filters.followUp} onChange={(e) => setFilter({ followUp: e.target.checked })} />
                Only installs that have not moved on yet
              </label>
              {active && <button type="button" className="btn" onClick={clearFilters}>Clear filters</button>}
            </div>
          </div>
        </Card>

        {p?.truncated && (
          <Callout tone="amber">Showing the newest 2,000 installs in this period. Choose a shorter period to see the rest.</Callout>
        )}

        <Card title="Installs">
          {dateError ? (
            <div className="empty-state"><p>Fix the date range above to see installs.</p></div>
          ) : (
            <>
              {state === 'loaded' && pg && (
                <p className="adm-inst-result" aria-live="polite">
                  {active
                    ? `${num(pg.total)} ${pg.total === 1 ? 'install matches' : 'installs match'} these filters.`
                    : `${num(pg.total)} ${pg.total === 1 ? 'install' : 'installs'} in ${periodLabel}.`}
                </p>
              )}
              {state === 'loading' && <div aria-busy="true"><TableSkeleton rows={8} cols={6} /></div>}
              {state === 'error' && (
                <div className="empty-state" role="alert">
                  <h3>Could not load installs</h3>
                  <p>{(error as Error)?.message || 'Something went wrong.'}</p>
                  <button type="button" className="btn" onClick={() => { void mutate(); }}>Retry</button>
                </div>
              )}
              {state === 'empty_filtered' && (
                <div className="empty-state">
                  <h3>No installs match these filters.</h3>
                  <p>Try a longer period or remove a filter.</p>
                  <button type="button" className="btn" onClick={clearFilters}>Clear filters</button>
                </div>
              )}
              {state === 'empty_none' && (
                <div className="empty-state"><h3>{emptyNoneText(period)}</h3></div>
              )}
              {state === 'loaded' && p && (
                <InstallsTable rows={p.rows} stageName={stageLabel} onChanged={() => { void mutate(); }} />
              )}
              {pg && state === 'loaded' && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
            </>
          )}
        </Card>

        <Card title="Where installs came from" sub={`Every install in ${periodLabel}, before the filters above.`}>
          {p ? (
            <div className="adm-inst-bars">
              <BarList title="How the link reached them" rows={p.bySource.map((s) => ({ label: sentByLabel(s.source), count: s.count }))} />
              <BarList title="Platform" rows={p.byPlatform.map((s) => ({ label: platformLabel(s.platform), count: s.count }))} />
            </div>
          ) : error ? <p className="muted" style={{ margin: 0 }}>Not available while installs cannot be loaded.</p> : <TableSkeleton rows={4} cols={2} />}
        </Card>

        <details className="so-guide adm-inst-guide">
          <summary>Share the app: download links and link generator</summary>
          <div><AppBuilds /></div>
        </details>
      </div>
    </div>
  );
}
