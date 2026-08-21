'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, TableSkeleton, FilterChips } from '@/components/ui';
import { StageCensus, TrackSteps, AttentionQueue, PipelineStage, TrackStep, AttentionItem } from '@/components/viz';
import { TrendArea, HBar } from '@/components/charts';
import { inrCompactR, num, pct, ageShort } from '@/lib/format';

/**
 * Master Overview.
 *
 * This page answers "where is the pipeline jammed and who needs chasing", not "how
 * big are we". The previous version led with five totals of which three were
 * structurally zero (active loans, disbursed, app→disbursal — nothing has ever been
 * disbursed), an eight-stage funnel whose conversion percentages were arithmetically
 * impossible, a one-bar bar chart, and a "live activity" feed containing nothing but
 * the job scheduler's own stall/nudge rows. Every element below is either acted on or
 * cut.
 */

interface Overview {
  stats: {
    totalUsers: number; totalApplications: number; activeLoans: number; totalLoans: number;
    totalLeads: number; totalDownloads: number; disbursedRupees: number; outstandingRupees: number;
    approvedCount: number; applicationToDisbursalPct: number;
  };
  pipeline: {
    stages: PipelineStage[];
    inFlight: number;
    bottleneck: (PipelineStage & { sharePct: number }) | null;
  };
  acquisition: {
    web: { label: string; steps: TrackStep[] };
    app: { label: string; steps: TrackStep[] };
  };
}

interface Charts {
  timeseries: { date: string; applications: number; disbursals: number }[];
  leadsBySource: { source: string; count: number }[];
  applicationsByType: { type: string; count: number }[];
}

interface Realtime {
  activeSessions: number; eventsLastHour: number; appsToday: number;
  disbursedToday: number; unreadNotifs: number;
}

export default function OverviewPage() {
  const [days, setDays] = useState('14');

  const { data, isLoading } = useSWR('/api/admin/dashboard/overview', swrFetcher, { refreshInterval: 15000 });
  const { data: rt } = useSWR('/api/admin/dashboard/realtime', swrFetcher, { refreshInterval: 8000 });
  // The work queue reads the notification table, which is where the stall detectors
  // write a named, actionable row per customer. `unread=1` is what makes it a queue
  // rather than a log — triaged rows drop out. Note the param is `pageSize`, not
  // `limit`: the endpoint ignores `limit` and silently falls back to 20 rows, which
  // stretched this card to three times the height of the one beside it.
  const { data: notif } = useSWR('/api/admin/notifications?unread=1&pageSize=7', swrFetcher, { refreshInterval: 20000 });
  // Trends take a day range and are a heavier query — kept out of the 15s refresh.
  const { data: chartsRes, isLoading: chartsLoading } =
    useSWR(`/api/admin/dashboard/charts?days=${days}`, swrFetcher);

  const o = data?.data as Overview | undefined;
  const c = chartsRes?.data as Charts | undefined;
  const r = rt?.data as Realtime | undefined;
  const queue = ((notif?.data as { rows?: AttentionItem[] } | undefined)?.rows ?? []) as AttentionItem[];

  const bn = o?.pipeline?.bottleneck ?? null;
  const pipelineValue = (o?.pipeline?.stages ?? [])
    .filter((s) => !s.terminal)
    .reduce((sum, s) => sum + s.valueRupees, 0);

  // Only surface disbursal figures once a disbursal exists. A confident "₹0" reads as
  // a broken widget; the absence is stated in words instead.
  const hasDisbursals = (o?.stats.disbursedRupees ?? 0) > 0 || (o?.stats.totalLoans ?? 0) > 0;
  // Product mix is a single category ("personal") today — a one-bar bar chart. Render
  // it only once there is a mix to compare.
  const productMix = (c?.applicationsByType ?? []).filter((t) => t.count > 0);

  return (
    <div className="page">
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Master Overview</h1>
          <p className="page-sub">Where the loan pipeline stands right now, and what needs chasing.</p>
        </div>
      </div>

      {/* Today — volatile counters, deliberately small. These change minute to minute,
          so they get a dense strip rather than five big cards competing with the
          headline number below. */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="strip">
            <div className="strip-cell">
              <div className="strip-val">{r ? num(r.appsToday) : '—'}</div>
              <div className="strip-lbl">Applications today</div>
            </div>
            <div className="strip-cell">
              <div className="strip-val">{r ? num(r.activeSessions) : '—'}</div>
              <div className="strip-lbl">Active sessions</div>
            </div>
            <div className="strip-cell">
              <div className="strip-val">{r ? num(r.eventsLastHour) : '—'}</div>
              <div className="strip-lbl">Events / last hour</div>
            </div>
            <div className="strip-cell">
              <div className="strip-val">{r ? num(r.unreadNotifs) : '—'}</div>
              <div className="strip-lbl">Unread alerts</div>
            </div>
          </div>
          <span className="row" style={{ gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
            <span className="dot-live" /> live
          </span>
        </div>
      </div>

      {/* The headline: the stage holding the most applications, and the queue behind
          it. This is the page's whole reason to exist. */}
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card
          title="Application pipeline"
          sub="Applications by the stage they are sitting at now"
          right={
            <Link href="/loans" style={{ fontSize: 12.5, color: 'var(--brand)', fontWeight: 600 }}>
              View all →
            </Link>
          }
        >
          {isLoading || !o ? (
            <TableSkeleton rows={5} cols={4} />
          ) : (
            <>
              {bn ? (
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 14 }}>
                  <div className="hero-fig">{num(bn.count)}</div>
                  <div className="hero-cap">
                    applications waiting at <b>{bn.label}</b> — {pct(bn.sharePct)} of the{' '}
                    {num(o.pipeline.inFlight)} in flight
                  </div>
                  <div className="hero-note">
                    {inrCompactR(bn.valueRupees)} held at this stage
                    {bn.waitingSince && <> · oldest has waited {ageShort(bn.waitingSince)}</>}
                  </div>
                </div>
              ) : (
                <div className="hero-note" style={{ marginBottom: 12 }}>
                  No applications in flight.
                </div>
              )}
              <StageCensus stages={o.pipeline.stages} href={(k) => `/loans?status=${k}`} />
              <div className="hero-note" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                {num(o.pipeline.inFlight)} in flight · {inrCompactR(pipelineValue)} total value
                {!hasDisbursals && <> · nothing disbursed yet, so there is no disbursal or outstanding figure to show</>}
              </div>
            </>
          )}
        </Card>

        <Card
          title="Needs attention"
          sub="Stalled applications, newest first"
          right={
            <Link href="/notifications" style={{ fontSize: 12.5, color: 'var(--brand)', fontWeight: 600 }}>
              All alerts →
            </Link>
          }
        >
          {!notif ? <TableSkeleton rows={6} cols={2} /> : <AttentionQueue items={queue} />}
        </Card>
      </div>

      {/* Acquisition — two independent tracks. Splicing them into one funnel is what
          produced "14 qualified leads → 30 applications at 100% conversion". */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginTop: 16, alignItems: 'start' }}>
        <Card title="Website" sub="Visitor → lead → qualified → user">
          {o ? <TrackSteps steps={o.acquisition.web.steps} /> : <TableSkeleton rows={4} cols={2} />}
        </Card>
        <Card title="Mobile app" sub="Install → register → apply → approved">
          {o ? <TrackSteps steps={o.acquisition.app.steps} /> : <TableSkeleton rows={4} cols={2} />}
        </Card>
        <Card title="Leads by source" sub="All captured leads, ranked">
          {c ? <HBar data={c.leadsBySource} nameKey="source" valueKey="count" /> : <TableSkeleton rows={5} cols={2} />}
        </Card>
      </div>

      {/* Trends. One filter row scoping everything below it. */}
      <div className="row between wrap" style={{ marginTop: 28 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 20 }}>Trends</h2>
          <p className="page-sub">Application volume over time.</p>
        </div>
        <FilterChips
          options={[{ key: '7', label: '7d' }, { key: '14', label: '14d' }, { key: '30', label: '30d' }, { key: '90', label: '90d' }]}
          value={days}
          onChange={setDays}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <Card
          title="Applications per day"
          sub={hasDisbursals ? 'Applications started vs loans disbursed' : 'Applications started — disbursals appear here once the first loan is disbursed'}
        >
          {chartsLoading || !c
            ? <TableSkeleton rows={6} />
            : <TrendArea data={c.timeseries} showDisbursals={hasDisbursals} />}
        </Card>
      </div>

      {productMix.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <Card title="Applications by product">
            <HBar data={productMix} nameKey="type" valueKey="count" />
          </Card>
        </div>
      )}
    </div>
  );
}
