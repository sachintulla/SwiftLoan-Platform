'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { Badge, Card, SectionLabel } from '@/components/apply/primitives';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { handoff } from '@/lib/applyApi';

const DOCS = ['Verified identity profile', 'Bank statement summary (last 3 months)', 'Income & tax proof'];

export default function ConfirmPage() {
  const router = useRouter();
  const { applicationId, selectedOffer } = useApply();
  const accountUser = useAccountUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId || !selectedOffer) router.replace('/apply/offers');
  }, [applicationId, selectedOffer, router]);

  if (!applicationId || !selectedOffer) return null;
  const lenderName = selectedOffer.lenderName || 'the lender';

  const confirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await handoff(applicationId);
      router.push('/apply/success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the handoff. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ApplyShell backHref="/apply/offers" stepLabel="Confirm & continue" accountUser={accountUser}>
      <div className="flex flex-col gap-5">
        <Badge tone="warning">Fallback path — used only when a lender has no redirect URL on file</Badge>
        <div>
          <h1 className="text-2xl font-extrabold">Confirm your loan</h1>
          <p className="text-muted-foreground mt-2 text-sm">Review your selected offer from {lenderName} before we proceed.</p>
        </div>

        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric k="Loan amount" v={fmtINR(selectedOffer.amount)} />
            <Metric k="Est. APR" v={`${selectedOffer.apr}%`} />
            <Metric k="Tenure" v={`${selectedOffer.tenureMonths} mo`} />
            <Metric k="Monthly EMI" v={selectedOffer.emi > 0 ? fmtINR(selectedOffer.emi) : '—'} />
          </div>
        </Card>

        <div>
          <SectionLabel>Important disclosure</SectionLabel>
          <p className="text-muted-foreground text-xs leading-relaxed">
            SwiftLoan is a loan facilitation platform (LSP) and credit mediator —{' '}
            <strong className="text-foreground">not the lender</strong>. {lenderName}, an RBI-registered NBFC, will disburse and
            service this loan directly.
          </p>
        </div>

        <div>
          <SectionLabel>What we&apos;ll share with {lenderName}</SectionLabel>
          <div className="flex flex-col gap-2">
            {DOCS.map((d) => (
              <div key={d} className="flex items-center gap-2.5 text-sm">
                <span className="text-mint font-extrabold">✓</span>
                {d}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-danger text-sm font-semibold">{error}</p>}

        <button
          onClick={confirm}
          disabled={loading}
          className="bg-brand-gradient text-primary-foreground w-full rounded-full py-3.5 text-base font-bold"
        >
          {loading ? 'Confirming…' : 'Confirm & continue →'}
        </button>
      </div>
    </ApplyShell>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-muted rounded-lg px-3 py-2">
      <div className="text-muted-foreground text-[10px] font-bold uppercase">{k}</div>
      <div className="text-foreground mt-0.5 text-sm font-extrabold">{v}</div>
    </div>
  );
}
