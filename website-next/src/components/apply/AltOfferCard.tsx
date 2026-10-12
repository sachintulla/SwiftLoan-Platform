'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Loader2, Sparkles, Store } from 'lucide-react';
import { useCopy } from '@/lib/i18n';
import { altOffersCopy } from '@/i18n/apply-altoffers';
import { useAltOffer } from '@/hooks/useAltOffer';

/**
 * "Did you proceed with an offer?" — asked when the visitor is back from the
 * partner's page. Esc / backdrop = "Not yet".
 */
export function AltOfferConfirm({
  open,
  onAnswer,
}: {
  open: boolean;
  onAnswer: (proceeded: boolean) => void;
}) {
  const t = useCopy(altOffersCopy);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAnswer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onAnswer]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={() => onAnswer(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alt-confirm-title"
        className="bg-card w-full max-w-sm rounded-3xl p-6 shadow-[var(--shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="alt-confirm-title" className="text-lg font-extrabold">{t.confirmTitle}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{t.confirmBody}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            onClick={() => onAnswer(true)}
            data-testid="alt-confirm-yes"
            className="bg-brand-gradient text-primary-foreground w-full rounded-full px-5 py-3 text-sm font-bold"
          >
            {t.confirmYes}
          </button>
          <button
            onClick={() => onAnswer(false)}
            data-testid="alt-confirm-no"
            className="border-border w-full rounded-full border px-5 py-3 text-sm font-bold"
          >
            {t.confirmNo}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Alternative-offers tile (Yubi Markets / YMPL facility) — the website twin of the
 * app's AltOfferTile. `variant="default"` sits below the matched offers;
 * `variant="empty"` replaces the dead end when no offer matched. Renders nothing
 * until the server flag is on and an application exists.
 */
export function AltOfferCard({
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
        <div data-testid="alt-offer-card">
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
              {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Store className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground block truncate text-base font-extrabold">
                {empty ? t.emptyTitle : t.tileTitle}
              </span>
              <span className="border-border bg-card text-mint mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold">
                <Sparkles className="h-2.5 w-2.5" /> {t.partnerLabel}
              </span>
              <span className="text-muted-foreground mt-1 block text-xs font-medium">
                {opening ? t.opening : empty ? t.emptySub : t.tileSub}
              </span>
            </span>
            <span className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-0.5 rounded-xl py-2 pr-2 pl-3 text-sm font-bold">
              {t.cta}
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
          {error && <p className="text-danger mt-2 text-xs font-semibold" role="alert">{error}</p>}
          {added && <p className="text-mint mt-2 text-xs font-semibold" role="status">{t.added}</p>}
        </div>
      )}
      <AltOfferConfirm open={asking} onAnswer={answer} />
    </>
  );
}
