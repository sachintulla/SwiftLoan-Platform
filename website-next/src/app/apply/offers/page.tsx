'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { Badge, Card, PrimaryButton, SecondaryButton } from '@/components/apply/primitives';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { getApplication, listApplications, type LoanApplication } from '@/lib/applyApi';
import { useApplyToOffer } from '@/hooks/useApplyToOffer';
import { Scale } from 'lucide-react';

// Same statuses the app's My Offers tab (fare.tsx) treats as "still carries
// showable offers".
const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

export default function OffersPage() {
  const router = useRouter();
  const { applicationId, sessionReady, setApplicationId } = useApply();
  const accountUser = useAccountUser();
  const [app, setApp] = useState<LoanApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { apply: pickOffer, applyingId, error: applyError } = useApplyToOffer();
  const error = loadError ?? applyError;

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    if (applicationId) {
      getApplication(applicationId)
        .then(setApp)
        .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load your offers.'))
        .finally(() => setLoading(false));
      return;
    }
    // No application in this session yet — reached here directly (e.g. the
    // account sidebar's "My Offers" link) rather than mid-funnel. Mirrors the
    // app's own My Offers tab (fare.tsx): a persistent destination for your
    // current eligible offers, not something that only exists while mid-way
    // through applying. Adopt the most recent application that actually
    // carries offers — not just the most recent application overall, which
    // may be a newer, still-in-progress one with none yet.
    listApplications()
      .then((apps) => {
        const withOffers =
          apps.find((a) => (a.offers?.length ?? 0) > 0 && OFFER_STATUSES.includes(a.status)) ??
          apps.find((a) => (a.offers?.length ?? 0) > 0) ??
          apps[0] ??
          null;
        if (withOffers) {
          setApplicationId(withOffers.id);
          setApp(withOffers);
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load your offers.'))
      .finally(() => setLoading(false));
  }, [applicationId, setApplicationId]);

  useEffect(() => {
    // Wait for ApplyProvider to sync applicationId in from sessionStorage —
    // otherwise a returning visitor briefly flashes "No application yet"
    // before the real id loads a tick later. See applyContext.tsx.
    if (!sessionReady) return;
    load();
  }, [sessionReady, load]);

  // Re-runs the SAME eligibility check the initial application went through
  // — via the Finding screen itself (rotating ring, progress bar, "checking
  // your eligibility"), not a bare button spinner. That screen already calls
  // POST /:id/prequalify and lands back here on /apply/offers when it's done.
  const retry = () => router.push('/apply/finding');

  if (!sessionReady || loading) {
    return (
      <ApplyShell stepLabel="Your offers" center accountUser={accountUser}>
        <p className="text-muted-foreground text-sm">Loading your offers…</p>
      </ApplyShell>
    );
  }

  // Checked only once sessionReady (and thus applicationId, if any, synced in
  // from sessionStorage) — checking this before sessionReady flashed "No
  // application yet" for a returning visitor for one paint before the real
  // id loaded a tick later.
  if (!applicationId) {
    return (
      <ApplyShell stepLabel="Your offers" center accountUser={accountUser}>
        <h1 className="text-xl font-extrabold">No application yet</h1>
        <p className="text-muted-foreground mt-2 mb-6 text-sm">Apply for a loan to see personalised offers here.</p>
        <PrimaryButton onClick={() => router.push('/apply/step-1')}>Apply for a loan</PrimaryButton>
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

  // Once you've applied to an offer, it's committed — it moves to My
  // Applications and drops out of this list so it can't be applied to again
  // from here. Offers you haven't applied to yet stay, so you can still
  // compare and apply to a different lender.
  const allOffers = app?.offers ?? [];
  const offers = allOffers.filter((o) => !o.applied);
  const appliedElsewhere = allOffers.length > 0 && offers.length === 0;

  return (
    <ApplyShell backHref="/apply/step-1" backLabel="Update details" stepLabel="Your offers" progressPct={100} accountUser={accountUser}>
      <div className="flex flex-col gap-5">
        {allOffers.length === 0 ? (
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
        ) : appliedElsewhere ? (
          <div className="py-10 text-center">
            <h1 className="text-xl font-extrabold">You&apos;ve already applied</h1>
            <p className="text-muted-foreground mt-2 mb-6 text-sm">
              Track its status, offer details and next steps anytime in My Applications.
            </p>
            <PrimaryButton onClick={() => router.push(`/account/${applicationId}`)}>Go to My Applications</PrimaryButton>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-extrabold">
                {offers.length === 1 ? 'You have 1 offer!' : `Great news — you have ${offers.length} offers!`}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">Compare and choose the offer that works best for you.</p>
              {offers.length >= 2 && (
                <button
                  onClick={() => router.push('/apply/compare')}
                  className="border-primary text-primary hover:bg-accent mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border-2 px-5 py-3 text-sm font-bold transition-colors sm:w-auto"
                >
                  <Scale className="h-4 w-4" />
                  Compare all {offers.length} offers side by side
                </button>
              )}
              {allOffers.length > offers.length && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Already applied to {allOffers.length - offers.length} offer{allOffers.length - offers.length > 1 ? 's' : ''} —{' '}
                  <button onClick={() => router.push(`/account/${applicationId}`)} className="text-primary font-semibold underline">
                    view in My Applications
                  </button>
                  .
                </p>
              )}
            </div>

            {offers.map((offer) => {
              const lenderName = offer.lenderName ?? offer.partner?.name ?? 'Lender';
              // No rate yet (lender confirms it after approval): never show
              // "0% p.a." or an EMI computed at 0% — both would be wrong.
              const rateOnApproval = !(offer.apr > 0);
              const hasEmi = !rateOnApproval && (!!offer.emiOptions?.length || offer.emi > 0);
              const applying = applyingId === offer.id;
              // Real signals from the lender/partner feed — mirrors
              // offers.tsx's OfferCard exactly. Previously this was
              // `i === 0 ? 'High match' : 'Pending eligibility'`, a purely
              // positional badge with no connection to any actual lender or
              // webhook status — "Pending eligibility" isn't a real state at
              // all, which is how it could show something at odds with what
              // the lender (via KFT) was actually reporting.
              const highMatch = !!offer.offerLikelihood && offer.offerLikelihood !== '0';
              return (
                <Card key={offer.id} className={offer.recommended ? 'border-primary' : ''}>
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
                    {highMatch && <Badge tone="success">★ High match</Badge>}
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
                        <Metric k="Interest rate" v={rateOnApproval ? 'On approval' : `${offer.apr}% p.a.`} />
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
                    {applying ? 'Applying…' : offer.redirectionUrl ? 'Apply →' : 'Select this offer'}
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
