'use client';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatusBadge, StatCard, TableSkeleton } from '@/components/ui';
import { inr, dateStr, humanStatus, timeAgo } from '@/lib/format';

const STAGES = ['draft', 'pan_pending', 'prequalifying', 'offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useSWR(`/api/admin/loans/${id}`, swrFetcher);
  const app = (data?.data as { application?: any; timeline?: any[] })?.application;
  const timeline = (data?.data as { timeline?: any[] })?.timeline ?? [];

  if (isLoading || !app) return <div className="page"><TableSkeleton rows={8} /></div>;

  const stageIdx = STAGES.indexOf(app.status);
  const loan = app.loan;

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back</button>
      <div className="row between wrap">
        <div>
          <h1 className="page-title">{app.ref} <StatusBadge status={app.status} /></h1>
          <p className="page-sub">{app.user?.fullName} · {app.user?.phone} · applied {dateStr(app.createdAt)}</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: 16 }}>
        <StatCard label="Amount" value={inr(app.amount)} tone="blue" />
        <StatCard label="Type" value={<span style={{ textTransform: 'capitalize' } as React.CSSProperties}>{app.loanType}</span>} tone="teal" />
        <StatCard label="Tenure" value={`${app.tenureMonths} mo`} tone="grey" />
        <StatCard label="Offers" value={app.offers?.length ?? 0} tone="amber" />
      </div>

      {/* stage tracker */}
      <Card title="Stage progress" className="" >
        <div className="row wrap" style={{ gap: 0 }}>
          {STAGES.map((s, i) => (
            <div key={s} className="row" style={{ gap: 0 }}>
              <div style={{ display: 'grid', placeItems: 'center', gap: 6, minWidth: 90 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: i <= stageIdx ? 'var(--brand)' : 'var(--border)' }}>{i < stageIdx ? '✓' : i + 1}</div>
                <span style={{ fontSize: 10.5, color: i <= stageIdx ? 'var(--text)' : 'var(--text-faint)', textAlign: 'center' }}>{humanStatus(s)}</span>
              </div>
              {i < STAGES.length - 1 && <div style={{ width: 22, height: 2, background: i < stageIdx ? 'var(--brand)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Offers">
          {(app.offers ?? []).length === 0 ? <div className="empty">No offers generated</div> : (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Lender</th><th>APR</th><th>EMI</th><th>Fee</th><th></th></tr></thead>
              <tbody>{app.offers.map((o: any) => (
                <tr key={o.id}><td>{o.partner?.name}</td><td className="mono">{o.apr}%</td><td className="mono">{inr(o.emi)}</td><td className="mono">{inr(o.processingFee)}</td><td>{o.selected ? <StatusBadge status="approved" label="Selected" /> : o.recommended ? <StatusBadge status="qualified" label="Recommended" /> : ''}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>

        <Card title="Loan & repayments">
          {!loan ? <div className="empty">Not disbursed yet</div> : (
            <>
              <div className="row between" style={{ marginBottom: 10 }}><span className="muted">Principal</span><b className="mono">{inr(loan.principal)}</b></div>
              <div className="row between" style={{ marginBottom: 10 }}><span className="muted">EMI</span><b className="mono">{inr(loan.emiAmount)}</b></div>
              <div className="row between" style={{ marginBottom: 10 }}><span className="muted">Outstanding</span><b className="mono">{inr(loan.outstanding)}</b></div>
              <div className="row between" style={{ marginBottom: 14 }}><span className="muted">Status</span><StatusBadge status={loan.status} /></div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Repayments ({loan.repayments?.length ?? 0})</div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {(loan.repayments ?? []).map((r: any) => (
                  <div key={r.id} className="row between" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="mono muted" style={{ fontSize: 12 }}>{dateStr(r.dueDate)}</span>
                    <span className="mono" style={{ fontSize: 12 }}>{inr(r.amount)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card title="Activity timeline" className="" >
        {timeline.length === 0 ? <div className="empty">No tracked events for this applicant</div> : (
          <div style={{ display: 'grid', gap: 2 }}>
            {timeline.map((e: any) => (
              <div key={e.id} className="row" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--teal)' }} />
                <span style={{ fontSize: 13 }}>{humanStatus(e.eventName)}</span>
                <span className="spacer" /><span className="muted" style={{ fontSize: 11.5 }}>{timeAgo(e.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
