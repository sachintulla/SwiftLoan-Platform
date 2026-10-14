'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { fmtINR } from '@/lib/core';
import { useCopy } from '@/lib/i18n';
import { applyFlowCopy } from '@/i18n/apply-flow';

export default function SuccessPage() {
  const t = useCopy(applyFlowCopy).success;
  const { applicationId, selectedOffer } = useApply();
  const accountUser = useAccountUser();

  return (
    <ApplyShell center accountUser={accountUser}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="bg-brand-gradient grid h-20 w-20 place-items-center rounded-full text-white shadow-[var(--shadow-float)]">
          <Check className="h-9 w-9" strokeWidth={3} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t.submitted(selectedOffer?.lenderName)}
          </p>
        </div>

        {selectedOffer && (
          <div className="border-border w-full rounded-2xl border bg-card p-5 text-left text-sm">
            <Row k={t.loanAmount} v={fmtINR(selectedOffer.amount)} />
            <Row k={t.lender} v={selectedOffer.lenderName ?? '—'} />
            <Row k={t.status} v={t.inReview} last />
          </div>
        )}

        <div className="flex w-full gap-3">
          {applicationId && (
            <Link href={`/account/${applicationId}`} className="border-border flex-1 rounded-full border px-4 py-3 text-center text-sm font-bold">
              {t.trackStatus}
            </Link>
          )}
          <Link href="/account" className="bg-brand-gradient text-primary-foreground flex-1 rounded-full px-4 py-3 text-center text-sm font-bold">
            {t.myApplications}
          </Link>
        </div>
      </div>
    </ApplyShell>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={`flex justify-between py-2.5 ${last ? '' : 'border-border border-b'}`}>
      <span className="text-muted-foreground">{k}</span>
      <strong>{v}</strong>
    </div>
  );
}
