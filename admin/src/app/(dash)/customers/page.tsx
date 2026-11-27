'use client';
// The single people list. "Leads" used to be a second list of the same humans;
// Customer is the superset (every lead resolves to one, but a phone-in customer
// never had a lead), so this is now the only list and /leads redirects here.
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, downloadFile, getAdmin } from '@/lib/api';
import { Card, StatCard, Select, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton } from '@/components/ui';
import { dateTimeStr, timeAgo, num, inr } from '@/lib/format';
import { stageLabel, stalledLabel } from '@/components/journey';
import { PERIODS, computeRange } from '@/lib/period';
import {
  parseCustomerFilters, serialiseCustomerFilters, hasCustomerFilters, customerListQuery, customerExportQuery, customerFilterParams,
  stalledOptionsFor, canExport, type CustomerFilters,
} from '@/lib/customerFilters';

const SOURCES = [
  { key: '', label: 'All sources' }, { key: 'website', label: 'Website' },
  { key: 'app', label: 'App' }, { key: 'voice', label: 'Voice' },
];

interface CustomerRow {
  id: string; name?: string | null; phone?: string | null; email?: string | null; city?: string | null;
  firstSource?: string | null; campaignId?: string | null; currentStage: string; stageEnteredAt?: string | null;
  lastActivityAt?: string | null; stalledMinutes?: number | null; createdAt?: string | null;
  /** Phone legs only — website-widget and app chats are not calls. */
  callCount?: number | null;
  /** Their most recent application amount, in rupees. */
  loanAmount?: number | null;
  /** Where they really are, read from stored data by the server (lib/customerStatus.ts). */
  status?: CustomerStatus | null;
}

interface CustomerStatus { key: string; label: string; tone: string; detail?: string | null }
/** People counted once, by the server's shared rules (lib/peopleMetrics.ts). */
interface PeopleMetrics {
  total: number; checked: number; checkedPct: number; gotOffers: number; gotOffersPct: number; noOffers: number; noOffersPct: number;
  tappedApply: number; tappedApplyPct: number; appliedLender: number; appliedLenderPct: number; rejected: number; rejectedPct: number;
}
interface StatusOption { key: string; label: string; count: number }

function asArray<T>(x: unknown): T[] {
  if (Array.isArray(x)) return x as T[];
  const items = (x as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

/** Two letters for the row avatar — a name if we have one, else the last two
 *  digits of the number, which is what an agent recognises a caller by. */
function initials(name?: string | null, phone?: string | null): string {
  const src = (name ?? '').trim();
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || src[0].toUpperCase();
  }
  return phone ? phone.slice(-2) : '?';
}

// useSearchParams needs a Suspense boundary or a production build fails on this
// page; the real page is below.
export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="page"><div className="skeleton" style={{ height: 58 }} /></div>}>
      <Customers />
    </Suspense>
  );
}

function Customers() {
  const router = useRouter();
  // Filters start from the address bar (stage, source, campaignId, search,
  // stalledMinutes, period) and are written back to it as they change, so a
  // filtered view survives a reload and /customers?stalledMinutes=60 (the old
  // Onboarding page's redirect) lands on the inactive customers.
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<CustomerFilters>(() => parseCustomerFilters(searchParams));
  const [page, setPage] = useState(1);
  const { status, source, search, stalledMinutes, period, from: cFrom, to: cTo, unverified } = filters;
  const change = (patch: Partial<CustomerFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  useEffect(() => {
    const q = serialiseCustomerFilters(filters);
    window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
  }, [filters]);

  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { setRole(getAdmin()?.role ?? null); }, []);
  const mayExport = canExport(role);

  const range = useMemo(() => computeRange(period, cFrom, cTo), [period, cFrom, cTo]);
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/customers?${customerListQuery(filters, range, page)}`, swrFetcher);
  const rows = asArray<CustomerRow>(data?.data);
  const pg = data?.pagination;

  // The status filter's choices, each with how many customers of the current slice (every other filter applied) are
  // in it. The list comes from the server, so the page can never offer a status the server does not know.
  const statusQuery = useMemo(() => customerFilterParams({ ...filters, status: '' }, range).toString(), [filters, range]);
  const { data: statusRes } = useSWR(`/api/admin/customers/statuses${statusQuery ? `?${statusQuery}` : ''}`, swrFetcher);
  const statusOptions = asArray<StatusOption>(statusRes?.data);

  const reset = () => { setFilters(parseCustomerFilters('')); setPage(1); };

  // The cards on top: all customers of the current slice (every filter except the status one), by status.
  // The card numbers come from the server's shared counting rules (lib/peopleMetrics.ts): the SAME numbers the Dashboard
  // shows. This page keeps no rule of its own about what "got offers", "applied" or "rejected" means.
  const { data: metricsRes } = useSWR(`/api/admin/customers/metrics${statusQuery ? `?${statusQuery}` : ''}`, swrFetcher);
  const cards = metricsRes?.data as PeopleMetrics | undefined;
  const otherFilters = hasCustomerFilters({ ...filters, status: '' });

  // CSV export follows every filter the table is showing: stage, source,
  // campaign, search, inactivity and the joined dates. Same builder as the list
  // (lib/customerFilters.ts), minus paging.
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');
  async function exportCsv() {
    setExporting(true); setExportErr('');
    try {
      const eq = customerExportQuery(filters, range);
      const suffix = eq ? `?${eq}` : '';
      await downloadFile(`/api/admin/ops/export/customers.csv${suffix}`, `customers-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setExportErr((e as Error).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const filtered = hasCustomerFilters(filters);

  return (
    <div className="page">
      {/* Six cards from the shared counting rules (server lib/peopleMetrics.ts), people counted once. "Checked eligibility"
          is a share of everyone here; the other shares are of the people who checked. They follow every filter except
          the status one. "Rejected" is a lender turning an application down: no offers is its own card. */}
      <div className="dash-cards-wrap" style={{ marginTop: 0 }}><div className="dash-cards">
        {!cards ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="stat"><div className="skeleton" style={{ height: 46 }} /></div>)
        ) : (
          <>
            <StatCard label={unverified ? 'Unverified numbers' : 'Total customers'} value={num(cards.total)} icon="◉" tone="teal"
              foot={otherFilters ? 'Matching these filters' : 'Everyone we know'} />
            <StatCard label="Checked eligibility" value={`${cards.checkedPct}%`} icon="▤" tone="blue"
              foot={`${num(cards.checked)} asked for offers`} />
            <StatCard label="Got offers" value={`${cards.gotOffersPct}%`} icon="★" tone="green"
              foot={`${num(cards.gotOffers)} of ${num(cards.checked)} who checked`} />
            <StatCard label="No offers" value={`${cards.noOffersPct}%`} icon="○" tone="amber"
              foot={`${num(cards.noOffers)} of ${num(cards.checked)} who checked`} />
            <StatCard label="Applied with a lender" value={`${cards.appliedLenderPct}%`} icon="➜" tone="teal"
              foot={`${num(cards.appliedLender)} confirmed by the lender · ${num(cards.tappedApply)} only tapped Apply`} />
            <StatCard label="Rejected by a lender" value={num(cards.rejected)} icon="✕" tone="red"
              foot={`Of ${num(cards.appliedLender)} who applied with a lender`} />
          </>
        )}
      </div></div>

      <div style={{ marginTop: 16 }}>
      <Card>
        {/* Joined date-range filter */}
        <div style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Joined</div>
          <FilterChips options={PERIODS} value={period} onChange={(v) => change({ period: v })} />
          {period === 'custom' && (
            <div className="row wrap" style={{ gap: 12, marginTop: 10, alignItems: 'center' }}>
              <label className="muted" style={{ fontSize: 13 }}>From&nbsp;
                <input type="date" value={cFrom} max={cTo || undefined} onChange={(e) => change({ from: e.target.value })} className="input" />
              </label>
              <label className="muted" style={{ fontSize: 13 }}>To&nbsp;
                <input type="date" value={cTo} min={cFrom || undefined} onChange={(e) => change({ to: e.target.value })} className="input" />
              </label>
            </div>
          )}
        </div>

        {/* one toolbar: search first (what people reach for), then the
            narrowing filters, then a reset that only exists when it can do
            something. "Inactive for" is the inactivity filter the old chips
            offered; it takes the same stalledMinutes the API already supports. */}
        <div className="toolbar">
          <div className="toolbar-search">
            <SearchBox value={search} onChange={(v) => change({ search: v })} placeholder="Search name, phone or email…" />
          </div>
          <div style={{ width: 230 }}>
            <Select
              value={status}
              onChange={(v) => change({ status: v })}
              options={[
                { value: '', label: 'All statuses' },
                // A status nobody is in is left out, unless it is the one picked (so the box never shows blank).
                ...statusOptions.filter((x) => x.count > 0 || x.key === status).map((x) => ({ value: x.key, label: `${x.label} (${num(x.count)})` })),
              ]}
            />
          </div>
          <div style={{ width: 150 }}>
            <Select
              value={source}
              onChange={(v) => change({ source: v })}
              options={SOURCES.map((x) => ({ value: x.key, label: x.label }))}
            />
          </div>
          <div style={{ width: 190 }}>
            <Select
              value={stalledMinutes}
              onChange={(v) => change({ stalledMinutes: v })}
              placeholder="Inactive for"
              options={stalledOptionsFor(stalledMinutes).map((o) => ({
                value: o.value,
                label: o.value ? `Inactive for ${o.label}` : 'Inactive for: any time',
              }))}
            />
          </div>
          {filters.active === 'today' && (
            <span
              className="row"
              style={{ gap: 6, fontSize: 12.5, padding: '5px 10px', borderRadius: 999, background: 'var(--surface-2, #eef5f4)', border: '1px solid var(--line, #dbe6e4)' }}
              title="Showing customers active since 12:00 AM IST today"
            >
              <span className="dot-live" /> Active today
              <button className="icon-btn" onClick={() => change({ active: '' })} aria-label="Clear active-today filter" style={{ border: 0, background: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </span>
          )}
          {filtered && <button className="btn" onClick={reset}>Clear</button>}
          {/* Export sits with the table it exports: the file follows every filter above. */}
          <div className="row" style={{ gap: 10, alignItems: 'center', marginLeft: 'auto' }}>
            {exportErr && <span role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{exportErr}</span>}
            {!mayExport && role !== null && (
              <span id="customers-export-note" className="muted" style={{ fontSize: 12 }}>Exports need an admin or super admin</span>
            )}
            <button
              className="btn"
              disabled={exporting || (role !== null && !mayExport)}
              aria-describedby={!mayExport && role !== null ? 'customers-export-note' : undefined}
              onClick={exportCsv}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="empty">Could not load customers — {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading ? <TableSkeleton rows={8} cols={7} /> : rows.length === 0 ? (
          <div className="empty-state">
            <h3>{unverified ? 'No unverified numbers match' : filtered ? 'No customers match these filters' : 'No customers yet'}</h3>
            <p>
              {filtered
                ? 'Nothing in this slice. Widen the status, source or inactivity filter to see more people.'
                : 'People appear here the moment they enquire on the website or open the app.'}
            </p>
            {filtered && <button className="btn" onClick={reset}>Clear filters</button>}
          </div>
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Customer</th><th>Email</th><th>Location</th><th>Status</th>
              <th style={{ textAlign: 'right' }}>Loan amount</th>
              <th style={{ textAlign: 'right' }}>Calls</th>
              <th style={{ textAlign: 'right' }}>Last activity</th>
              <th style={{ textAlign: 'right' }}>Joined</th>
            </tr></thead>
            <tbody>{rows.map((c) => {
              const st = c.stalledMinutes ?? null;
              const calls = c.callCount ?? 0;
              return (
                <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)}>
                  {/* name, number and where they came from identify one person */}
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="avatar-sm" aria-hidden>{initials(c.name, c.phone)}</span>
                      <div style={{ minWidth: 0 }}>
                        {/* a real link, so the row can be reached and opened from the keyboard; the row click stays as a mouse shortcut */}
                        <Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                          {c.name || <span className="muted">Unknown</span>}
                        </Link>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          <span className="mono">{c.phone || 'no phone'}</span>
                          {' · '}
                          <span style={{ textTransform: 'capitalize' }}>{c.firstSource || 'unknown'}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5, maxWidth: 220, overflowWrap: 'anywhere' }}>
                    {c.email || <span className="muted">—</span>}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{c.city || <span className="muted">—</span>}</td>
                  <td>
                    {/* justifyItems:start — a grid child stretches, which is why
                        this badge used to run the full width of the column */}
                    <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
                      {/* The real status from stored data; the journey stage is only the fallback for an older server. */}
                      {c.status
                        ? <span className={`badge tone-${c.status.tone}`}>{c.status.label}</span>
                        : <StatusBadge status={c.currentStage} label={stageLabel(c.currentStage)} />}
                      {c.status?.detail && <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{c.status.detail}</span>}
                      <span
                        style={{ fontSize: 11.5, color: (st ?? 0) > 1440 ? 'var(--red)' : (st ?? 0) > 60 ? 'var(--amber)' : 'var(--text-faint)' }}
                        title={st == null ? undefined : `no website or app activity for ${stalledLabel(st)}`}
                      >
                        {st == null ? 'just arrived' : `here ${stalledLabel(st)}`}
                      </span>
                    </div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {c.loanAmount ? inr(c.loanAmount) : <span className="muted">—</span>}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {calls ? num(calls) : <span className="muted">0</span>}
                  </td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12.5 }}>
                    {c.lastActivityAt ? timeAgo(c.lastActivityAt) : '—'}
                  </td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12.5 }}>
                    {dateTimeStr(c.createdAt)}
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
