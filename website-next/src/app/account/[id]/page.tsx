'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, MoreHorizontal, CircleCheckBig, Wallet, AlertCircle, XCircle, ShieldCheck, RefreshCw, type LucideIcon } from 'lucide-react';
import { AccountShell } from '@/components/apply/AccountShell';
import { Badge } from '@/components/apply/primitives';
import { getApplication, refreshApplicationStatus, type LoanApplication } from '@/lib/applyApi';
import { fmtINR } from '@/lib/core';
import { statusMeta } from '@/lib/statusMeta';

const STAGE_ORDER = ['applied', 'under_review', 'approved', 'disbursed'];

// Same glyph per stage as the app's status.tsx (check / more_horiz / task_alt
// / payments / error / cancel), mapped to their lucide equivalents.
const STAGE_ICON: Record<string, LucideIcon> = {
  applied: Check,
  under_review: MoreHorizontal,
  approved: CircleCheckBig,
  disbursed: Wallet,
  failed: AlertCircle,
  rejected: XCircle,
};

type Step = { key: string; title: string; desc: string; state: 'done' | 'active' | 'pending'; danger?: boolean };

/** Mirrors status.tsx's buildSteps — same 4-stage timeline, same terminal handling. */
function buildSteps(status: string): Step[] {
  const base = [
    { key: 'applied', title: 'Applied', desc: 'Your application was submitted to the lender.' },
    { key: 'under_review', title: 'Under review', desc: 'The lender is verifying your details. This usually takes 2–3 business days.' },
    { key: 'approved', title: 'Approved', desc: 'Your loan has been approved by the lender.' },
    { key: 'disbursed', title: 'Disbursed', desc: 'Funds are credited to your linked bank account.' },
  ];
  if (status === 'rejected' || status === 'failed') {
    const isFail = status === 'failed';
    return [
      { ...base[0]!, state: 'done' },
      isFail
        ? { key: 'failed', title: 'Failed', desc: "We couldn't complete this application due to a technical issue. Please try again or choose another lender.", state: 'active', danger: true }
        : { key: 'rejected', title: 'Rejected', desc: 'Unfortunately your application was not approved this time.', state: 'active', danger: true },
    ];
  }
  const mapped = status === 'handoff' ? 'applied' : status;
  const allDone = mapped === 'disbursed';
  let cur = STAGE_ORDER.indexOf(mapped);
  if (cur === -1) cur = 0;
  if (mapped === 'applied') cur = 1;
  return base.map((s, i) => ({ ...s, state: allDone ? 'done' : i < cur ? 'done' : i === cur ? 'active' : 'pending' }));
}

export default function ApplicationStatusPage() {
  const params = useParams<{ id: string }>();
  const [app, setApp] = useState<LoanApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getApplication(params.id)
      .then(setApp)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this application.'))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { application, refreshError } = await refreshApplicationStatus(params.id);
      setApp(application);
      // The lender's own API can be temporarily unreachable — the endpoint
      // still returns 200 with the last-known status in that case, so this
      // reads as a soft "couldn't get the latest" notice, not a broken page.
      if (refreshError) setError("Couldn't reach the lender for the latest update — showing the last known status.");
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh status right now.');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <AccountShell backHref="/account" backLabel="Your applications">
        <p className="text-muted-foreground text-sm">Loading your application…</p>
      </AccountShell>
    );
  }
  if (error && !app) {
    return (
      <AccountShell backHref="/account" backLabel="Your applications">
        <p className="text-danger text-sm font-semibold">{error}</p>
      </AccountShell>
    );
  }
  if (!app) return null;

  const la = app.lenderApplications?.[0];
  const lenderName = la?.lenderName || null;
  const amount = la?.amount ?? app.amount;
  const apr = la?.apr;
  const emi = la?.emi;
  const status = la?.status ?? app.status;
  const steps = buildSteps(status);

  return (
    <AccountShell backHref="/account" backLabel="Your applications" title="Application status">
      <div className="flex flex-col gap-5">
        <span className="text-primary text-xs font-bold tracking-wide">LOAN REFERENCE: {app.ref}</span>

        <div className="flex items-center gap-3">
          <div className="bg-accent text-primary grid h-12 w-12 place-items-center rounded-xl text-sm font-extrabold">
            {(lenderName || 'Personal Loan').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="text-lg font-extrabold">{lenderName || 'Personal Loan'}</div>
            {lenderName && <div className="text-muted-foreground text-xs">Personal Loan</div>}
          </div>
          <Badge tone={statusMeta(status).tone}>{statusMeta(status).label}</Badge>
        </div>

        <div className="border-border flex divide-x rounded-2xl border bg-card p-4">
          <Cell k="Amount" v={fmtINR(amount)} />
          <Cell k="Interest" v={apr != null ? `${apr}% p.a.` : '—'} />
          <Cell k={emi ? 'Monthly EMI' : 'Tenure'} v={emi ? fmtINR(emi) : `${app.tenureMonths} mo`} />
        </div>

        <div className="flex flex-col">
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            const color = s.danger ? 'bg-danger' : s.state === 'done' ? 'bg-mint' : s.state === 'active' ? 'bg-warning' : 'bg-muted';
            const textColor = s.state === 'pending' ? 'text-muted-foreground' : 'text-foreground';
            // A step's icon names its stage (applied/under_review/…) — always
            // shown, not just for done/active, same as the app's status.tsx
            // (an empty pending circle there is just a muted-colour icon, never
            // literally blank).
            const StepIcon = STAGE_ICON[s.key] ?? Check;
            const iconColor = s.state === 'pending' ? 'text-muted-foreground' : 'text-white';
            return (
              <div key={s.key} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${color}`}>
                    <StepIcon className={`h-4.5 w-4.5 ${iconColor}`} />
                  </div>
                  {!last && <div className={`w-0.5 flex-1 ${s.state === 'done' ? 'bg-mint' : 'bg-border'}`} />}
                </div>
                <div className={`pb-6 ${last ? '!pb-0' : ''}`}>
                  <div className={`text-sm font-bold ${textColor}`}>{s.title}</div>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-muted flex items-start gap-2 rounded-xl p-3 text-xs">
          <ShieldCheck className="text-mint mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-muted-foreground">
            Status updates come directly from the lender. We&apos;ll notify you here of any required documents or next steps.
          </span>
        </div>

        {error && <p className="text-danger text-xs font-semibold">{error}</p>}

        <button
          onClick={refresh}
          disabled={refreshing}
          className="border-border inline-flex w-full items-center justify-center gap-1.5 rounded-full border py-3 text-sm font-bold"
        >
          {refreshing ? (
            'Checking…'
          ) : (
            <>
              <RefreshCw className="h-4 w-4" /> Refresh status
            </>
          )}
        </button>
      </div>
    </AccountShell>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex-1 px-3 first:pl-0 last:pr-0">
      <div className="text-muted-foreground text-[11px] font-semibold">{k}</div>
      <div className="mt-0.5 text-sm font-extrabold">{v}</div>
    </div>
  );
}
