'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, StatusBadge, LoanStatusBadge, StatCard, TableSkeleton } from '@/components/ui';
import { inrRupees, dateStr, dateTimeStr, humanStatus, loanStatusLabel, timeAgo } from '@/lib/format';
import { LenderTrack, LenderRollup } from '@/components/journey';
import { withoutNudgeEvents } from '@/lib/flags';
import { ActivityTimeline } from '@/components/ActivityTimeline';

// Shared trunk: the stages every application goes through before it fans out to
// individual lenders (ending at "submitted to lenders" = handoff).
const STAGES = ['draft', 'pan_pending', 'prequalifying', 'offers_ready', 'handoff'];

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR(`/api/admin/loans/${id}`, swrFetcher);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  async function pullStatus() {
    setPulling(true); setPullMsg(null);
    const res = await apiFetch<{ changed: boolean }>(`/api/admin/loans/${id}/refresh-status`, { method: 'POST' });
    setPullMsg(res.success ? (res.message || 'Done') : (res.error || 'Could not reach the lender'));
    if (res.success) await mutate();
    setPulling(false);
  }

  const app = (data?.data as { application?: any; timeline?: any[] })?.application;
  const timeline = withoutNudgeEvents((data?.data as { timeline?: any[] })?.timeline ?? [], (e: any) => e.eventName);

  if (isLoading || !app) return <div className="page"><TableSkeleton rows={8} /></div>;

  // The parent application only tracks the shared trunk; clamp so a
  // post-submission app.status still lights the whole trunk.
  const stageIdx = Math.min(STAGES.indexOf(app.status), STAGES.length - 1) < 0
    ? STAGES.length - 1
    : STAGES.indexOf(app.status);
  const loan = app.loan;

  // Per-lender applications = offers actually applied to. Each has its own status.
  const appliedOffers: any[] = (app.offers ?? []).filter((o: any) => o.applied);
  const count = (sts: string[]) => appliedOffers.filter((o) => sts.includes(o.lenderStatus)).length;
  const approved = count(['approved']);
  const rejected = count(['rejected', 'failed']);
  const disbursed = count(['disbursed']);
  const summary = {
    submitted: appliedOffers.length,
    approved,
    rejected,
    disbursed,
    inProgress: appliedOffers.length - approved - rejected - disbursed,
  };

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back</button>
      <div className="row between wrap">
        <div>
          <h1 className="page-title">{app.ref} <LoanStatusBadge status={app.status} /></h1>
          <p className="page-sub">{app.user?.fullName} · {app.user?.phone} · applied {dateTimeStr(app.createdAt)}</p>
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          {pullMsg && <span className="muted" style={{ fontSize: 12.5, maxWidth: 240, textAlign: 'right' }}>{pullMsg}</span>}
          <button className="btn" disabled={pulling} onClick={pullStatus} title="Fetch the latest status from the lender and update it here">
            {pulling ? 'Pulling…' : '↻ Pull latest status'}
          </button>
        </div>
      </div>
      {app.lastStatusCheckedAt && (
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>Lender status last checked {timeAgo(app.lastStatusCheckedAt)} · {dateTimeStr(app.lastStatusCheckedAt)}</p>
      )}

      <div className="stack">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <StatCard label="Amount" value={inrRupees(app.amount)} tone="blue" />
        <StatCard label="Type" value={<span style={{ textTransform: 'capitalize' } as React.CSSProperties}>{app.loanType}</span>} tone="teal" />
        <StatCard label="Tenure" value={`${app.tenureMonths} mo`} tone="grey" />
        <StatCard label="Offers" value={app.offers?.length ?? 0} tone="amber" />
      </div>

      {/* shared trunk — before the application fans out to individual lenders */}
      <Card title="Shared journey (before lenders)" className="" >
        <div className="row wrap" style={{ gap: 0 }}>
          {STAGES.map((s, i) => (
            <div key={s} className="row" style={{ gap: 0 }}>
              <div style={{ display: 'grid', placeItems: 'center', gap: 6, minWidth: 90 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: i <= stageIdx ? 'var(--brand)' : 'var(--border)' }}>{i < stageIdx ? '✓' : i + 1}</div>
                <span style={{ fontSize: 10.5, color: i <= stageIdx ? 'var(--text)' : 'var(--text-faint)', textAlign: 'center' }}>{loanStatusLabel(s)}</span>
              </div>
              {i < STAGES.length - 1 && <div style={{ width: 22, height: 2, background: i < stageIdx ? 'var(--brand)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>
      </Card>

      {/* per-lender rollup + independent journeys */}
      {appliedOffers.length > 0 && (
        <Card title={`Lender applications (${summary.submitted})`} className="" >
          <div style={{ marginBottom: 12 }}><LenderRollup s={summary} /></div>
          {appliedOffers.map((o) => <LenderTrack key={o.id} offer={o} />)}
        </Card>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(460px,1fr))' }}>
        <Card title="Offers">
          {(app.offers ?? []).length === 0 ? <div className="empty">No offers generated</div> : (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Lender</th><th>APR</th><th>EMI</th><th>Fee</th><th>Status</th><th></th></tr></thead>
              <tbody>{app.offers.map((o: any) => (
                <tr key={o.id}><td>{o.lenderName ?? o.partner?.name}</td><td className="mono">{o.apr}%</td><td className="mono">{inrRupees(o.emi)}</td><td className="mono">{inrRupees(o.processingFee)}</td><td>{o.applied ? <LoanStatusBadge status={o.lenderStatus ?? 'handoff'} /> : <span className="muted" style={{ fontSize: 12 }}>not applied</span>}</td><td>{o.selected ? <StatusBadge status="approved" label="Selected" /> : o.recommended ? <StatusBadge status="qualified" label="Recommended" /> : ''}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>

        <Card title="Loan & repayments">
          {!loan ? <div className="empty">Not disbursed yet</div> : (
            <>
              <div className="row between" style={{ marginBottom: 10 }}><span className="muted">Principal</span><b className="mono">{inrRupees(loan.principal)}</b></div>
              <div className="row between" style={{ marginBottom: 10 }}><span className="muted">EMI</span><b className="mono">{inrRupees(loan.emiAmount)}</b></div>
              <div className="row between" style={{ marginBottom: 10 }}><span className="muted">Outstanding</span><b className="mono">{inrRupees(loan.outstanding)}</b></div>
              <div className="row between" style={{ marginBottom: 14 }}><span className="muted">Status</span><StatusBadge status={loan.status} /></div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Repayments ({loan.repayments?.length ?? 0})</div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {(loan.repayments ?? []).map((r: any) => (
                  <div key={r.id} className="row between" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="mono muted" style={{ fontSize: 12 }}>{dateStr(r.dueDate)}</span>
                    <span className="mono" style={{ fontSize: 12 }}>{inrRupees(r.amount)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card title="Activity timeline" sub={`${timeline.length} tracked event${timeline.length === 1 ? '' : 's'}`}>
        <ActivityTimeline events={timeline} />
      </Card>
      </div>
    </div>
  );
}
