'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatCard, StatusBadge, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { num, dateStr } from '@/lib/format';

interface Person { id: string; name: string; phone: string | null }
interface Payload {
  stats: { total: number; signedUp: number; applied: number; disbursed: number; installs: number; attributedInstalls: number; attributionRate: number };
  topReferrers: (Person & { referrals: number })[];
  items: { id: string; code: string; status: string; matchMethod: string | null; rewardStatus: string; createdAt: string; referrer: Person; referee: Person }[];
}

const METHOD: Record<string, string> = { play_referrer: 'Play referrer', clipboard: 'Clipboard', ip_window: 'IP window', manual: 'Manual' };
const STATUSES = [['', 'All'], ['signed_up', 'Joined'], ['applied', 'Applied'], ['disbursed', 'Disbursed']];

export default function ReferralsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, isLoading } = useSWR(`/api/admin/referrals?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`, swrFetcher);
  const p = data?.data as Payload | undefined;
  const pg = data?.pagination;

  return (
    <div className="page">
      <h1 className="page-title">Referrals</h1>
      <p className="page-sub">Friends invited through the in-app “Refer a friend” link, and how install attribution matched them. Tracking only — no reward is issued.</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 16 }}>
        <StatCard label="Referrals" value={num(p?.stats.total)} icon="☺" tone="blue" />
        <StatCard label="Applied" value={num(p?.stats.applied)} icon="₹" tone="amber" />
        <StatCard label="Disbursed" value={num(p?.stats.disbursed)} icon="✓" tone="green" />
        <StatCard label="Attributed installs" value={num(p?.stats.attributedInstalls)} icon="⭳" tone="teal"
          foot={p ? `${p.stats.attributionRate}% of ${num(p.stats.installs)} installs` : undefined} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr', marginTop: 16 }}>
        <Card title="Top referrers">
          {!p ? <TableSkeleton rows={3} cols={2} /> : p.topReferrers.length === 0 ? <Empty /> : (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Referrer</th><th>Phone</th><th>Friends</th></tr></thead>
              <tbody>{p.topReferrers.map((t) => (
                <tr key={t.id}><td>{t.name}</td><td className="mono muted">{t.phone ?? '—'}</td><td>{t.referrals}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>

      <Card title="All referrals">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {STATUSES.map(([v, label]) => (
            <button key={v} className={`btn ${status === v ? 'btn-primary' : ''}`} onClick={() => { setStatus(v); setPage(1); }}>{label}</button>
          ))}
        </div>
        {isLoading ? <TableSkeleton /> : !p || p.items.length === 0 ? <Empty /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Referrer</th><th>Friend</th><th>Status</th><th>Matched by</th><th>Code</th><th>Joined</th></tr></thead>
            <tbody>{p.items.map((r) => (
              <tr key={r.id}>
                <td>{r.referrer.name}<div className="mono muted">{r.referrer.phone ?? ''}</div></td>
                <td>{r.referee.name}<div className="mono muted">{r.referee.phone ?? ''}</div></td>
                <td><StatusBadge status={r.status === 'signed_up' ? 'in_progress' : r.status === 'applied' ? 'pending' : 'disbursed'} label={r.status.replace('_', ' ')} /></td>
                <td className="muted">{r.matchMethod ? METHOD[r.matchMethod] ?? r.matchMethod : '—'}</td>
                <td className="mono muted">{r.code}</td>
                <td className="muted">{dateStr(r.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
