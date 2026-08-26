'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { StatCard, Card, TableSkeleton, FilterChips } from '@/components/ui';
import { FunnelChart, PipelineBar, LiveFeed, ActiveUsers, FunnelStage, FeedEvent, ActiveUser } from '@/components/viz';
import { TrendArea, CategoryBar, DonutChart } from '@/components/charts';
import { inrCompact, num, pct } from '@/lib/format';

interface Overview {
  stats: { totalUsers: number; totalApplications: number; activeLoans: number; totalLeads: number; totalDownloads: number; totalDisbursedPaise: number; outstandingPaise: number; approvedCount: number; applicationToDisbursalPct: number };
  funnel: FunnelStage[];
  applicationsByStatus: Record<string, number>;
  lenderApplicationsByStatus?: Record<string, number>;
}

interface Charts {
  timeseries: { date: string; applications: number; disbursals: number; disbursedPaise: number }[];
  leadsBySource: { source: string; count: number }[];
  applicationsByType: { type: string; count: number }[];
}

export default function OverviewPage() {
  const [days, setDays] = useState('14');
  const { data, isLoading } = useSWR('/api/admin/dashboard/overview', swrFetcher, { refreshInterval: 15000 });
  const { data: feed } = useSWR('/api/admin/live-feed?limit=40', swrFetcher, { refreshInterval: 8000 });
  const { data: activeRes } = useSWR('/api/admin/active-users?limit=15', swrFetcher, { refreshInterval: 10000 });
  // Trends are a separate, slower query — it takes a day range and must not be
  // dragged into the 15s live-refresh above.
  const { data: chartsRes, isLoading: chartsLoading } =
    useSWR(`/api/admin/dashboard/charts?days=${days}`, swrFetcher);

  const o = data?.data as Overview | undefined;
  const c = chartsRes?.data as Charts | undefined;
  const events = (feed?.data ?? []) as FeedEvent[];
  const activeUsers = (activeRes?.data ?? []) as ActiveUser[];

  return (
    <div className="page">
      <h1 className="page-title">Master Overview</h1>
      <p className="page-sub">Live snapshot of the loan funnel — leads, applications, and disbursals.</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 18 }}>
        {isLoading || !o ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="stat"><div className="skeleton" style={{ height: 46 }} /></div>)
        ) : (
          <>
            <StatCard label="Total Applications" value={num(o.stats.totalApplications)} icon="₹" tone="blue" foot={`${num(o.stats.approvedCount)} approved`} />
            <StatCard label="Active Loans" value={num(o.stats.activeLoans)} icon="◉" tone="green" foot={`${inrCompact(o.stats.outstandingPaise)} outstanding`} />
            <StatCard label="Total Disbursed" value={inrCompact(o.stats.totalDisbursedPaise)} icon="⬆" tone="teal" foot="lifetime" />
            <StatCard label="Leads" value={num(o.stats.totalLeads)} icon="✦" tone="amber" foot={`${num(o.stats.totalDownloads)} app installs`} />
            <StatCard label="App → Disbursal" value={pct(o.stats.applicationToDisbursalPct)} icon="↗" tone="grey" foot="conversion" />
          </>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Recently active users" sub="Who's using the app right now — newest first, with phone & OS. Tap to open their profile." right={<span className="row" style={{ gap: 6, fontSize: 12 }}><span className="dot-live" /> live</span>}>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}><ActiveUsers users={activeUsers} /></div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Conversion funnel" sub="8-stage journey from first session to disbursal">
          {!o ? <TableSkeleton rows={8} cols={3} /> : <FunnelChart stages={o.funnel} />}
        </Card>
        <Card title="Recent activity" sub="Newest first, grouped by day — tap any event for details" right={<span className="row" style={{ gap: 6, fontSize: 12 }}><span className="dot-live" /> live</span>}>
          <div style={{ maxHeight: 440, overflowY: 'auto' }}><LiveFeed events={events} /></div>
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Application pipeline" sub="Parent applications by stage (one per customer application)">
          {o ? <PipelineBar byStatus={o.applicationsByStatus} /> : <TableSkeleton rows={1} cols={6} />}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Lender application pipeline" sub="Per-lender applications after submission — one customer can appear under several lenders">
          {o ? <PipelineBar byStatus={o.lenderApplicationsByStatus ?? {}} /> : <TableSkeleton rows={1} cols={6} />}
        </Card>
      </div>

      {/* Trends — formerly the separate Analytics page. The stats above answer
          "where are we now"; this answers "how did we get here". Two nav entries
          for one question was one too many. */}
      <div className="row between wrap" style={{ marginTop: 28 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 20 }}>Trends</h2>
          <p className="page-sub">Volume over time, lead sources, and product mix.</p>
        </div>
        <FilterChips
          options={[{ key: '7', label: '7d' }, { key: '14', label: '14d' }, { key: '30', label: '30d' }, { key: '90', label: '90d' }]}
          value={days}
          onChange={setDays}
        />
      </div>

      {/* `.card` carries no margin of its own and `.page` has no gap, so every
          card needs an explicit marginTop — without it this sat flush against
          the Trends heading. */}
      <div style={{ marginTop: 16 }}>
        <Card title="Applications vs disbursals" sub="Daily volume over the selected window">
          {chartsLoading || !c ? <TableSkeleton rows={6} /> : <TrendArea data={c.timeseries} />}
        </Card>
      </div>

      {/* auto-fit rather than a hard 1fr 1fr: with the sidebar taking 240px, two
          fixed columns squash the donut and the bar chart on a laptop. */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16, alignItems: 'start' }}>
        <Card title="Leads by source">
          {c ? <DonutChart data={c.leadsBySource} nameKey="source" valueKey="count" /> : <TableSkeleton rows={4} cols={2} />}
        </Card>
        <Card title="Applications by product">
          {c ? <CategoryBar data={c.applicationsByType} xKey="type" yKey="count" /> : <TableSkeleton rows={4} cols={2} />}
        </Card>
      </div>
    </div>
  );
}
