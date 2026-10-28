'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher, getAdmin } from '@/lib/api';
import { Card, Stat, StatusBadge, FilterChips, Pagination, TableSkeleton } from '@/components/ui';
import ListActions, { ExportNote, ListError, ListEmpty } from '@/components/ListActions';
import { num, dateTimeStr, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import {
  buildListQuery, describeFilters, resultLine, dayBoundIso, dateRangeProblem, dayLabel,
  REVASURE_STATUS_LABEL, type FilterLabels,
} from '@/lib/lists';
import '@/components/listActions.css';

interface Customer { id: string | null; name: string | null; phone: string | null }

interface RevasureLead {
  id: string;
  applicationId: string | null;
  userId: string | null;
  sourceLeadId: string | null;
  status: string;
  httpStatus: number | null;
  leadId: string | null;
  message: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  customer: Customer | null;
}

interface Payload {
  rows: RevasureLead[];
  byStatus: { status: string; count: number }[];
}

interface LeadDetail {
  lead: Omit<RevasureLead, 'customer'> & { requestBody: unknown; responseBody: unknown };
}

// Revasure lead status → the admin tone palette (global convention):
//   success = green, duplicate = teal, ineligible/failed = red, pending = amber.
// StatusBadge derives its colour from statusTone(status), so map each raw status
// to a tone-carrying keyword and keep the human label — exactly how the downloads
// page renders context/organic badges.
const STATUS_TONE: Record<string, string> = {
  success: 'approved',
  duplicate: 'converted',
  ineligible: 'rejected',
  failed: 'failed',
  pending: 'pending',
};

function RevasureStatus({ status }: { status: string }) {
  return <StatusBadge status={STATUS_TONE[status] ?? status} label={REVASURE_STATUS_LABEL[status] ?? status} />;
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'success', label: 'Success' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'ineligible', label: 'Ineligible' },
  { key: 'failed', label: 'Failed' },
  { key: 'pending', label: 'Pending' },
];

const FILTER_LABELS: FilterLabels = {
  status: { name: 'status', value: (v) => REVASURE_STATUS_LABEL[v] ?? v },
  search: { name: 'search' },
  from: { name: 'from', value: dayLabel },
  to: { name: 'to', value: dayLabel },
};

function pretty(v: unknown): string {
  if (v == null) return '—';
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

/** The technical detail for one lead, fetched only when its row is opened. */
function LeadDetailPanel({ id, panelId, colSpan }: { id: string; panelId: string; colSpan: number }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/revasure/${id}`, swrFetcher);
  const lead = (data?.data as LeadDetail | undefined)?.lead;
  return (
    <tr className="adm-detail-row" id={panelId}>
      <td colSpan={colSpan}>
        <div className="adm-detail">
          <p className="adm-detail-title">Technical detail for support. Do not share outside the team.</p>
          {error ? (
            <div role="alert">
              <span className="adm-err-text">Could not load the detail - {(error as Error).message}</span>{' '}
              <button type="button" className="btn adm-btn-sm" onClick={() => mutate()}>Retry</button>
            </div>
          ) : isLoading || !lead ? (
            <div className="skeleton" style={{ height: 90 }} aria-busy="true" />
          ) : (
            <>
              <div className="adm-detail-facts">
                <span>HTTP status <b className="mono">{lead.httpStatus ?? '—'}</b></span>
                <span>Source lead ID <b className="mono">{lead.sourceLeadId || '—'}</b></span>
                <span>Created <b>{dateTimeStr(lead.createdAt)}</b></span>
              </div>
              {(lead.message || lead.lastError) && (
                <div style={{ fontSize: 13 }}>
                  {lead.message && <div><b>Message:</b> {lead.message}</div>}
                  {lead.lastError && <div><b>Last error:</b> <span className="adm-err-text">{lead.lastError}</span></div>}
                </div>
              )}
              <div className="adm-detail-grid">
                <div>
                  <div className="adm-detail-pane-label">Request</div>
                  <pre className="mono">{pretty(lead.requestBody)}</pre>
                </div>
                <div>
                  <div className="adm-detail-pane-label">Response</div>
                  <pre className="mono">{pretty(lead.responseBody)}</pre>
                </div>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function RevasurePage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [role, setRole] = useState<string | undefined>(undefined);
  useEffect(() => { setRole(getAdmin()?.role || undefined); }, []);

  const debouncedSearch = useDebounced(search.trim(), 350);
  const searchPending = search.trim() !== debouncedSearch;
  const rangeProblem = dateRangeProblem(fromDay, toDay);

  const filters = useMemo<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (status) f.status = status;
    if (debouncedSearch) f.search = debouncedSearch;
    const from = dayBoundIso(fromDay, 'start');
    const to = dayBoundIso(toDay, 'end');
    if (from) f.from = from;
    if (to) f.to = to;
    return f;
  }, [status, debouncedSearch, fromDay, toDay]);

  const qs = buildListQuery({ ...filters, page, pageSize: 20 });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/revasure?${qs}`, swrFetcher);
  const p = data?.data as Payload | undefined;
  const pg = data?.pagination;

  const count = (s: string) => p?.byStatus.find((b) => b.status === s)?.count ?? 0;
  const dated = Boolean(fromDay || toDay);
  const statFoot = dated ? 'for this date range' : 'across all dates';

  const described = describeFilters({ status, search: debouncedSearch, from: fromDay, to: toDay }, FILTER_LABELS);
  const filtered = Boolean(status || search.trim() || fromDay || toDay);

  const reset = () => { setStatus(''); setSearch(''); setFromDay(''); setToDay(''); setPage(1); setOpen(null); };
  const setFilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); setOpen(null); };
  // A stat cell is a shortcut to that status; pressing the active one again clears it.
  const pickStatus = (s: string) => { setStatus((cur) => (cur === s ? '' : s)); setPage(1); setOpen(null); };

  const STATS: { key: string; label: string }[] = STATUS_FILTERS.filter((s) => s.key);
  const rows = p?.rows ?? [];

  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Revasure Leads</h1>
          <p className="page-sub">Customers whose details were sent to Revasure when they were prequalified, and what Revasure replied.</p>
        </div>
        <ListActions kind="revasure" filters={filters} total={searchPending || isLoading ? undefined : pg?.total} filterSummary={described} role={role} />
      </div>

      <Card className="mt-16">
        {isLoading && !p ? <div className="skeleton" style={{ height: 58 }} aria-busy="true" /> : (
          <div className="adm-stats" role="group" aria-label="Filter by status">
            {STATS.map((s) => (
              <button key={s.key} type="button" className="adm-stat-btn" aria-pressed={status === s.key} onClick={() => pickStatus(s.key)}>
                <Stat label={s.label} value={num(count(s.key))} foot={statFoot} />
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-16">
        <Card>
          <div className="adm-filters">
            <label className="adm-field adm-grow">
              <span>Search</span>
              <input
                type="search"
                className="input"
                value={search}
                aria-label="Search leads"
                placeholder="Search by customer, mobile or lead id"
                onChange={(e) => { setSearch(e.target.value); setPage(1); setOpen(null); }}
              />
            </label>
            <label className="adm-field adm-field-date">
              <span>From</span>
              <input type="date" className="input" value={fromDay} max={toDay || undefined} aria-describedby={rangeProblem ? 'rev-range-msg' : undefined} onChange={(e) => setFilter(setFromDay)(e.target.value)} />
            </label>
            <label className="adm-field adm-field-date">
              <span>To</span>
              <input type="date" className="input" value={toDay} min={fromDay || undefined} aria-describedby={rangeProblem ? 'rev-range-msg' : undefined} onChange={(e) => setFilter(setToDay)(e.target.value)} />
            </label>
            {filtered && <button type="button" className="adm-link-btn" onClick={reset}>Clear filters</button>}
          </div>
          {rangeProblem && <p className="adm-fieldmsg" id="rev-range-msg" role="alert">{rangeProblem}</p>}

          <div className="adm-chips" role="group" aria-label="Filter by status">
            <FilterChips options={STATUS_FILTERS} value={status} onChange={setFilter(setStatus)} />
          </div>

          <ExportNote />
          <p className="adm-resultline" aria-live="polite">
            {pg && !error ? resultLine(pg.total, 'lead', 'leads', described) : ''}
          </p>

          {error ? (
            <ListError what="Revasure leads" error={error} onRetry={() => mutate()} />
          ) : isLoading ? (
            <div aria-busy="true"><TableSkeleton rows={8} cols={6} /></div>
          ) : rows.length === 0 ? (
            <ListEmpty
              filtered={filtered}
              filteredText="No leads match these filters."
              noneTitle="No leads have been sent to Revasure yet."
              noneBody="They appear here after a customer is prequalified."
              onClear={reset}
            />
          ) : (
            <div className="table-wrap"><table className="data adm-table">
              <thead><tr><th>Customer</th><th>Status</th><th>What happened</th><th>Revasure lead ID</th><th>Updated</th><th><span className="adm-sr">Details</span></th></tr></thead>
              <tbody>{rows.map((r) => {
                const isOpen = open === r.id;
                const panelId = `rev-detail-${r.id}`;
                const text = r.message || r.lastError || '';
                return (
                  <Fragment key={r.id}>
                    <tr className={isOpen ? 'adm-row-open' : undefined} style={{ cursor: 'default' }}>
                      <td data-label="Customer">
                        {r.customer?.id ? (
                          <Link className="adm-cell-link" href={`/customers/${r.customer.id}`}>
                            <div className="adm-name">{r.customer.name || 'Unknown'}</div>
                            <div className="adm-sub mono">{r.customer.phone || '—'}</div>
                          </Link>
                        ) : (
                          <div>
                            <div className="adm-name">{r.customer?.name || 'Not matched to a customer'}</div>
                            <div className="adm-sub mono">{r.customer?.phone || '—'}</div>
                          </div>
                        )}
                      </td>
                      <td data-label="Status"><RevasureStatus status={r.status} /></td>
                      <td data-label="What happened">
                        {text ? <span className="adm-clamp2" title={text}>{text}</span> : <span className="muted">—</span>}
                      </td>
                      <td data-label="Revasure lead ID" className="mono">{r.leadId || '—'}</td>
                      <td data-label="Updated" className="muted" title={dateTimeStr(r.updatedAt)}>{timeAgo(r.updatedAt)}</td>
                      <td data-label="">
                        <button
                          type="button"
                          className="btn adm-btn-sm"
                          aria-expanded={isOpen}
                          aria-controls={isOpen ? panelId : undefined}
                          onClick={() => setOpen(isOpen ? null : r.id)}
                        >
                          {isOpen ? 'Hide details' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && <LeadDetailPanel id={r.id} panelId={panelId} colSpan={6} />}
                  </Fragment>
                );
              })}</tbody>
            </table></div>
          )}
          {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={(n) => { setPage(n); setOpen(null); }} />}
        </Card>
      </div>
    </div>
  );
}
