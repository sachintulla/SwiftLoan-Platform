'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, downloadFile } from '@/lib/api';
import { Card, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { dateStr, timeAgo } from '@/lib/format';
import { STAGES, stageLabel, stalledLabel } from '@/components/journey';

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
  const rows = (data?.data ?? []) as CustomerRow[];
  const pg = data?.pagination;

  // campaign picker options — reuse the campaigns list endpoint
  const { data: campRes } = useSWR('/api/admin/campaigns?page=1&pageSize=100', swrFetcher);
  const campaigns = (campRes?.data ?? []) as { id: string; name: string; code: string }[];

  const reset = () => { setStage(''); setSource(''); setCampaignId(''); setStalledMinutes(''); setSearch(''); setPage(1); };

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
          <h1 className="page-title">Customers 360</h1>
          <p className="page-sub">Every person across website, campaigns and the app — unified, with where they are and how long they have been stuck.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {exportErr && <span style={{ fontSize: 12, color: 'var(--red)' }}>{exportErr}</span>}
          <button className="btn" disabled={exporting} onClick={exportCsv}>{exporting ? 'Exporting…' : '⭳ Export CSV'}</button>
        </div>
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
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name or phone…" />
          </div>
          {/* drop-off filter is first-class: this is the whole point of the view */}
          <div className="row wrap between" style={{ gap: 12 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Stalled for</span>
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
          <Empty label="No customers match these filters" />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Name</th><th>Phone</th><th>Origin</th><th>Current stage</th><th>In stage since</th><th>Stalled</th><th>Last activity</th></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)}>
                <td>{c.name || <span className="muted">Unknown</span>}</td>
                <td className="mono">{c.phone || '—'}</td>
                <td><span className="badge tone-grey">{c.firstSource || 'unknown'}{c.campaignId ? ' · campaign' : ''}</span></td>
                <td><StatusBadge status={c.currentStage} label={stageLabel(c.currentStage)} /></td>
                <td className="muted">{c.stageEnteredAt ? dateStr(c.stageEnteredAt) : '—'}</td>
                <td className="mono" style={{ color: (c.stalledMinutes ?? 0) > 1440 ? 'var(--red)' : (c.stalledMinutes ?? 0) > 60 ? 'var(--amber)' : undefined }}>
                  {stalledLabel(c.stalledMinutes)}
                </td>
                <td className="muted">{c.lastActivityAt ? timeAgo(c.lastActivityAt) : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
      </div>
    </div>
  );
}
