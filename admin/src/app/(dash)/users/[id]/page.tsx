'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatCard, StatusBadge, TableSkeleton } from '@/components/ui';
// Both money fields here — the rupee salary and the application amount — are rupees.
import { inrR, dateStr, humanStatus } from '@/lib/format';

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useSWR(`/api/admin/users/${id}`, swrFetcher);
  const u = data?.data as any;

  if (isLoading || !u) return <div className="page"><TableSkeleton rows={8} /></div>;

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back</button>
      <div className="row between wrap">
        <div>
          <h1 className="page-title">{u.fullName || 'User'}</h1>
          <p className="page-sub">{u.phone} · {u.email || 'no email'} · joined {dateStr(u.createdAt)}</p>
        </div>
        {/* This page covers only the app account. The website enquiries, calls and
            conversations for the same person live on the customer journey, which was
            previously unreachable from here. */}
        {u.customer?.id && (
          <Link className="btn btn-primary" href={`/customers/${u.customer.id}`}>
            Full customer journey →
          </Link>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', marginTop: 16 }}>
        <StatCard label="Credit Score" value={u.creditScore} tone={u.creditScore >= 750 ? 'green' : u.creditScore >= 650 ? 'amber' : 'red'} />
        <StatCard label="Monthly Income" value={u.monthlyIncome ? inrR(u.monthlyIncome) : '—'} tone="teal" />
        <StatCard label="Applications" value={u.applications?.length ?? 0} tone="blue" />
        <StatCard label="Loans" value={u.loans?.length ?? 0} tone="grey" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Applications">
          {(u.applications ?? []).length === 0 ? <div className="empty">No applications</div> : (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Ref</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>{u.applications.map((a: any) => (
                <tr key={a.id} onClick={() => router.push(`/loans/${a.id}`)}><td className="mono">{a.ref}</td><td className="mono">{inrR(a.amount)}</td><td><StatusBadge status={a.status} /></td></tr>
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
