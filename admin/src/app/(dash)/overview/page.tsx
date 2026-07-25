'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { StatCard, Card, TableSkeleton } from '@/components/ui';
import { FunnelChart, PipelineBar, LiveFeed, FunnelStage, FeedEvent } from '@/components/viz';
import { inrCompact, num, pct } from '@/lib/format';

interface Overview {
  stats: { totalUsers: number; totalApplications: number; activeLoans: number; totalLeads: number; totalDownloads: number; totalDisbursedPaise: number; outstandingPaise: number; approvedCount: number; applicationToDisbursalPct: number };
  funnel: FunnelStage[];
  applicationsByStatus: Record<string, number>;
}

export default function OverviewPage() {
  const { data, isLoading } = useSWR('/api/admin/dashboard/overview', swrFetcher, { refreshInterval: 15000 });
  const { data: feed } = useSWR('/api/admin/live-feed?limit=12', swrFetcher, { refreshInterval: 8000 });
  const o = data?.data as Overview | undefined;
  const events = (feed?.data ?? []) as FeedEvent[];

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

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Conversion funnel" sub="8-stage journey from first session to disbursal">
          {!o ? <TableSkeleton rows={8} cols={3} /> : <FunnelChart stages={o.funnel} />}
        </Card>
        <Card title="Live activity" sub="Most recent app + widget events" right={<span className="row" style={{ gap: 6, fontSize: 12 }}><span className="dot-live" /> live</span>}>
          <LiveFeed events={events} />
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Application pipeline" sub="Distribution across every funnel stage">
          {o ? <PipelineBar byStatus={o.applicationsByStatus} /> : <TableSkeleton rows={1} cols={6} />}
        </Card>
      </div>
    </div>
  );
}
