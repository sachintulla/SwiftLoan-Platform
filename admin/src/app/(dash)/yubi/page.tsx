'use client';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatCard, StatusBadge, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { num, dateStr, timeAgo, humanStatus } from '@/lib/format';

interface Referral {
  id: string;
  applicationId: string | null;
  userId: string | null;
  provider: string;
  status: string;
  lastStatus: string | null;
  appliedAt: string | null;
  appliedLender: string | null;
  redirectUrl: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; fullName: string | null; phone: string | null } | null;
}

interface Payload {
  rows: Referral[];
  byStatus: { status: string; count: number }[];
}

// Yubi (YMPL) statuses are the partner's own raw codes, not the admin's standard
// vocabulary, so map each to a tone-carrying keyword (StatusBadge derives its colour
// from statusTone(tone)) while keeping the partner's label — the same keyword-tone
// trick the Revasure / downloads pages use for non-standard statuses.
//   OFFER_GENERATED / NEW_LEAD → in-progress (blue), APPROVED / DISBURSED → green,
//   REJECT* → red, everything else → neutral (grey, via the raw status).
function yubiTone(status: string): string {
  const s = status.toUpperCase();
  if (s.includes('APPROV')) return 'approved';
  if (s.includes('DISBURS')) return 'disbursed';
  if (s.includes('REJECT')) return 'rejected';
  if (s.includes('FAIL')) return 'failed';
  if (s.includes('OFFER') || s.includes('NEW_LEAD') || s.includes('LEAD')) return 'in_progress';
  return status;
}

function YubiStatus({ status }: { status: string }) {
  return <StatusBadge status={yubiTone(status)} label={humanStatus(status)} />;
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'NEW_LEAD', label: 'New Lead' },
  { key: 'OFFER_GENERATED', label: 'Offer Generated' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'DISBURSED', label: 'Disbursed' },
  { key: 'REJECTED', label: 'Rejected' },
];

export default function YubiPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');

  const q = status ? `&status=${status}` : '';
  const { data, isLoading } = useSWR(`/api/admin/yubi?applied=1&page=${page}&pageSize=20${q}`, swrFetcher);
  const p = data?.data as Payload | undefined;
  const pg = data?.pagination;

  const count = (s: string) => p?.byStatus.find((b) => b.status === s)?.count ?? 0;

  return (
    <div className="page">
      <h1 className="page-title">Yubi Referrals</h1>
      <p className="page-sub">Applied referrals pushed to Yubi (YMPL) Markets, with their latest partner status.</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', marginTop: 16 }}>
        <StatCard label="New Lead" value={num(count('NEW_LEAD'))} icon="✦" tone="blue" />
        <StatCard label="Offer Generated" value={num(count('OFFER_GENERATED'))} icon="★" tone="blue" />
        <StatCard label="Approved" value={num(count('APPROVED'))} icon="✓" tone="green" />
        <StatCard label="Disbursed" value={num(count('DISBURSED'))} icon="₹" tone="green" />
        <StatCard label="Rejected" value={num(count('REJECTED'))} icon="∅" tone="red" />
      </div>

      <Card title="Referrals" right={
        <FilterChips options={STATUS_FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      }>
        {isLoading ? <TableSkeleton /> : !p || p.rows.length === 0 ? <Empty /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Customer</th><th>Applied Lender</th><th>Status</th><th>Applied</th><th></th></tr></thead>
            <tbody>{p.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div>{r.user?.fullName || 'Unknown'}</div>
                  <div className="mono muted" style={{ fontSize: 12 }}>{r.user?.phone || '—'}</div>
                </td>
                <td>{r.appliedLender || 'Yubi Markets partner'}</td>
                <td><YubiStatus status={r.lastStatus || r.status} /></td>
                <td className="muted" title={dateStr(r.appliedAt)}>{timeAgo(r.appliedAt)}</td>
                <td>
                  {r.userId && (
                    <Link className="btn" style={{ fontSize: 12, padding: '4px 9px' }} href={`/users/${r.userId}`}>View customer</Link>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
