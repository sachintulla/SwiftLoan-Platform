'use client';
// The single people list. "Leads" used to be a second list of the same humans;
// Customer is the superset (every lead resolves to one, but a phone-in customer
// never had a lead), so this is now the only list and /leads redirects here.
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, downloadFile, getAdmin } from '@/lib/api';
import { Card, Stat, Select, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton } from '@/components/ui';
import { dateTimeStr, timeAgo, num, inr } from '@/lib/format';
import { STAGES, stageLabel, stalledLabel } from '@/components/journey';
import { PERIODS, computeRange } from '@/lib/period';
import {
  parseCustomerFilters, serialiseCustomerFilters, hasCustomerFilters, customerListQuery, customerExportQuery,
  stalledOptionsFor, canExport, type CustomerFilters,
} from '@/lib/customerFilters';

const SOURCES = [
  { key: '', label: 'All sources' }, { key: 'website', label: 'Website' }, { key: 'campaign', label: 'Campaign' },
  { key: 'app', label: 'App' }, { key: 'voice', label: 'Voice' }, { key: 'referral', label: 'Referral' },
];

interface CustomerRow {
  id: string; name?: string | null; phone?: string | null; email?: string | null; city?: string | null;
  firstSource?: string | null; campaignId?: string | null; currentStage: string; stageEnteredAt?: string | null;
  lastActivityAt?: string | null; stalledMinutes?: number | null; createdAt?: string | null;
  /** Phone legs only — website-widget and app chats are not calls. */
  callCount?: number | null;
  /** Their most recent application amount, in rupees. */
  loanAmount?: number | null;
}

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
  const { stage, source, campaignId, search, stalledMinutes, period, from: cFrom, to: cTo } = filters;
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

  // campaign picker options — reuse the campaigns list endpoint
  const { data: campRes } = useSWR('/api/admin/campaigns?page=1&pageSize=100', swrFetcher);
  const campaigns = asArray<{ id: string; name: string; code: string }>(campRes?.data);
  const campaignName = useMemo(() => new Map(campaigns.map((x) => [x.id, x.name])), [campaigns]);

  const reset = () => { setFilters(parseCustomerFilters('')); setPage(1); };

  // Page-scoped roll-ups — the labels say "of the N shown" so a total that only
  // covers this page is never read as a total across every customer.
  const stalledCount = rows.filter((r) => (r.stalledMinutes ?? 0) > 60).length;
  const requestedTotal = rows.reduce((sum, r) => sum + (r.loanAmount ?? 0), 0);
  const callsTotal = rows.reduce((sum, r) => sum + (r.callCount ?? 0), 0);

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
      <div className="row between wrap" style={{ gap: 12 }}>
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">
            Every person across website enquiries, campaigns, voice and the app — one row each, with where they are,
            how long they have been stuck and everything we have ever said to them.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
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

      {/* the numbers an operator acts on, in one card */}
      <Card className="mt-16">
        {isLoading ? <div className="skeleton" style={{ height: 58 }} /> : (
          <div className="stat-strip">
            <Stat label="Customers" value={num(pg?.total ?? rows.length)}
              foot={filtered ? 'matching these filters' : 'known in total'} />
            <Stat label="Requested" value={requestedTotal ? inr(requestedTotal) : '—'}
              tone={requestedTotal ? undefined : 'text-faint'}
              foot={`applied for across the ${num(rows.length)} shown`} />
            <Stat label="Calls placed" value={num(callsTotal)} tone={callsTotal ? undefined : 'text-faint'}
              foot={`to the ${num(rows.length)} shown`} />
            <Stat label="Inactive over an hour" value={num(stalledCount)} tone={stalledCount > 0 ? 'amber' : undefined}
              foot="no app or website activity — these are the ones to call" />
          </div>
        )}
      </Card>

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
          <div style={{ width: 176 }}>
            <Select
              value={stage}
              onChange={(v) => change({ stage: v })}
              options={[{ value: '', label: 'All stages' }, ...STAGES.map((x) => ({ value: x.key, label: x.label }))]}
            />
          </div>
          <div style={{ width: 150 }}>
            <Select
              value={source}
              onChange={(v) => change({ source: v })}
              options={SOURCES.map((x) => ({ value: x.key, label: x.label }))}
            />
          </div>
          <div style={{ width: 176 }}>
            <Select
              value={campaignId}
              onChange={(v) => change({ campaignId: v })}
              options={[{ value: '', label: 'All campaigns' }, ...campaigns.map((x) => ({ value: x.id, label: x.name }))]}
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
          {filtered && <button className="btn" onClick={reset}>Clear</button>}
        </div>

        {error ? (
          <div className="empty">Could not load customers — {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading ? <TableSkeleton rows={8} cols={7} /> : rows.length === 0 ? (
          <div className="empty-state">
            <h3>{filtered ? 'No customers match these filters' : 'No customers yet'}</h3>
            <p>
              {filtered
                ? 'Nothing in this slice. Widen the stage, source or inactivity filter to see more people.'
                : 'People appear here the moment they enquire on the website, get dialled by a campaign, or open the app.'}
            </p>
            {filtered && <button className="btn" onClick={reset}>Clear filters</button>}
          </div>
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Customer</th><th>Email</th><th>Location</th><th>Stage</th>
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
                          {/* a campaign keeps its own casing; only the bare
                              source word ("app", "website") gets capitalised */}
                          {c.campaignId ? (
                            <span>{campaignName.get(c.campaignId) ?? 'Campaign'}</span>
                          ) : (
                            <span style={{ textTransform: 'capitalize' }}>{c.firstSource || 'unknown'}</span>
                          )}
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
                      <StatusBadge status={c.currentStage} label={stageLabel(c.currentStage)} />
                      <span
                        style={{ fontSize: 11.5, color: (st ?? 0) > 1440 ? 'var(--red)' : (st ?? 0) > 60 ? 'var(--amber)' : 'var(--text-faint)' }}
                        title={c.stageEnteredAt ? `in this stage since ${dateTimeStr(c.stageEnteredAt)}` : undefined}
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
