'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, FilterChips, TableSkeleton, StatCard } from '@/components/ui';
import { TrendArea, CategoryBar, DonutChart } from '@/components/charts';

interface Charts {
  timeseries: { date: string; applications: number; disbursals: number; disbursedPaise: number }[];
  leadsBySource: { source: string; count: number }[];
  applicationsByType: { type: string; count: number }[];
}

interface DropOff {
  idleMinutes: number;
  droppedTotal: number;
  totalSessions: number;
  dropOffRate: number;
  topDropScreen: { screen: string; label: string; count: number; pctOfDropped: number } | null;
  byScreen: { screen: string; label: string; count: number; pctOfDropped: number }[];
}

export default function AnalyticsPage() {
  const [days, setDays] = useState('14');
  const { data, isLoading } = useSWR(`/api/admin/dashboard/charts?days=${days}`, swrFetcher);
  const c = data?.data as Charts | undefined;

  const [idle, setIdle] = useState('30');
  const { data: dropData, isLoading: dropLoading } = useSWR(`/api/admin/analytics/dropoff?idleMinutes=${idle}`, swrFetcher);
  const d = dropData?.data as DropOff | undefined;

  return (
    <div className="page">
      <div className="row between wrap">
        <div><h1 className="page-title">Analytics</h1><p className="page-sub">Trends over time, lead sources, and product mix.</p></div>
        <FilterChips options={[{ key: '7', label: '7d' }, { key: '14', label: '14d' }, { key: '30', label: '30d' }, { key: '90', label: '90d' }]} value={days} onChange={setDays} />
      </div>

      <Card title="Applications vs disbursals" sub="Daily volume over the selected window" className="">
        {isLoading || !c ? <TableSkeleton rows={6} /> : <TrendArea data={c.timeseries} />}
      </Card>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Leads by source">{c ? <DonutChart data={c.leadsBySource} nameKey="source" valueKey="count" /> : <TableSkeleton rows={4} cols={2} />}</Card>
        <Card title="Applications by product">{c ? <CategoryBar data={c.applicationsByType} xKey="type" yKey="count" /> : <TableSkeleton rows={4} cols={2} />}</Card>
      </div>

      {/* ── Drop-off: where users abandon the app ── */}
      <div className="row between wrap" style={{ marginTop: 28 }}>
        <div><h2 className="page-title" style={{ fontSize: 20 }}>Drop-off by screen</h2><p className="page-sub">The screen users were last on before abandoning (no completion, idle past the window).</p></div>
        <FilterChips options={[{ key: '5', label: 'idle 5m' }, { key: '30', label: '30m' }, { key: '60', label: '60m' }, { key: '1440', label: '1d' }]} value={idle} onChange={setIdle} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 4 }}>
        <StatCard label="Drop-off rate" value={d ? `${d.dropOffRate}%` : '—'} tone="red" foot={d ? `${d.droppedTotal} of ${d.totalSessions} sessions` : undefined} />
        <StatCard label="Top drop-off screen" value={d?.topDropScreen ? d.topDropScreen.label : '—'} tone="amber" foot={d?.topDropScreen ? `${d.topDropScreen.count} sessions · ${d.topDropScreen.pctOfDropped}% of drops` : undefined} />
        <StatCard label="Sessions tracked" value={d ? d.totalSessions : '—'} tone="blue" foot={d ? `${d.idleMinutes}m idle threshold` : undefined} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Where users drop off" sub="Sessions abandoned on each screen">
          {dropLoading || !d ? <TableSkeleton rows={6} /> : d.byScreen.length === 0 ? <p className="page-sub">No drop-offs recorded yet.</p> : <CategoryBar data={d.byScreen as unknown as Record<string, unknown>[]} xKey="label" yKey="count" />}
        </Card>
        <Card title="Drop-off ranking">
          {dropLoading || !d ? <TableSkeleton rows={6} cols={3} /> : (
            <table className="data">
              <thead><tr><th>Screen</th><th style={{ textAlign: 'right' }}>Sessions</th><th style={{ textAlign: 'right' }}>% of drops</th></tr></thead>
              <tbody>
                {d.byScreen.map((r) => (
                  <tr key={r.screen}><td>{r.label}</td><td style={{ textAlign: 'right' }}>{r.count}</td><td style={{ textAlign: 'right' }}>{r.pctOfDropped}%</td></tr>
                ))}
                {d.byScreen.length === 0 && <tr><td colSpan={3} className="page-sub">No drop-offs recorded yet.</td></tr>}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
