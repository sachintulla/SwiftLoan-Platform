'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { StatCard, Card, TableSkeleton, Empty, StatusBadge, Callout } from '@/components/ui';
import { num, timeAgo, dateTimeStr } from '@/lib/format';

interface JobHb {
  name: string; everyMs: number; runs: number;
  lastRunAt: string | null; lastOkAt: string | null; lastError: string | null; lastDurationMs: number | null;
  isCallJob: boolean; healthy: boolean; overdueMs: number | null;
}
interface RecentCall {
  id: string; phone: string; status: string | null; answered: boolean; outcome: string | null;
  purpose: string | null; name: string | null; queuedAt: string | null; startedAt: string | null;
  providerConversationId: string | null; error: string | null; summary: string | null;
}
interface Overview {
  totals: { last24h: number; last7d: number };
  byStatus: { status: string; count: number }[];
  byPurpose: { purpose: string; count: number }[];
  perDay: { day: string; count: number }[];
  recent: RecentCall[];
  jobs: JobHb[];
  generatedAt: string;
}

const PURPOSE_LABEL: Record<string, string> = {
  app_dropoff_followup: 'Stuck-stage (drop-off)',
  daily_status_update: 'Daily status',
  website_lead_followup: 'Website lead callback',
  immediate_callback_optin: 'Immediate callback',
  '(unknown)': 'Other / campaign',
};
function purposeLabel(p: string | null): string {
  if (!p) return 'Other / campaign';
  return PURPOSE_LABEL[p] ?? p;
}
function everyLabel(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `every ${m}m`;
  return `every ${Math.round(m / 60)}h`;
}

export default function CallsPage() {
  const { data: res, isLoading } = useSWR('/api/admin/calls/overview', swrFetcher, { refreshInterval: 10000 });
  const data = res?.data as Overview | undefined;

  const byStatus = (s: string) => data?.byStatus.find((x) => x.status === s)?.count ?? 0;
  const callJobs = (data?.jobs ?? []).filter((j) => j.isCallJob);
  const anyUnhealthy = callJobs.some((j) => !j.healthy);
  const maxDay = Math.max(1, ...(data?.perDay ?? []).map((d) => d.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ margin: 0 }}>Calls</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            Outbound voice calls (Ruby) and whether the dialler jobs are running on schedule.
            {data?.generatedAt ? ` Updated ${timeAgo(data.generatedAt)}.` : ''}
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Calls · last 24h" value={num(data?.totals.last24h ?? 0)} icon="✆" tone="teal" />
        <StatCard label="Calls · last 7 days" value={num(data?.totals.last7d ?? 0)} icon="✆" tone="blue" />
        <StatCard label="Completed (7d)" value={num(byStatus('completed'))} icon="✓" tone="green" />
        <StatCard label="In progress (7d)" value={num(byStatus('dialing') + byStatus('in_progress'))} icon="…" tone="amber" />
        <StatCard label="Failed (7d)" value={num(byStatus('failed') + byStatus('no_answer') + byStatus('busy'))} icon="✕" tone="red" />
      </div>

      {/* Job health — is Ruby being triggered on a regular interval? */}
      <Card title="Dialler jobs — are they triggering on schedule?" sub="In-memory heartbeat since the API last started. Healthy = ran within 2.5× its interval.">
        {anyUnhealthy && (
          <Callout tone="amber" icon="⚠">
            One or more call jobs haven&apos;t ticked recently. If the API just restarted, give it a minute; otherwise the scheduler may be stalled.
          </Callout>
        )}
        {isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : callJobs.length === 0 ? (
          <Empty label="No heartbeat yet — the jobs haven't run since the last restart." />
        ) : (
          <table className="table">
            <thead><tr><th>Job</th><th>Interval</th><th>Last run</th><th>Runs</th><th>Health</th></tr></thead>
            <tbody>
              {callJobs.map((j) => (
                <tr key={j.name}>
                  <td style={{ fontFamily: 'var(--mono, monospace)' }}>{j.name}</td>
                  <td className="muted">{everyLabel(j.everyMs)}</td>
                  <td title={j.lastRunAt ? dateTimeStr(j.lastRunAt) : ''}>
                    {j.lastRunAt ? timeAgo(j.lastRunAt) : '—'}
                    {j.lastError ? <span style={{ color: 'var(--red)', marginLeft: 6 }} title={j.lastError}>· error</span> : null}
                  </td>
                  <td>{num(j.runs)}</td>
                  <td><StatusBadge status={j.healthy ? 'active' : 'pending'} label={j.healthy ? 'healthy' : 'overdue'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* By purpose */}
        <Card title="Calls by purpose (7d)">
          {isLoading ? <TableSkeleton rows={4} cols={2} /> : (data?.byPurpose.length ? (
            <table className="table">
              <tbody>
                {data.byPurpose.map((p) => (
                  <tr key={p.purpose}><td>{purposeLabel(p.purpose)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{num(p.count)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <Empty label="No calls in the last 7 days." />)}
        </Card>

        {/* Per day */}
        <Card title="Calls per day (IST, 7d)">
          {isLoading ? <TableSkeleton rows={4} cols={2} /> : (data?.perDay.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.perDay.map((d) => (
                <div key={d.day} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="muted" style={{ width: 92, fontSize: 12 }}>{d.day}</span>
                  <div style={{ flex: 1, background: 'var(--line, #eee)', borderRadius: 4, height: 14 }}>
                    <div style={{ width: `${(d.count / maxDay) * 100}%`, background: 'var(--teal, #079FA0)', height: '100%', borderRadius: 4 }} />
                  </div>
                  <span style={{ width: 32, textAlign: 'right', fontWeight: 700 }}>{d.count}</span>
                </div>
              ))}
            </div>
          ) : <Empty label="No calls in the last 7 days." />)}
        </Card>
      </div>

      {/* Recent calls */}
      <Card title="Recent calls" sub="Most recent 25 outbound calls (last 7 days).">
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : data?.recent.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>When</th><th>Phone</th><th>Name</th><th>Purpose</th><th>Status</th><th>Outcome</th><th>Conversation</th></tr></thead>
              <tbody>
                {data.recent.map((c) => (
                  <tr key={c.id}>
                    <td title={c.queuedAt ? dateTimeStr(c.queuedAt) : ''}>{c.queuedAt ? timeAgo(c.queuedAt) : '—'}</td>
                    <td style={{ fontFamily: 'var(--mono, monospace)' }}>{c.phone}</td>
                    <td>{c.name ?? '—'}</td>
                    <td>{purposeLabel(c.purpose)}</td>
                    <td><StatusBadge status={c.status ?? 'unknown'} /></td>
                    <td className="muted">{c.outcome ?? (c.answered ? 'answered' : '—')}{c.error ? <span style={{ color: 'var(--red)' }} title={c.error}> · error</span> : null}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{c.providerConversationId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty label="No calls yet." />}
      </Card>
    </div>
  );
}
