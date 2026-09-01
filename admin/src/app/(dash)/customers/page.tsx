'use client';
// The single people list. "Leads" used to be a second list of the same humans;
// Customer is the superset (every lead resolves to one, but a phone-in customer
// never had a lead), so this is now the only list and /leads redirects here.
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, downloadFile } from '@/lib/api';
import { Card, Stat, Select, StatusBadge, SearchBox, Pagination, TableSkeleton } from '@/components/ui';
import { dateStr, timeAgo, num, inrRupees } from '@/lib/format';
import { STAGES, stageLabel, stalledLabel } from '@/components/journey';

const SOURCES = [
  { key: '', label: 'All sources' }, { key: 'website', label: 'Website' }, { key: 'campaign', label: 'Campaign' },
  { key: 'app', label: 'App' }, { key: 'voice', label: 'Voice' }, { key: 'referral', label: 'Referral' },
];

interface CustomerRow {
  id: string; name?: string | null; phone?: string | null; email?: string | null; city?: string | null;
  firstSource?: string | null; campaignId?: string | null; currentStage: string; stageEnteredAt?: string | null;
  lastActivityAt?: string | null; stalledMinutes?: number | null;
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

export default function CustomersPage() {
  const router = useRouter();
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({
    page: String(page), pageSize: '25',
    ...(stage ? { stage } : {}), ...(source ? { source } : {}),
    ...(campaignId ? { campaignId } : {}), ...(search ? { search } : {}),
  });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/customers?${qs.toString()}`, swrFetcher);
  const rows = asArray<CustomerRow>(data?.data);
  const pg = data?.pagination;

  // campaign picker options — reuse the campaigns list endpoint
  const { data: campRes } = useSWR('/api/admin/campaigns?page=1&pageSize=100', swrFetcher);
  const campaigns = asArray<{ id: string; name: string; code: string }>(campRes?.data);
  const campaignName = useMemo(() => new Map(campaigns.map((x) => [x.id, x.name])), [campaigns]);

  const reset = () => { setStage(''); setSource(''); setCampaignId(''); setSearch(''); setPage(1); };

  // Page-scoped roll-ups — the labels say "of the N shown" so a total that only
  // covers this page is never read as a total across every customer.
  const stalledCount = rows.filter((r) => (r.stalledMinutes ?? 0) > 60).length;
  const requestedTotal = rows.reduce((sum, r) => sum + (r.loanAmount ?? 0), 0);
  const callsTotal = rows.reduce((sum, r) => sum + (r.callCount ?? 0), 0);

  // CSV export mirrors the filters the table is showing (the endpoint supports
  // stage / source / campaignId only — search and stalled stay UI-side).
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');
  async function exportCsv() {
    setExporting(true); setExportErr('');
    try {
      const eq = new URLSearchParams({
        ...(stage ? { stage } : {}), ...(source ? { source } : {}), ...(campaignId ? { campaignId } : {}),
      });
      const suffix = eq.toString() ? `?${eq.toString()}` : '';
      await downloadFile(`/api/admin/ops/export/customers.csv${suffix}`, `customers-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setExportErr((e as Error).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const filtered = Boolean(stage || source || campaignId || search);

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
        <div className="row" style={{ gap: 10 }}>
          {exportErr && <span style={{ fontSize: 12, color: 'var(--red)' }}>{exportErr}</span>}
          <button className="btn" disabled={exporting} onClick={exportCsv}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
        </div>
      </div>

      {/* the numbers an operator acts on, in one card */}
      <Card className="mt-16">
        {isLoading ? <div className="skeleton" style={{ height: 58 }} /> : (
          <div className="stat-strip">
            <Stat label="Customers" value={num(pg?.total ?? rows.length)}
              foot={filtered ? 'matching these filters' : 'known in total'} />
            <Stat label="Requested" value={requestedTotal ? inrRupees(requestedTotal) : '—'}
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
        {/* one toolbar: search first (what people reach for), then the three
            narrowing filters, then a reset that only exists when it can do
            something. The inactivity chips lived here and are gone. */}
        <div className="toolbar">
          <div className="toolbar-search">
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone or email…" />
          </div>
          <div style={{ width: 176 }}>
            <Select
              value={stage}
              onChange={(v) => { setStage(v); setPage(1); }}
              options={[{ value: '', label: 'All stages' }, ...STAGES.map((x) => ({ value: x.key, label: x.label }))]}
            />
          </div>
          <div style={{ width: 150 }}>
            <Select
              value={source}
              onChange={(v) => { setSource(v); setPage(1); }}
              options={SOURCES.map((x) => ({ value: x.key, label: x.label }))}
            />
          </div>
          <div style={{ width: 176 }}>
            <Select
              value={campaignId}
              onChange={(v) => { setCampaignId(v); setPage(1); }}
              options={[{ value: '', label: 'All campaigns' }, ...campaigns.map((x) => ({ value: x.id, label: x.name }))]}
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
                        <div style={{ fontWeight: 600 }}>{c.name || <span className="muted">Unknown</span>}</div>
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
                        title={c.stageEnteredAt ? `in this stage since ${dateStr(c.stageEnteredAt)}` : undefined}
                      >
                        {st == null ? 'just arrived' : `here ${stalledLabel(st)}`}
                      </span>
                    </div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {c.loanAmount ? inrRupees(c.loanAmount) : <span className="muted">—</span>}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {calls ? num(calls) : <span className="muted">0</span>}
                  </td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12.5 }}>
                    {c.lastActivityAt ? timeAgo(c.lastActivityAt) : '—'}
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
