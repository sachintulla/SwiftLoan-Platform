'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AccountShell } from '@/components/apply/AccountShell';
import { Badge } from '@/components/apply/primitives';
import { useAccount } from '@/lib/accountContext';
import { listApplications, type LoanApplication } from '@/lib/applyApi';
import { fmtINR } from '@/lib/core';
import { statusMeta } from '@/lib/statusMeta';

export default function ApplicationsPage() {
  const { loading: accountLoading, user } = useAccount();
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (accountLoading) return;
    listApplications()
      .then(setApps)
      .finally(() => setLoading(false));
  }, [accountLoading]);

  const name = (user?.fullName as string)?.split(' ')[0] || 'there';

  return (
    <AccountShell>
      {/* Phones: stacked, so the greeting isn't squeezed beside the button. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">Welcome back, {name} 👋</h1>
          <p className="text-muted-foreground mt-1 text-sm">Here&apos;s where your loan applications stand.</p>
        </div>
        <Link href="/apply/step-1" className="border-border self-start rounded-full border px-4 py-2 text-sm font-bold whitespace-nowrap">
          + Apply for a new loan
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {loading || accountLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : apps.length === 0 ? (
          <div className="border-border rounded-2xl border border-dashed p-8 text-center">
            <p className="text-sm font-bold">No applications yet</p>
            <p className="text-muted-foreground mt-1 text-xs">Apply for a loan to track it here.</p>
          </div>
        ) : (
          apps.flatMap((app) => {
            const rows = (app.lenderApplications?.length ? app.lenderApplications : [{ id: app.id, lenderName: null, status: app.status, amount: app.amount, apr: null, emi: null, tenureMonths: app.tenureMonths, redirectionUrl: null, appliedAt: app.updatedAt }]);
            return rows.map((la) => {
              const meta = statusMeta(la.status);
              return (
                <Link
                  key={la.id}
                  href={`/account/${app.id}`}
                  className="border-border flex items-center gap-3.5 rounded-2xl border bg-card p-4"
                >
                  <div className="bg-accent text-primary grid h-11 w-11 place-items-center rounded-xl text-sm font-extrabold">
                    {(la.lenderName || 'SL').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {la.lenderName || 'Personal Loan'}
                      {la.lenderName && <span className="text-muted-foreground font-medium"> · Personal Loan</span>}
                    </div>
                    <div className="text-muted-foreground text-xs">Ref {app.ref}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold">{fmtINR(la.amount)}</div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </Link>
              );
            });
          })
        )}
      </div>
    </AccountShell>
  );
}
