'use client';
// The single people list. "Leads" used to be a second list of the same humans;
// Customer is the superset (every lead resolves to one, but a phone-in customer
// never had a lead), so this is now the only list and /leads redirects here.
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, downloadFile } from '@/lib/api';
import { Card, StatCard, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { dateStr, timeAgo, num } from '@/lib/format';
import { STAGES, stageLabel, stalledLabel } from '@/components/journey';
import { ChannelChips } from '@/components/conversation';

const SOURCES = [
  { key: '', label: 'All sources' }, { key: 'website', label: 'Website' }, { key: 'campaign', label: 'Campaign' },
  { key: 'app', label: 'App' }, { key: 'voice', label: 'Voice' }, { key: 'referral', label: 'Referral' },
];

const STALLED = [
  { key: '', label: 'Any' }, { key: '15', label: '> 15m' }, { key: '60', label: '> 1h' },
  { key: '1440', label: '> 1d' }, { key: '10080', label: '> 1w' },
];

interface CustomerRow {
  id: string; name?: string | null; phone?: string | null; firstSource?: string | null;
  campaignId?: string | null; currentStage: string; stageEnteredAt?: string | null;
  lastActivityAt?: string | null; stalledMinutes?: number | null;
}

/** Per-number conversation roll-up, joined in by phone. */
interface ConvRollup {
  phone?: string | null; city?: string | null; conversationCount?: number | null;
  channels?: string[] | null; channelLabels?: string[] | null; lastAt?: string | null;
}

function asArray<T>(x: unknown): T[] {
  if (Array.isArray(x)) return x as T[];
  const items = (x as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

const digits = (p?: string | null) => (p ?? '').replace(/\D/g, '');

export default function CustomersPage() {
  const router = useRouter();
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [stalledMinutes, setStalledMinutes] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({
    page: String(page), pageSize: '25',
    ...(stage ? { stage } : {}), ...(source ? { source } : {}),
    ...(campaignId ? { campaignId } : {}), ...(search ? { search } : {}),
    ...(stalledMinutes ? { stalledMinutes } : {}),
  });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/customers?${qs.toString()}`, swrFetcher);
  const rows = asArray<CustomerRow>(data?.data);
  const pg = data?.pagination;

  // campaign picker options — reuse the campaigns list endpoint
  const { data: campRes } = useSWR('/api/admin/campaigns?page=1&pageSize=100', swrFetcher);
  const campaigns = asArray<{ id: string; name: string; code: string }>(campRes?.data);

  // Conversation roll-ups are keyed by phone, not customer id, and there is no
  // bulk-by-phone lookup — so we pull the most recently active numbers once and
  // join locally. A number that is not in that window shows "—" (unknown),
  // never "none", because absence here is not evidence we have never spoken.
  const { data: convRes } = useSWR('/api/admin/conversations?page=1&pageSize=100', swrFetcher);
  const convByPhone = useMemo(() => {
    const m = new Map<string, ConvRollup>();
    for (const r of asArray<ConvRollup>(convRes?.data)) {
      const k = digits(r.phone);
      if (k) m.set(k, r);
    }
    return m;
  }, [convRes]);
  const convIndexed = convByPhone.size > 0;

  const reset = () => { setStage(''); setSource(''); setCampaignId(''); setStalledMinutes(''); setSearch(''); setPage(1); };

  const stalledCount = rows.filter((r) => (r.stalledMinutes ?? 0) > 60).length;
  const crossChannel = rows.filter((r) => {
    const c = convByPhone.get(digits(r.phone));
    return Array.isArray(c?.channels) && c!.channels!.length > 1;
  }).length;

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

  return (
    <div className="page">
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">
            Every person across website enquiries, campaigns, voice and the app — one row each, with where they are,
            how long they have been stuck and everything we have ever said to them.
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {exportErr && <span style={{ fontSize: 12, color: 'var(--red)' }}>{exportErr}</span>}
          <button className="btn" disabled={exporting} onClick={exportCsv}>{exporting ? 'Exporting…' : '⭳ Export CSV'}</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 18 }}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="stat"><div className="skeleton" style={{ height: 46 }} /></div>)
        ) : (
          <>
            <StatCard label="Customers" value={num(pg?.total ?? rows.length)} icon="◉" tone="blue"
              foot={stage || source || search || stalledMinutes || campaignId ? 'matching these filters' : 'known in total'} />
            <StatCard label="Inactive over an hour" value={num(stalledCount)} icon="⏱" tone={stalledCount > 0 ? 'amber' : 'green'}
              foot={`of the ${num(rows.length)} shown — these are the ones to call`} />
            <StatCard label="Cross-channel" value={convIndexed ? num(crossChannel) : '—'} icon="⇄" tone="teal"
              foot={convIndexed ? 'used more than one surface' : 'conversation index unavailable'} />
          </>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
      <Card>
        <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
          <div className="row between wrap" style={{ gap: 12 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <select className="input" style={{ width: 'auto', fontSize: 12.5 }} value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}>
                <option value="">All stages</option>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select className="input" style={{ width: 'auto', fontSize: 12.5 }} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
                {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select className="input" style={{ width: 'auto', fontSize: 12.5 }} value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setPage(1); }}>
                <option value="">All campaigns</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone or email…" />
          </div>
          {/* drop-off filter is first-class: this is the whole point of the view */}
          <div className="row wrap between" style={{ gap: 12 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Inactive for</span>
              <FilterChips options={STALLED} value={stalledMinutes} onChange={(v) => { setStalledMinutes(v); setPage(1); }} />
            </div>
            <button className="btn" onClick={reset}>Clear filters</button>
          </div>
        </div>

        {error ? (
          <div className="empty">Could not load customers — {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading ? <TableSkeleton rows={8} cols={7} /> : rows.length === 0 ? (
          <Empty label={stage || source || search || stalledMinutes || campaignId ? 'No customers match these filters' : 'No customers yet'} />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Name</th><th>Phone</th><th>City</th><th>Origin</th><th>Stage</th>
              <th>Conversations</th><th>Last activity</th>
            </tr></thead>
            <tbody>{rows.map((c) => {
              const conv = convByPhone.get(digits(c.phone));
              const n = conv?.conversationCount ?? null;
              const st = c.stalledMinutes ?? null;
              return (
                <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)}>
                  <td>{c.name || <span className="muted">Unknown</span>}</td>
                  <td className="mono">{c.phone || '—'}</td>
                  <td>{conv?.city || <span className="muted">—</span>}</td>
                  <td><span className="badge tone-grey">{c.firstSource || 'unknown'}{c.campaignId ? ' · campaign' : ''}</span></td>
                  <td>
                    <div style={{ display: 'grid', gap: 3 }}>
                      <StatusBadge status={c.currentStage} label={stageLabel(c.currentStage)} />
                      <span
                        className="mono"
                        style={{ fontSize: 11.5, color: (st ?? 0) > 1440 ? 'var(--red)' : (st ?? 0) > 60 ? 'var(--amber)' : 'var(--text-faint)' }}
                        title={c.stageEnteredAt ? `in this stage since ${dateStr(c.stageEnteredAt)}` : undefined}
                      >
                        {st == null ? '—' : `here ${stalledLabel(st)}`}
                      </span>
                    </div>
                  </td>
                  <td>
                    {!conv ? (
                      <span className="muted" title="Not in the recent conversation index — open the customer to check">—</span>
                    ) : n === 0 ? (
                      <span className="muted">never spoken</span>
                    ) : (
                      <div style={{ display: 'grid', gap: 3 }}>
                        <span className="mono" style={{ fontSize: 12 }}>{num(n)}</span>
                        <ChannelChips channels={conv.channels} labels={conv.channelLabels} />
                      </div>
                    )}
                  </td>
                  <td className="muted">{c.lastActivityAt ? timeAgo(c.lastActivityAt) : '—'}</td>
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
