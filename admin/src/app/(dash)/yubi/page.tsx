'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, getAdmin } from '@/lib/api';
import { Card, Stat, StatusBadge, FilterChips, Callout, Pagination, TableSkeleton } from '@/components/ui';
import ListActions, { ExportNote, ListError, ListEmpty } from '@/components/ListActions';
import { num, dateTimeStr, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import {
  buildListQuery, describeFilters, resultLine, dayBoundIso, dateRangeProblem, dayLabel,
  yubiStatusLabel, type FilterLabels,
} from '@/lib/lists';
import '@/components/listActions.css';

interface Referral {
  id: string;
  applicationId: string | null;
  userId: string | null;
  /** Customer id, for the link to /customers/{id}. Null when the person has no customer record yet. */
  customerId: string | null;
  provider: string;
  status: string;
  lastStatus: string | null;
  appliedAt: string | null;
  appliedLender: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; fullName: string | null; phone: string | null } | null;
}

interface Payload {
  rows: Referral[];
  byStatus: { status: string; count: number }[];
}

// Yubi (YMPL) statuses are the partner's own raw codes, not the admin's standard
// vocabulary, so map each to a tone-carrying keyword (StatusBadge derives its colour
// from statusTone(tone)) while keeping the partner's label — the same keyword-tone
// trick the Revasure / downloads pages use for non-standard statuses.
//   OFFER_GENERATED / NEW_LEAD → in-progress (blue), APPROVED / DISBURSED → green,
//   REJECT* → red, everything else → neutral (grey, via the raw status).
function yubiTone(status: string): string {
  const s = status.toUpperCase();
  if (s.includes('APPROV')) return 'approved';
  if (s.includes('DISBURS')) return 'disbursed';
  if (s.includes('REJECT')) return 'rejected';
  if (s.includes('FAIL')) return 'failed';
  if (s.includes('OFFER') || s.includes('NEW_LEAD') || s.includes('LEAD')) return 'in_progress';
  return status;
}

function YubiStatus({ status }: { status: string }) {
  return <StatusBadge status={yubiTone(status)} label={yubiStatusLabel(status)} />;
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'NEW_LEAD', label: 'New lead' },
  { key: 'OFFER_GENERATED', label: 'Offer generated' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'DISBURSED', label: 'Disbursed' },
  { key: 'REJECTED', label: 'Rejected' },
];

const FILTER_LABELS: FilterLabels = {
  status: { name: 'status', value: yubiStatusLabel },
  search: { name: 'search' },
  from: { name: 'applied from', value: dayLabel },
  to: { name: 'applied to', value: dayLabel },
};

export default function YubiPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [role, setRole] = useState<string | undefined>(undefined);
  useEffect(() => { setRole(getAdmin()?.role || undefined); }, []);

  const debouncedSearch = useDebounced(search.trim(), 350);
  const searchPending = search.trim() !== debouncedSearch;
  const rangeProblem = dateRangeProblem(fromDay, toDay);

  // Only referrals the customer actually applied to are listed (applied=1).
  const filters = useMemo<Record<string, string>>(() => {
    const f: Record<string, string> = { applied: '1' };
    if (status) f.status = status;
    if (debouncedSearch) f.search = debouncedSearch;
    const from = dayBoundIso(fromDay, 'start');
    const to = dayBoundIso(toDay, 'end');
    if (from) f.from = from;
    if (to) f.to = to;
    return f;
  }, [status, debouncedSearch, fromDay, toDay]);

  const qs = buildListQuery({ ...filters, page, pageSize: 20 });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/yubi?${qs}`, swrFetcher);
  const p = data?.data as Payload | undefined;
  const pg = data?.pagination;
  const rows = p?.rows ?? [];

  const count = (s: string) => p?.byStatus.find((b) => b.status === s)?.count ?? 0;
  const described = describeFilters({ status, search: debouncedSearch, from: fromDay, to: toDay }, FILTER_LABELS);
  const filtered = Boolean(status || search.trim() || fromDay || toDay);

  const reset = () => { setStatus(''); setSearch(''); setFromDay(''); setToDay(''); setPage(1); };
  const setFilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const pickStatus = (s: string) => { setStatus((cur) => (cur === s ? '' : s)); setPage(1); };

  const narrowed = Boolean(debouncedSearch || fromDay || toDay);
  const rejected = count('REJECTED');
  const STATS: { key: string; label: string; tone?: string }[] = [
    { key: 'NEW_LEAD', label: 'New lead' },
    { key: 'OFFER_GENERATED', label: 'Offer generated' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'DISBURSED', label: 'Disbursed' },
    { key: 'REJECTED', label: 'Rejected', tone: rejected > 0 ? 'red' : undefined },
  ];

  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Yubi Referrals</h1>
          <p className="page-sub">Customers who applied to a Yubi (YMPL) Markets partner, with the latest status the partner reported.</p>
        </div>
        <ListActions kind="yubi" filters={filters} total={searchPending || isLoading ? undefined : pg?.total} filterSummary={described} role={role} />
      </div>

      <Callout tone="blue">This list shows customers who applied to a Yubi partner. Customers who only saw an offer are not included.</Callout>

      <Card className="mt-16">
        {isLoading && !p ? <div className="skeleton" style={{ height: 58 }} aria-busy="true" /> : (
          <div className="adm-stats" role="group" aria-label="Filter by status">
            {STATS.map((s) => (
              <button key={s.key} type="button" className="adm-stat-btn" aria-pressed={status === s.key} onClick={() => pickStatus(s.key)}>
                <Stat label={s.label} value={num(count(s.key))} tone={s.tone} foot={narrowed ? 'for this search and date range' : 'applied through Yubi'} />
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
                aria-label="Search referrals"
                placeholder="Search by customer or mobile"
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
            <label className="adm-field adm-field-date">
              <span>Applied from</span>
              <input type="date" className="input" value={fromDay} max={toDay || undefined} aria-describedby={rangeProblem ? 'yubi-range-msg' : undefined} onChange={(e) => setFilter(setFromDay)(e.target.value)} />
            </label>
            <label className="adm-field adm-field-date">
              <span>Applied to</span>
              <input type="date" className="input" value={toDay} min={fromDay || undefined} aria-describedby={rangeProblem ? 'yubi-range-msg' : undefined} onChange={(e) => setFilter(setToDay)(e.target.value)} />
            </label>
            {filtered && <button type="button" className="adm-link-btn" onClick={reset}>Clear filters</button>}
          </div>
          {rangeProblem && <p className="adm-fieldmsg" id="yubi-range-msg" role="alert">{rangeProblem}</p>}

          <div className="adm-chips" role="group" aria-label="Filter by status">
            <FilterChips options={STATUS_FILTERS} value={status} onChange={setFilter(setStatus)} />
          </div>

          <ExportNote />
          <p className="adm-resultline" aria-live="polite">
            {pg && !error ? resultLine(pg.total, 'referral', 'referrals', described) : ''}
          </p>

          {error ? (
            <ListError what="Yubi referrals" error={error} onRetry={() => mutate()} />
          ) : isLoading ? (
            <div aria-busy="true"><TableSkeleton rows={8} cols={5} /></div>
          ) : rows.length === 0 ? (
            <ListEmpty
              filtered={filtered}
              filteredText="No referrals match these filters."
              noneTitle="No customers have applied through Yubi yet."
              onClear={reset}
            />
          ) : (
            <div className="table-wrap"><table className="data adm-table">
              <thead><tr><th>Customer</th><th>Applied lender</th><th>Status</th><th>Applied</th><th className="adm-hide-narrow"><span className="adm-sr">Open customer</span></th></tr></thead>
              <tbody>{rows.map((r) => {
                const name = r.user?.fullName || 'Unknown';
                const cell = (
                  <>
                    <div className="adm-name">{name}</div>
                    <div className="adm-sub mono">{r.user?.phone || '—'}</div>
                  </>
                );
                return (
                  <tr key={r.id} style={{ cursor: 'default' }}>
                    <td data-label="Customer">
                      {r.customerId
                        ? <Link className="adm-cell-link" href={`/customers/${r.customerId}`}>{cell}</Link>
                        : <div>{cell}</div>}
                    </td>
                    <td data-label="Applied lender">{r.appliedLender || 'Yubi Markets partner'}</td>
                    <td data-label="Status"><YubiStatus status={r.lastStatus || r.status} /></td>
                    <td data-label="Applied">
                      <div>
                        <div>{dateTimeStr(r.appliedAt)}</div>
                        <div className="adm-sub">{timeAgo(r.appliedAt)}</div>
                      </div>
                    </td>
                    <td data-label="" className="adm-hide-narrow">
                      {r.customerId && <Link className="btn adm-btn-sm" href={`/customers/${r.customerId}`}>Open customer</Link>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
          {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
        </Card>
      </div>
    </div>
  );
}
