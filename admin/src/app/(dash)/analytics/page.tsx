'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, FilterChips, TableSkeleton } from '@/components/ui';
import { TrendArea, CategoryBar, DonutChart } from '@/components/charts';

interface Charts {
  timeseries: { date: string; applications: number; disbursals: number; disbursedPaise: number }[];
  leadsBySource: { source: string; count: number }[];
  applicationsByType: { type: string; count: number }[];
}

export default function AnalyticsPage() {
  const [days, setDays] = useState('14');
  const { data, isLoading } = useSWR(`/api/admin/dashboard/charts?days=${days}`, swrFetcher);
  const c = data?.data as Charts | undefined;

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
    </div>
  );
}
