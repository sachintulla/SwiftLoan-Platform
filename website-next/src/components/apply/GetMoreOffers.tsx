'use client';

import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useCopy } from '@/lib/i18n';
import { altOffersCopy } from '@/i18n/apply-altoffers';
import { useAltOffer } from '@/hooks/useAltOffer';
import { AltOfferConfirm } from '@/components/apply/AltOfferConfirm';

/**
 * "Get more offers" — the website twin of the app's alternative-offers tile.
 * `variant="default"` sits below the matched offers; `variant="empty"` replaces the
 * dead end when nothing matched. Clicking takes the visitor to the partner journey
 * in this tab. Renders nothing until the server flag is on and an application exists.
 */
export function GetMoreOffers({
  applicationId,
  variant = 'default',
}: {
  applicationId: string | null | undefined;
  variant?: 'default' | 'empty';
}) {
  const t = useCopy(altOffersCopy);
  const { available, opening, error, asking, added, open, answer } = useAltOffer(applicationId);
  const empty = variant === 'empty';

  return (
    <>
      {available && (
        <div data-testid="get-more-offers">
          <button
            type="button"
            onClick={open}
            disabled={opening}
            aria-busy={opening}
            data-voice-gate="explore-lenders"
            className={`flex w-full items-center gap-3.5 rounded-3xl border-[1.5px] p-4 text-left transition-shadow hover:shadow-[var(--shadow-float)] disabled:opacity-80 ${
              empty ? 'border-primary/40 bg-accent' : 'border-primary/30 bg-accent/60'
            }`}
          >
            <span className="bg-accent text-primary grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
              {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground block text-base font-extrabold">{t.getMoreOffers}</span>
              <span className="text-muted-foreground mt-0.5 block text-xs font-medium">
                {opening ? t.redirecting : empty ? t.emptySub : t.tileSub}
              </span>
            </span>
            <span className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-0.5 rounded-xl py-2 pr-2 pl-3 text-sm font-bold">
              {t.cta}
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
          {error && (
            <p className="text-danger mt-2 text-xs font-semibold" role="alert">
              {error}
            </p>
          )}
          {added && (
            <p className="text-mint mt-2 text-xs font-semibold" role="status">
              {t.added}
            </p>
          )}
        </div>
      )}
      <AltOfferConfirm open={asking} onAnswer={answer} />
    </>
  );
}
