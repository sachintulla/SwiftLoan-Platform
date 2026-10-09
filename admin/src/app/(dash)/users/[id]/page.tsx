'use client';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatCard, StatusBadge, TableSkeleton, Empty } from '@/components/ui';
import { inr, dateStr, humanStatus, timeAgo } from '@/lib/format';

const LENDER_GROUP_LABEL: Record<string, string> = {
  knight_fintech: 'Knight Fintech',
  yubi: 'Yubi',
  revasure: 'Revasure',
};

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useSWR(`/api/admin/users/${id}`, swrFetcher);
  const u = data?.data as any;

  if (isLoading || !u) return <div className="page"><TableSkeleton rows={8} /></div>;

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back</button>
      <h1 className="page-title">{u.fullName || 'User'}</h1>
      <p className="page-sub">{u.phone} · {u.email || 'no email'} · joined {dateStr(u.createdAt)}</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', marginTop: 16 }}>
        <StatCard label="Credit Score" value={u.creditScore} tone={u.creditScore >= 750 ? 'green' : u.creditScore >= 650 ? 'amber' : 'red'} />
        <StatCard label="Monthly Income" value={u.monthlyIncome ? inr(u.monthlyIncome) : '—'} tone="teal" />
        <StatCard label="Applications" value={u.applications?.length ?? 0} tone="blue" />
        <StatCard label="Loans" value={u.loans?.length ?? 0} tone="grey" />
      </div>

      <div style={{ marginTop: 16 }}>
      <Card title="Applications across lenders">
        {(u.lenderApplications ?? []).length === 0 ? <Empty /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Lender group</th><th>Lender</th><th>Amount</th><th>Status</th><th>Applied</th></tr></thead>
            <tbody>{u.lenderApplications.map((a: any, i: number) => (
              <tr key={a.ref || i}>
                <td>{LENDER_GROUP_LABEL[a.lenderGroup] || humanStatus(a.lenderGroup)}</td>
                <td>{a.lender || '—'}</td>
                <td className="mono">{a.amount != null ? inr(a.amount) : '—'}</td>
                <td><StatusBadge status={a.status} /></td>
                <td className="muted" title={dateStr(a.appliedAt)}>{timeAgo(a.appliedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Applications">
          {(u.applications ?? []).length === 0 ? <div className="empty">No applications</div> : (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Ref</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>{u.applications.map((a: any) => (
                <tr key={a.id} onClick={() => router.push(`/loans/${a.id}`)}><td className="mono">{a.ref}</td><td className="mono">{inr(a.amount)}</td><td><StatusBadge status={a.status} /></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
        <Card title="KYC & profile">
          <div className="row between" style={{ padding: '6px 0' }}><span className="muted">Employment</span><b>{u.employment ? humanStatus(u.employment) : '—'}</b></div>
          <div className="row between" style={{ padding: '6px 0' }}><span className="muted">Pincode</span><b>{u.pincode || '—'}</b></div>
          <div className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', marginBottom: 8 }}><span className="muted">Phone verified</span>{u.phoneVerified ? <StatusBadge status="verified" /> : <StatusBadge status="pending" />}</div>
          {(u.kyc ?? []).map((k: any) => (
            <div key={k.id} className="row between" style={{ padding: '6px 0' }}><span style={{ textTransform: 'capitalize' } as React.CSSProperties}>{k.method}</span><StatusBadge status={k.status} /></div>
          ))}
        </Card>
      </div>
    </div>
  );
}
