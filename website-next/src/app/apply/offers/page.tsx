'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { Badge, PrimaryButton, SecondaryButton } from '@/components/apply/primitives';
import { LenderLogo, prettyLenderName } from '@/components/apply/LenderLogo';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { getApplication, listApplications, type LoanApplication } from '@/lib/applyApi';
import { useApplyToOffer } from '@/hooks/useApplyToOffer';
import { ArrowRight, Lock, Scale, ShieldCheck } from 'lucide-react';
import { useCopy } from '@/lib/i18n';
import { applyOffersCopy } from '@/i18n/apply-offers';

// Same statuses the app's My Offers tab (fare.tsx) treats as "still carries
// showable offers".
const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

export default function OffersPage() {
  const router = useRouter();
  const t = useCopy(applyOffersCopy);
  // Read inside load() without making a language switch re-fetch the offers.
  const tRef = useRef(t);
  tRef.current = t;
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
        .catch((e) => setLoadError(e instanceof Error ? e.message : tRef.current.loadFailed))
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
      .catch((e) => setLoadError(e instanceof Error ? e.message : tRef.current.loadFailed))
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
      <ApplyShell center accountUser={accountUser}>
        <p className="text-muted-foreground text-sm" aria-busy="true">{t.loading}</p>
      </ApplyShell>
    );
  }

  // Checked only once sessionReady (and thus applicationId, if any, synced in
  // from sessionStorage) — checking this before sessionReady flashed "No
  // application yet" for a returning visitor for one paint before the real
  // id loaded a tick later.
  if (!applicationId) {
    return (
      <ApplyShell center accountUser={accountUser}>
        <h1 className="text-xl font-extrabold">{t.noApplicationTitle}</h1>
        <p className="text-muted-foreground mt-2 mb-6 text-sm">{t.noApplicationBody}</p>
        <PrimaryButton onClick={() => router.push('/apply/step-1')}>{t.applyForLoan}</PrimaryButton>
      </ApplyShell>
    );
  }

  if (error && !app) {
    return (
      <ApplyShell center accountUser={accountUser}>
        <p className="text-danger mb-4 text-sm font-semibold">{error}</p>
        <SecondaryButton onClick={load}>{t.retry}</SecondaryButton>
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
  const lowestApr = Math.min(...offers.filter((o) => o.apr > 0).map((o) => o.apr));

  return (
    <ApplyShell progressPct={100} accountUser={accountUser} wide>
      <div className="flex flex-col gap-5">
        {allOffers.length === 0 ? (
          // Two real, different situations were showing the exact same copy:
          // a genuine "you don't qualify" decline from Aurix (status
          // 'rejected', with Aurix's own real reason) vs an actual technical
          // failure (status 'failed', where retrying is likely to work).
          // Older applications from before prequalifyReason existed fall
          // through to the original generic copy.
          app?.status === 'rejected' ? (
            <div className="py-10 text-center">
              <h1 className="text-xl font-extrabold">{t.notEligibleTitle}</h1>
              <p className="text-muted-foreground mt-2 mb-6 text-sm">
                {app.prequalifyReason ?? t.notEligibleFallback}
              </p>
              <div className="flex justify-center gap-3">
                <SecondaryButton onClick={() => router.push('/apply/step-1')}>{t.updateDetails}</SecondaryButton>
                <button
                  onClick={retry}
                  className="bg-brand-gradient text-primary-foreground inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-bold"
                >
                  {t.retry}
                </button>
              </div>
            </div>
          ) : app?.status === 'failed' ? (
            <div className="py-10 text-center">
              <h1 className="text-xl font-extrabold">{t.failedTitle}</h1>
              <p className="text-muted-foreground mt-2 mb-6 text-sm">
                {app.prequalifyReason ?? t.failedFallback}
              </p>
              <div className="flex justify-center gap-3">
                <SecondaryButton onClick={() => router.push('/apply/step-1')}>{t.updateDetails}</SecondaryButton>
                <button
                  onClick={retry}
                  className="bg-brand-gradient text-primary-foreground inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-bold"
                >
                  {t.retry}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center">
              <h1 className="text-xl font-extrabold">{t.noOffersTitle}</h1>
              <p className="text-muted-foreground mt-2 mb-6 text-sm">
                {t.noOffersBody}
              </p>
              <div className="flex justify-center gap-3">
                <SecondaryButton onClick={() => router.push('/apply/step-1')}>{t.updateDetails}</SecondaryButton>
                <button
                  onClick={retry}
                  className="bg-brand-gradient text-primary-foreground inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-bold"
                >
                  {t.retry}
                </button>
              </div>
            </div>
          )
        ) : appliedElsewhere ? (
          <div className="py-10 text-center">
            <h1 className="text-xl font-extrabold">{t.appliedTitle}</h1>
            <p className="text-muted-foreground mt-2 mb-6 text-sm">
              {t.appliedBody}
            </p>
            <PrimaryButton onClick={() => router.push(`/account/${applicationId}`)}>{t.goToApplications}</PrimaryButton>
          </div>
        ) : (
          <>
            <div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-2xl font-extrabold">
                    {offers.length === 1 ? t.oneOffer : t.manyOffers(offers.length)}
                  </h1>
                  <p className="text-muted-foreground mt-2 text-sm">{t.compareSubtitle}</p>
                </div>
                {offers.length >= 2 && (
                  <button
                    onClick={() => router.push('/apply/compare')}
                    className="border-primary text-primary hover:bg-accent inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full border-2 px-5 py-3 text-sm font-bold whitespace-nowrap transition-colors sm:w-auto"
                  >
                    <Scale className="h-4 w-4" />
                    {t.compareAll(offers.length)}
                  </button>
                )}
              </div>
              {allOffers.length > offers.length && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t.alreadyApplied(allOffers.length - offers.length)}{' '}
                  <button onClick={() => router.push(`/account/${applicationId}`)} className="text-primary font-semibold underline">
                    {t.viewInApplications}
                  </button>
                  {t.sentenceEnd}
                </p>
              )}
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,420px),1fr))] items-stretch gap-5">
            {offers.map((offer) => {
              const lenderName = prettyLenderName(offer.lenderName ?? offer.partner?.name ?? t.lenderFallback);
              // No rate yet (lender confirms it after approval): never show
              // "0% p.a." or an EMI computed at 0% — both would be wrong.
              const rateOnApproval = !(offer.apr > 0);
              const hasEmi = !rateOnApproval && (!!offer.emiOptions?.length || offer.emi > 0);
              const applying = applyingId === offer.id;
              // Real signals from the lender/partner feed — mirrors
              // offers.tsx's OfferCard exactly.
              const highMatch = !!offer.offerLikelihood && offer.offerLikelihood !== '0';
              const lowestRate = offer.apr > 0 && offer.apr === lowestApr && offers.length > 1;
              return (
                <article
                  key={offer.id}
                  className={`bg-card flex flex-col overflow-hidden rounded-3xl border transition-shadow hover:shadow-[var(--shadow-float)] ${
                    highMatch || offer.recommended ? 'border-primary/60 shadow-[var(--shadow-soft)]' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 p-5 pb-4">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <LenderLogo name={lenderName} logoUrl={offer.lenderLogoUrl} />
                      <div className="min-w-0">
                        <h2 className="text-foreground line-clamp-2 text-base leading-snug font-extrabold">{lenderName}</h2>
                        <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs font-medium">
                          <ShieldCheck className="text-mint h-3.5 w-3.5" /> {t.rbiLender}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {highMatch && <Badge tone="success">{t.highMatch}</Badge>}
                      {lowestRate && <Badge tone="info">{t.lowestRate}</Badge>}
                    </div>
                  </div>

                  <div className="border-border bg-muted/50 grid grid-cols-3 divide-x divide-border border-y">
                    {hasEmi ? (
                      <>
                        <Stat k={t.loanAmount} v={fmtINR(offer.amount)} sub={t.overMonths(offer.tenureMonths)} />
                        <Stat k={t.monthlyEmi} v={fmtINR(offer.emi)} accent />
                        <Stat k={t.interestRate} v={`${offer.apr}%`} sub={t.perAnnum} />
                      </>
                    ) : (
                      <>
                        <Stat k={t.eligibleAmount} v={fmtINR(offer.amount)} />
                        <Stat k={t.interestRate} v={rateOnApproval ? t.onApproval : `${offer.apr}%`} sub={rateOnApproval ? undefined : t.perAnnum} />
                        <Stat k={t.disbursal} v={t.disbursalTime} />
                      </>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-5 pt-4">
                    {offer.processingFeeAmount != null && (
                      <dl className="text-muted-foreground mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                        <div className="flex gap-1.5">
                          <dt>{t.processingFee}</dt>
                          <dd className="text-foreground font-bold">{fmtINR(offer.processingFeeAmount)}</dd>
                        </div>
                        {offer.netDisbursalAmount != null && (
                          <div className="flex gap-1.5">
                            <dt>{t.youReceive}</dt>
                            <dd className="text-foreground font-bold">{fmtINR(offer.netDisbursalAmount)}</dd>
                          </div>
                        )}
                      </dl>
                    )}

                    <button
                      onClick={() => pickOffer(offer)}
                      disabled={!!applyingId}
                      data-voice-gate="apply-offer"
                      className={`bg-brand-gradient text-primary-foreground mt-auto inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${applyingId && !applying ? 'opacity-50' : ''}`}
                    >
                      {applying ? t.applying : offer.redirectionUrl ? t.applyNow : t.selectOffer}
                      {!applying && <ArrowRight className="h-4 w-4" />}
                    </button>
                    {offer.redirectionUrl && (
                      <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1 text-[11px]">
                        <Lock className="h-3 w-3" /> {t.continuesOn(lenderName)}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
            </div>

            <div className="bg-muted text-muted-foreground rounded-2xl p-4 text-xs">
              <strong className="text-foreground">{t.validityLabel}</strong> {t.validityBody}
            </div>
          </>
        )}
        {error && <p className="text-danger text-xs font-semibold">{error}</p>}
      </div>
    </ApplyShell>
  );
}

function Stat({ k, v, sub, accent }: { k: string; v: string; sub?: string; accent?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-3.5 sm:px-4">
      <div className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">{k}</div>
      <div className={`mt-1 text-[13px] font-extrabold whitespace-nowrap sm:text-[15px] ${accent ? 'text-primary' : 'text-foreground'}`}>{v}</div>
      {sub && <div className="text-muted-foreground mt-0.5 text-[11px]">{sub}</div>}
    </div>
  );
}
