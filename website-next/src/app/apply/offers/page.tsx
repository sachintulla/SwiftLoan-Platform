'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { Badge, Card, PrimaryButton, SecondaryButton } from '@/components/apply/primitives';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { applyOffer, getApplication, type LoanApplication, type Offer } from '@/lib/applyApi';

export default function OffersPage() {
  const router = useRouter();
  const { applicationId, setSelectedOffer } = useApply();
  const accountUser = useAccountUser();
  const [app, setApp] = useState<LoanApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!applicationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getApplication(applicationId)
      .then(setApp)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your offers.'))
      .finally(() => setLoading(false));
  }, [applicationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-runs the SAME eligibility check the initial application went through
  // — via the Finding screen itself (rotating ring, progress bar, "checking
  // your eligibility"), not a bare button spinner. That screen already calls
  // POST /:id/prequalify and lands back here on /apply/offers when it's done.
  const retry = () => router.push('/apply/finding');

  const pickOffer = async (offer: Offer) => {
    if (!applicationId || applyingId) return;
    setApplyingId(offer.id);
    try {
      await applyOffer(applicationId, offer.id);
      setSelectedOffer({
        id: offer.id,
        lenderName: offer.lenderName ?? offer.partner?.name ?? null,
        redirectionUrl: offer.redirectionUrl,
        amount: offer.amount,
        apr: offer.apr,
        emi: offer.emi,
        tenureMonths: offer.tenureMonths,
      });
      router.push(offer.redirectionUrl ? '/apply/lender' : '/apply/confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply to this offer. Please try again.');
      setApplyingId(null);
    }
  };

  if (!applicationId) {
    return (
      <ApplyShell stepLabel="Your offers" center accountUser={accountUser}>
        <h1 className="text-xl font-extrabold">No application yet</h1>
        <p className="text-muted-foreground mt-2 mb-6 text-sm">Apply for a loan to see personalised offers here.</p>
        <PrimaryButton onClick={() => router.push('/apply/step-1')}>Apply for a loan</PrimaryButton>
      </ApplyShell>
    );
  }

  if (loading) {
    return (
      <ApplyShell stepLabel="Your offers" center accountUser={accountUser}>
        <p className="text-muted-foreground text-sm">Loading your offers…</p>
      </ApplyShell>
    );
  }

  if (error && !app) {
    return (
      <ApplyShell stepLabel="Your offers" center accountUser={accountUser}>
        <p className="text-danger mb-4 text-sm font-semibold">{error}</p>
        <SecondaryButton onClick={load}>Retry</SecondaryButton>
      </ApplyShell>
    );
  }

  const offers = app?.offers ?? [];

  return (
    <ApplyShell backHref="/apply/step-1" backLabel="Update details" stepLabel="Your offers" progressPct={100} accountUser={accountUser}>
      <div className="flex flex-col gap-5">
        {offers.length === 0 ? (
          <div className="py-10 text-center">
            <h1 className="text-xl font-extrabold">No offers yet</h1>
            <p className="text-muted-foreground mt-2 mb-6 text-sm">
              We couldn&apos;t find a matching offer right now — update something in your application, or just try the check
              again.
            </p>
            <div className="flex justify-center gap-3">
              <SecondaryButton onClick={() => router.push('/apply/step-1')}>Update details</SecondaryButton>
              <button
                onClick={retry}
                className="bg-brand-gradient text-primary-foreground inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-bold"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-extrabold">
                {offers.length === 1 ? 'You have 1 offer!' : `Great news — you have ${offers.length} offers!`}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">Compare and choose the offer that works best for you.</p>
            </div>

            {offers.map((offer, i) => {
              const lenderName = offer.lenderName ?? offer.partner?.name ?? 'Lender';
              const hasEmi = !!offer.emiOptions?.length || offer.emi > 0;
              const applying = applyingId === offer.id;
              return (
                <Card key={offer.id} className={i === 0 ? 'border-primary' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-accent text-primary grid h-11 w-11 place-items-center rounded-xl text-sm font-extrabold">
                        {lenderName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-foreground text-sm font-extrabold">{lenderName}</div>
                        <div className="text-muted-foreground text-xs">NBFC · RBI Registered</div>
                      </div>
                    </div>
                    {i === 0 ? <Badge tone="success">★ High match</Badge> : <Badge tone="warning">Pending eligibility</Badge>}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2.5">
                    {hasEmi ? (
                      <>
                        <Metric k="Monthly EMI" v={fmtINR(offer.emi)} />
                        <Metric k="Tenure" v={`${offer.tenureMonths} mo`} />
                        <Metric k="Interest" v={`${offer.apr}% p.a.`} />
                      </>
                    ) : (
                      <>
                        <Metric k="Eligible amount" v={fmtINR(offer.amount)} />
                        <Metric k="Interest rate" v={`${offer.apr}% p.a.`} />
                        <Metric k="Disbursal" v="24-48 hrs" />
                      </>
                    )}
                  </div>

                  {offer.processingFeeAmount != null && (
                    <div className="bg-muted text-muted-foreground mt-3 flex justify-between rounded-lg px-3 py-2 text-xs">
                      <span>Processing fee {fmtINR(offer.processingFeeAmount)}</span>
                      {offer.netDisbursalAmount != null && (
                        <span>
                          Net disbursal <strong className="text-foreground">{fmtINR(offer.netDisbursalAmount)}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => pickOffer(offer)}
                    disabled={!!applyingId}
                    className={`bg-brand-gradient text-primary-foreground mt-4 w-full rounded-full py-3 text-sm font-bold ${applyingId && !applying ? 'opacity-50' : ''}`}
                  >
                    {applying ? 'Applying…' : offer.applied ? 'Apply Again' : offer.redirectionUrl ? 'Apply →' : 'Select this offer'}
                  </button>
                  {offer.redirectionUrl && (
                    <p className="text-muted-foreground mt-1.5 text-center text-[10px]">Opens {lenderName}&apos;s own secure application page</p>
                  )}
                </Card>
              );
            })}

            <div className="bg-muted text-muted-foreground rounded-2xl p-4 text-xs">
              <strong className="text-foreground">Offer validity —</strong> these offers are valid for 24 hours and are based on
              a soft credit check that does not affect your credit score.
            </div>
          </>
        )}
        {error && <p className="text-danger text-xs font-semibold">{error}</p>}
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
