'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AccountShell } from '@/components/apply/AccountShell';
import { Badge } from '@/components/apply/primitives';
import { useAccount } from '@/lib/accountContext';
import { listApplications, type LoanApplication } from '@/lib/applyApi';
import { fmtINR } from '@/lib/core';
import { useStatusMeta } from '@/lib/statusMeta';
import { useCopy } from '@/lib/i18n';
import { accountCopy } from '@/i18n/account';
import { altOffersCopy } from '@/i18n/apply-altoffers';
import { AltOfferConfirm } from '@/components/apply/AltOfferConfirm';
import { useAltOffer } from '@/hooks/useAltOffer';
import { altStatusTone, appliedReferrals, type AppliedReferral } from '@/lib/altOfferLogic';

export default function ApplicationsPage() {
  const { loading: accountLoading, user } = useAccount();
  const t = useCopy(accountCopy);
  const statusMeta = useStatusMeta();
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (accountLoading) return;
    listApplications()
      .then(setApps)
      .finally(() => setLoading(false));
  }, [accountLoading]);

  const name = (user?.fullName as string)?.split(' ')[0] || t.guestName;

  return (
    <AccountShell>
      {/* Phones: stacked, so the greeting isn't squeezed beside the button. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{t.welcome(name)}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t.welcomeSub}</p>
        </div>
        <Link href="/apply/step-1" className="border-border self-start rounded-full border px-4 py-2 text-sm font-bold whitespace-nowrap">
          {t.applyNew}
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {loading || accountLoading ? (
          <p className="text-muted-foreground text-sm" aria-busy="true">{t.loading}</p>
        ) : apps.length === 0 ? (
          <div className="border-border rounded-2xl border border-dashed p-8 text-center">
            <p className="text-sm font-bold">{t.noApplications}</p>
            <p className="text-muted-foreground mt-1 text-xs">{t.noApplicationsSub}</p>
          </div>
        ) : (
          apps.flatMap((app) => {
            // Partner (Yubi / YMPL) applications the applicant proceeded with — one row each,
            // like the app's My Loans. Reopens the partner journey, which resumes at its offers.
            const partnerRows = appliedReferrals(app).map((pr) => (
              <PartnerReferralRow key={`pr-${pr.id}`} applicationId={app.id} referral={pr} amount={app.amount} />
            ));
            const rows = (app.lenderApplications?.length ? app.lenderApplications : [{ id: app.id, lenderName: null, status: app.status, amount: app.amount, apr: null, emi: null, tenureMonths: app.tenureMonths, redirectionUrl: null, appliedAt: app.updatedAt }]);
            return [...rows.map((la) => {
              const meta = statusMeta(la.status);
              return (
                <Link
                  key={la.id}
                  href={la.id === app.id ? `/account/${app.id}` : `/account/${app.id}?la=${la.id}`}
                  className="border-border flex items-center gap-3.5 rounded-2xl border bg-card p-4"
                >
                  <div className="bg-accent text-primary grid h-11 w-11 place-items-center rounded-xl text-sm font-extrabold">
                    {(la.lenderName || 'SL').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {la.lenderName || t.personalLoan}
                      {la.lenderName && <span className="text-muted-foreground font-medium"> · {t.personalLoan}</span>}
                    </div>
                    <div className="text-muted-foreground text-xs">{t.ref(app.ref)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold">{fmtINR(la.amount)}</div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </Link>
              );
            }), ...partnerRows];
          })
        )}
      </div>
    </AccountShell>
  );
}

function PartnerReferralRow({ applicationId, referral, amount }: { applicationId: string; referral: AppliedReferral; amount: number }) {
  const t = useCopy(altOffersCopy);
  const { opening, error, asking, open, answer } = useAltOffer(applicationId);
  const tone = altStatusTone(referral.lastStatus);
  const label = tone === 'approved' ? t.statusApproved : tone === 'rejected' ? t.statusRejected : t.statusInProgress;
  const badge = tone === 'approved' ? 'success' : tone === 'rejected' ? 'danger' : 'warning';
  return (
    <div data-testid="partner-referral-row">
      <button
        type="button"
        onClick={open}
        disabled={opening}
        aria-label={t.reopen}
        className="border-border bg-card flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left"
      >
        <div className="bg-accent text-primary grid h-11 w-11 place-items-center rounded-xl text-sm font-extrabold">AL</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{referral.appliedLender || t.rowTitle}</div>
          <div className="text-muted-foreground text-xs">{t.rowLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-extrabold">{fmtINR(amount)}</div>
          <Badge tone={badge}>{label}</Badge>
        </div>
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
      </button>
      {error && <p className="text-danger mt-1 text-xs font-semibold" role="alert">{error}</p>}
      <AltOfferConfirm open={asking} onAnswer={answer} />
    </div>
  );
}
