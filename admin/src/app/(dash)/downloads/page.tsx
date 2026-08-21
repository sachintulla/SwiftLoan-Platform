'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatCard, StatusBadge, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { num, pct, dateStr } from '@/lib/format';
import { HBar } from '@/components/charts';
import AppBuilds from '@/components/AppBuilds';

interface Payload {
  rows: { id: string; platform: string; source: string; campaignId?: string; contextLoaded: boolean; installedAt: string }[];
  bySource: { source: string; count: number }[];
  byPlatform: { platform: string; count: number }[];
  contextInstalls: number; organicInstalls: number;
}

export default function DownloadsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR(`/api/admin/downloads?page=${page}&pageSize=20`, swrFetcher);
  const p = data?.data as Payload | undefined;
  const pg = data?.pagination;
  const total = (p?.contextInstalls ?? 0) + (p?.organicInstalls ?? 0);
  const contextPct = total ? Math.round(((p?.contextInstalls ?? 0) / total) * 100) : 0;

  return (
    <div className="page">
      <h1 className="page-title">App Downloads & Attribution</h1>
      <p className="page-sub">Download the two app builds, generate context links, and track tracked-link vs organic installs.</p>

      <div style={{ marginTop: 16 }}><AppBuilds /></div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 16 }}>
        <StatCard label="Total Installs" value={num(total)} icon="⭳" tone="blue" />
        <StatCard label="Context Installs" value={num(p?.contextInstalls)} icon="◉" tone="teal" foot={`${pct(contextPct)} of installs`} />
        <StatCard label="Organic Installs" value={num(p?.organicInstalls)} icon="○" tone="grey" />
      </div>

      {/* Ranked bars, not donuts.
          "By platform" only ever has two slices, and "By source" has four that sit
          close together — both cases make a reader compare arc lengths to answer a
          question a sorted bar answers instantly. Same component the overview uses, so
          the two pages read alike. */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="By source" sub="Where installs came from, ranked">
          {p ? <HBar data={p.bySource} nameKey="source" valueKey="count" /> : <TableSkeleton rows={4} cols={2} />}
        </Card>
        <Card title="By platform" sub="Android vs iOS">
          {p ? <HBar data={p.byPlatform} nameKey="platform" valueKey="count" /> : <TableSkeleton rows={2} cols={2} />}
        </Card>
      </div>

      <Card title="Recent installs">
        {isLoading ? <TableSkeleton /> : !p || p.rows.length === 0 ? <Empty /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Platform</th><th>Source</th><th>Campaign</th><th>Context</th><th>Installed</th></tr></thead>
            <tbody>{p.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.platform}</td>
                <td><span className="badge tone-grey">{r.source}</span></td>
                <td className="mono muted">{r.campaignId || '—'}</td>
                <td>{r.contextLoaded ? <StatusBadge status="converted" label="Context" /> : <StatusBadge status="not_started" label="Organic" />}</td>
                <td className="muted">{dateStr(r.installedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
