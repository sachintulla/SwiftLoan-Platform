'use client';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatCard, StatusBadge, TableSkeleton, Empty } from '@/components/ui';
import { inr, dateStr, humanStatus, timeAgo } from '@/lib/format';
import { stageLabel } from '@/components/journey';
import type { ReactNode } from 'react';

const LENDER_GROUP_LABEL: Record<string, string> = {
  knight_fintech: 'Knight Fintech',
  yubi: 'Yubi',
  revasure: 'Revasure',
};

// One label/value row for the identity cards.
function Field({ label, value }: { label: string; value: ReactNode }) {
  const empty = value == null || value === '' || value === false;
  return (
    <div className="row between" style={{ padding: '6px 0', gap: 16 }}>
      <span className="muted">{label}</span>
      <b style={{ textAlign: 'right' }}>{empty ? '—' : value}</b>
    </div>
  );
}

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useSWR(`/api/admin/users/${id}`, swrFetcher);
  const u = data?.data as any;

  if (isLoading || !u) return <div className="page"><TableSkeleton rows={8} /></div>;

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back</button>
      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
        {u.avatarUrl && <img src={u.avatarUrl} alt="" width={44} height={44} style={{ borderRadius: '50%', objectFit: 'cover' }} />}
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || 'User'}</h1>
          <p className="page-sub" style={{ margin: 0 }}>{u.phone} · {u.email || 'no email'} · joined {dateStr(u.createdAt)}</p>
        </div>
      </div>

      {u.customer?.currentStage && (
        <div className="row wrap" style={{ gap: 10, marginTop: 10, alignItems: 'center' }}>
          <StatusBadge status={u.customer.currentStage} label={`Stage: ${stageLabel(u.customer.currentStage)}`} />
          {u.customer.stageEnteredAt && <span className="muted" style={{ fontSize: 13 }}>in this stage {timeAgo(u.customer.stageEnteredAt)}</span>}
          {u.customer.lastActivityAt && <span className="muted" style={{ fontSize: 13 }}>· last active {timeAgo(u.customer.lastActivityAt)}</span>}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', marginTop: 16 }}>
        <StatCard label="Credit Score" value={u.creditScore} tone={u.creditScore >= 750 ? 'green' : u.creditScore >= 650 ? 'amber' : 'red'} />
        <StatCard label="Monthly Income" value={u.monthlyIncome ? inr(u.monthlyIncome) : '—'} tone="teal" />
        <StatCard label="Applications" value={u.applications?.length ?? 0} tone="blue" />
        <StatCard label="Loans" value={u.loans?.length ?? 0} tone="grey" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Identity">
          <Field label="Full name" value={u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ')} />
          <Field label="Date of birth" value={u.dob ? dateStr(u.dob) : null} />
          <Field label="Gender" value={u.gender ? humanStatus(u.gender) : null} />
          <Field label="Marital status" value={u.maritalStatus ? humanStatus(u.maritalStatus) : null} />
          <Field label="Qualification" value={u.qualification ? humanStatus(u.qualification) : null} />
          <Field label="PAN on file" value={u.panOnFile ? 'Yes' : 'No'} />
          <Field label="Aadhaar (last 4)" value={u.aadhaarLast4 ? `•••• ${u.aadhaarLast4}` : null} />
          <Field label="Email" value={u.email ? <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>{u.email}{u.emailVerified && <StatusBadge status="verified" />}</span> : null} />
          <Field label="Alternate mobile" value={u.alternateMobile} />
          <Field label="Alternate email" value={u.alternateEmail} />
        </Card>
        <Card title="Address & employment">
          <Field label="Address" value={[u.addressLine1, u.addressLine2, u.landmark].filter(Boolean).join(', ')} />
          <Field label="City / District" value={[u.city, u.district].filter(Boolean).join(' / ')} />
          <Field label="State" value={u.state} />
          <Field label="Pincode" value={u.pincode} />
          <Field label="Residence type" value={u.residenceType ? humanStatus(u.residenceType) : null} />
          <Field label="Employment" value={u.employment ? humanStatus(u.employment) : null} />
          <Field label="Company" value={u.company} />
          <Field label="Monthly income" value={u.monthlyIncome ? inr(u.monthlyIncome) : null} />
          <Field label="Loan purpose" value={u.loanPurpose ? humanStatus(u.loanPurpose) : null} />
        </Card>
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
