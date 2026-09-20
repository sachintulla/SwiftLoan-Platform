'use client';

import Link from 'next/link';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { fmtINR } from '@/lib/core';

export default function SuccessPage() {
  const { applicationId, selectedOffer } = useApply();
  const accountUser = useAccountUser();

  return (
    <ApplyShell center accountUser={accountUser}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="bg-brand-gradient grid h-20 w-20 place-items-center rounded-full text-3xl text-white shadow-[var(--shadow-float)]">
          ✓
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">You&apos;re all set! 🎉</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your application has been submitted{selectedOffer?.lenderName ? ` to ${selectedOffer.lenderName}` : ''}. They&apos;ll
            reach out shortly to complete verification and disburse your loan.
          </p>
        </div>

        {selectedOffer && (
          <div className="border-border w-full rounded-2xl border bg-card p-5 text-left text-sm">
            <Row k="Loan amount" v={fmtINR(selectedOffer.amount)} />
            <Row k="Lender" v={selectedOffer.lenderName ?? '—'} />
            <Row k="Status" v="In review" last />
          </div>
        )}

        <div className="flex w-full gap-3">
          {applicationId && (
            <Link href={`/account/${applicationId}`} className="border-border flex-1 rounded-full border px-4 py-3 text-center text-sm font-bold">
              Track status
            </Link>
          )}
          <Link href="/account" className="bg-brand-gradient text-primary-foreground flex-1 rounded-full px-4 py-3 text-center text-sm font-bold">
            My applications
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
