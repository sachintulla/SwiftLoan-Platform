'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, getAdmin } from '@/lib/api';
import { Card, LoanStatusBadge, FilterChips, Select, Pagination, TableSkeleton } from '@/components/ui';
import ListActions, { ExportNote, ListError, ListEmpty } from '@/components/ListActions';
import { inr, dateTimeStr, loanStatusLabel } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { buildListQuery, describeFilters, resultLine, dayBoundIso, dateRangeProblem, dayLabel, type FilterLabels } from '@/lib/lists';
import '@/components/listActions.css';

// Every ApplicationStatus, in funnel order. The mid-funnel states
// (pan_pending / prequalifying / handoff) were previously unfilterable even
// though they are exactly where applications go quiet — an operator chasing
// drop-offs could not isolate them.
const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pan_pending', label: 'PAN Pending' },
  { key: 'prequalifying', label: 'Prequalifying' },
  { key: 'offers_ready', label: 'Offers' },
  { key: 'handoff', label: 'Handoff' },
  { key: 'under_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'disbursed', label: 'Disbursed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'closed', label: 'Closed' },
] as const;

// What a lender did with the applications a customer sent out. Rejected includes
// applications that failed, the same grouping the "Lender applications" column uses.
const LENDER_RESULTS = [
  { value: '', label: 'Any' },
  { value: 'approved', label: 'Approved' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'in_progress', label: 'In progress' },
];

const FILTER_LABELS: FilterLabels = {
  status: { name: 'status', value: (v) => loanStatusLabel(v) },
  lenderResult: { name: 'lender result', value: (v) => LENDER_RESULTS.find((o) => o.value === v)?.label ?? v },
  search: { name: 'search' },
  from: { name: 'from', value: dayLabel },
  to: { name: 'to', value: dayLabel },
};

interface AppliedOffer { id: string; lenderName?: string | null; lenderStatus?: string | null; partner?: { name?: string } | null }
interface Row { id: string; ref: string; amount: number; loanType: string; status: string; createdAt: string; user?: { fullName?: string; phone?: string }; loan?: { id: string } | null; _count?: { offers: number }; offers?: AppliedOffer[] }

/** Compact per-lender summary for a pipeline row, e.g. "3 lenders · 1 Active". */
function lenderSummary(offers: AppliedOffer[] | undefined): string {
  const applied = offers ?? [];
  if (applied.length === 0) return '—';
  const approved = applied.filter((o) => o.lenderStatus === 'approved').length;
  const disbursed = applied.filter((o) => o.lenderStatus === 'disbursed').length;
  const rejected = applied.filter((o) => o.lenderStatus === 'rejected' || o.lenderStatus === 'failed').length;
  const parts: string[] = [];
  if (disbursed) parts.push(`${disbursed} Active`);
  if (approved) parts.push(`${approved} Approved`);
  if (rejected) parts.push(`${rejected} Rejected`);
  const pending = applied.length - approved - disbursed - rejected;
  if (pending) parts.push(`${pending} in progress`);
  return `${applied.length} lender${applied.length === 1 ? '' : 's'}${parts.length ? ' · ' + parts.join(', ') : ''}`;
}

export default function LoansPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [lenderResult, setLenderResult] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<string | undefined>(undefined);
  useEffect(() => { setRole(getAdmin()?.role || undefined); }, []);

  // The list and the export read the same debounced filters, so the file is always what is on screen.
  const debouncedSearch = useDebounced(search.trim(), 350);
  const searchPending = search.trim() !== debouncedSearch;
  const rangeProblem = dateRangeProblem(fromDay, toDay);

  const filters = useMemo<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (status) f.status = status;
    if (debouncedSearch) f.search = debouncedSearch;
    if (lenderResult) f.lenderResult = lenderResult;
    const from = dayBoundIso(fromDay, 'start');
    const to = dayBoundIso(toDay, 'end');
    if (from) f.from = from;
    if (to) f.to = to;
    return f;
  }, [status, debouncedSearch, lenderResult, fromDay, toDay]);

  const qs = buildListQuery({ ...filters, page, pageSize: 20 });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/loans?${qs}`, swrFetcher);
  const rows = (data?.data ?? []) as Row[];
  const pg = data?.pagination;

  // Words for the result line use the on-screen values (dates as picked, not as instants).
  const described = describeFilters({ status, lenderResult, search: debouncedSearch, from: fromDay, to: toDay }, FILTER_LABELS);
  const filtered = Boolean(status || lenderResult || search.trim() || fromDay || toDay);

  const reset = () => { setStatus(''); setSearch(''); setLenderResult(''); setFromDay(''); setToDay(''); setPage(1); };
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Loan Pipeline</h1>
          <p className="page-sub">Every loan application with its current stage. Select a row to open the full journey.</p>
        </div>
        <ListActions kind="loans" filters={filters} total={searchPending || isLoading ? undefined : pg?.total} filterSummary={described} role={role} />
      </div>

      <div className="mt-16">
        <Card>
          <div className="adm-filters">
            <label className="adm-field adm-grow">
              <span>Search</span>
              <input
                type="search"
                className="input"
                value={search}
                aria-label="Search applications"
                placeholder="Search by reference, name or mobile"
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
            <div className="adm-field adm-field-select" role="group" aria-label="Lender result">
              <span aria-hidden="true">Lender result</span>
              <Select value={lenderResult} onChange={change(setLenderResult)} options={LENDER_RESULTS} />
            </div>
            <label className="adm-field adm-field-date">
              <span>From</span>
              <input type="date" className="input" value={fromDay} max={toDay || undefined} aria-describedby={rangeProblem ? 'loans-range-msg' : undefined} onChange={(e) => change(setFromDay)(e.target.value)} />
            </label>
            <label className="adm-field adm-field-date">
              <span>To</span>
              <input type="date" className="input" value={toDay} min={fromDay || undefined} aria-describedby={rangeProblem ? 'loans-range-msg' : undefined} onChange={(e) => change(setToDay)(e.target.value)} />
            </label>
            {filtered && <button type="button" className="adm-link-btn" onClick={reset}>Clear filters</button>}
          </div>
          {rangeProblem && <p className="adm-fieldmsg" id="loans-range-msg" role="alert">{rangeProblem}</p>}

          <div className="adm-chips" role="group" aria-label="Filter by status">
            <FilterChips options={STATUS_FILTERS as unknown as { key: string; label: string }[]} value={status} onChange={change(setStatus)} />
          </div>

          <ExportNote />
          <p className="adm-resultline" aria-live="polite">
            {pg && !error ? resultLine(pg.total, 'application', 'applications', described) : ''}
          </p>

          {error ? (
            <ListError what="loan applications" error={error} onRetry={() => mutate()} />
          ) : isLoading ? (
            <div aria-busy="true"><TableSkeleton rows={8} cols={7} /></div>
          ) : rows.length === 0 ? (
            <ListEmpty
              filtered={filtered}
              filteredText="No applications match these filters."
              noneTitle="No loan applications yet."
              noneBody="They appear here as customers apply."
              onClear={reset}
            />
          ) : (
            <div className="table-wrap">
              <table className="data adm-table">
                <thead><tr><th>Ref</th><th>Applicant</th><th>Type</th><th>Amount</th><th>Status</th><th>Lender applications</th><th>Applied</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => router.push(`/loans/${r.id}`)}>
                      <td data-label="Ref">
                        <Link className="mono adm-ref" href={`/loans/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.ref}</Link>
                      </td>
                      <td data-label="Applicant"><div>{r.user?.fullName || '—'}<div className="adm-sub">{r.user?.phone}</div></div></td>
                      <td data-label="Type" style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.loanType}</td>
                      <td data-label="Amount" className="mono">{inr(r.amount)}</td>
                      <td data-label="Status"><LoanStatusBadge status={r.status} /></td>
                      <td data-label="Lender applications" className="muted" style={{ fontSize: 12.5 }}>{lenderSummary(r.offers)}</td>
                      <td data-label="Applied" className="muted">{dateTimeStr(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
        </Card>
      </div>
    </div>
  );
}
