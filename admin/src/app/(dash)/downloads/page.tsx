'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatCard, StatusBadge, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { num, pct, dateTimeStr } from '@/lib/format';
import { stageLabel } from '@/components/journey';
import { DonutChart } from '@/components/charts';
import AppBuilds from '@/components/AppBuilds';

interface Row {
  id: string; platform: string; source: string; campaignId?: string; referrer?: string | null;
  matchMethod?: string | null; contextLoaded: boolean; installedAt: string;
  userId?: string | null; userName?: string | null; userPhone?: string | null; stage?: string | null;
}
interface Payload {
  rows: Row[];
  bySource: { source: string; count: number }[];
  byPlatform: { platform: string; count: number }[];
  contextInstalls: number; organicInstalls: number;
}

type Period = 'today' | 'yesterday' | '7d' | '30d' | 'custom' | 'all';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Date range' },
  { key: 'all', label: 'All time' },
];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Ranges are computed in the viewer's own timezone (so "Today" = the admin's
// local/IST day) and sent to the API as ISO instants.
function computeRange(period: Period, cFrom: string, cTo: string): { from?: string; to?: string } {
  const now = new Date();
  if (period === 'all') return {};
  if (period === 'today') return { from: startOfDay(now).toISOString(), to: now.toISOString() };
  if (period === 'yesterday') {
    const s = startOfDay(now); const y = new Date(s); y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: s.toISOString() };
  }
  if (period === '7d') { const f = new Date(now); f.setDate(f.getDate() - 7); return { from: f.toISOString(), to: now.toISOString() }; }
  if (period === '30d') { const f = new Date(now); f.setDate(f.getDate() - 30); return { from: f.toISOString(), to: now.toISOString() }; }
  // custom
  const out: { from?: string; to?: string } = {};
  if (cFrom) out.from = new Date(`${cFrom}T00:00:00`).toISOString();
  if (cTo) out.to = new Date(`${cTo}T23:59:59.999`).toISOString();
  return out;
}

export default function DownloadsPage() {
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<Period>('today');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');

  const range = useMemo(() => computeRange(period, cFrom, cTo), [period, cFrom, cTo]);
  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    return p.toString();
  }, [page, range]);

  const { data, isLoading } = useSWR(`/api/admin/downloads?${qs}`, swrFetcher);
  const p = data?.data as Payload | undefined;
  const pg = data?.pagination;
  const total = (p?.contextInstalls ?? 0) + (p?.organicInstalls ?? 0);
  const contextPct = total ? Math.round(((p?.contextInstalls ?? 0) / total) * 100) : 0;
  const onPeriod = (v: Period) => { setPeriod(v); setPage(1); };

  return (
    <div className="page">
      <h1 className="page-title">App Downloads &amp; Attribution</h1>
      <p className="page-sub">Who installed the app today, yesterday or in a date range — with each customer&rsquo;s current stage.</p>

      <div style={{ marginTop: 16 }}><AppBuilds /></div>

      {/* Period filter */}
      <Card title="Installs by period">
        <FilterChips options={PERIODS} value={period} onChange={onPeriod} />
        {period === 'custom' && (
          <div className="row wrap" style={{ gap: 12, marginTop: 12, alignItems: 'center' }}>
            <label className="muted" style={{ fontSize: 13 }}>From&nbsp;
              <input type="date" value={cFrom} max={cTo || undefined} onChange={(e) => { setCFrom(e.target.value); setPage(1); }} className="input" />
            </label>
            <label className="muted" style={{ fontSize: 13 }}>To&nbsp;
              <input type="date" value={cTo} min={cFrom || undefined} onChange={(e) => { setCTo(e.target.value); setPage(1); }} className="input" />
            </label>
          </div>
        )}
      </Card>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 16 }}>
        <StatCard label="Installs (selected)" value={num(total)} icon="⭳" tone="blue" />
        <StatCard label="Context Installs" value={num(p?.contextInstalls)} icon="◉" tone="teal" foot={`${pct(contextPct)} of installs`} />
        <StatCard label="Organic Installs" value={num(p?.organicInstalls)} icon="○" tone="grey" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="By source">{p ? <DonutChart data={p.bySource} nameKey="source" valueKey="count" /> : <TableSkeleton rows={4} cols={2} />}</Card>
        <Card title="By platform">{p ? <DonutChart data={p.byPlatform} nameKey="platform" valueKey="count" /> : <TableSkeleton rows={2} cols={2} />}</Card>
      </div>

      <Card title="Installs">
        {isLoading ? <TableSkeleton /> : !p || p.rows.length === 0 ? <Empty label="No installs in this period" /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Customer</th><th>Current stage</th><th>Platform</th><th>Source</th><th>Campaign</th><th>Matched by</th><th>Context</th><th>Installed</th>
            </tr></thead>
            <tbody>{p.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.userId ? (
                    <Link href={`/users/${r.userId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div style={{ fontWeight: 600 }}>{r.userName || 'Unnamed user'}</div>
                      {r.userPhone && <div className="mono muted" style={{ fontSize: 12 }}>{r.userPhone}</div>}
                    </Link>
                  ) : <span className="muted">Not matched</span>}
                </td>
                <td>{r.stage ? <StatusBadge status={r.stage} label={stageLabel(r.stage)} /> : <span className="muted">—</span>}</td>
                <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.platform}</td>
                <td><span className="badge tone-grey">{r.source}</span></td>
                <td className="mono muted">{r.campaignId || '—'}</td>
                <td className="muted">{r.matchMethod ? r.matchMethod.replace('_', ' ') : '—'}</td>
                <td>{r.contextLoaded ? <StatusBadge status="converted" label="Context" /> : <StatusBadge status="not_started" label="Organic" />}</td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateTimeStr(r.installedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
