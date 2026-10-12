'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { requestAltOffer, type AltOfferResult } from '@/lib/altOffers';
import { useCopy } from '@/lib/i18n';
import { altOffersCopy } from '@/i18n/apply-altoffers';
import type { useAltOffer } from '@/hooks/useAltOffer';

export type ExploreTab = 'instant' | 'explore';

/**
 * Two-source tab bar on My Offers — the website twin of the app's fare.tsx tabs:
 * "Instant offers" (matched offers) | "Explore lenders" (the partner journey, in place).
 */
export function OffersTabs({ tab, onChange }: { tab: ExploreTab; onChange: (t: ExploreTab) => void }) {
  const t = useCopy(altOffersCopy);
  const items: { key: ExploreTab; label: string }[] = [
    { key: 'instant', label: t.tabInstant },
    { key: 'explore', label: t.tabExplore },
  ];
  return (
    <div role="tablist" aria-label={t.tabExplore} className="border-border flex gap-6 border-b" data-testid="offers-tabs">
      {items.map(({ key, label }) => {
        const on = tab === key;
        return (
          <button
            key={key}
            role="tab"
            id={`offers-tab-${key}`}
            aria-selected={on}
            aria-controls={`offers-panel-${key}`}
            onClick={() => onChange(key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 pb-3 text-sm transition-colors ${
              on ? 'border-primary text-primary font-extrabold' : 'text-muted-foreground border-transparent font-semibold'
            }`}
          >
            {key === 'explore' && <Sparkles className="h-3.5 w-3.5" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

type Phase = 'loading' | 'ready' | 'error';

/**
 * The "Explore lenders" tab body. Mints a fresh partner journey URL
 * (POST /applications/:id/alt-offer) and shows it IN PLACE in an iframe — no
 * navigation. Partners can forbid framing (YMPL does today: X-Frame-Options DENY);
 * the server reports `embeddable` from the partner's own headers, and when it is
 * false the tab explains and opens the journey in a new tab instead, so the
 * visitor is never shown a blank "refused to connect" frame.
 */
export function ExploreLenders({
  applicationId,
  alt,
}: {
  applicationId: string;
  alt: Pick<ReturnType<typeof useAltOffer>, 'open' | 'opening' | 'error' | 'markOpened' | 'askNow' | 'asking'>;
}) {
  const t = useCopy(altOffersCopy);
  const [phase, setPhase] = useState<Phase>('loading');
  const [result, setResult] = useState<AltOfferResult | null>(null);
  const { markOpened, askNow, asking } = alt;
  const seq = useRef(0);
  // The embedded journey landed on /partner/return and the visitor is being asked whether they
  // proceeded; once they answer, start the journey afresh instead of leaving the frame on "Returning…".
  const returned = useRef(false);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setPhase('loading');
    try {
      const r = await requestAltOffer(applicationId);
      if (mine !== seq.current) return;
      if (r?.available && r.redirectUrl) {
        setResult(r);
        setPhase('ready');
        if (r.embeddable) markOpened();
      } else {
        setPhase('error');
      }
    } catch {
      if (mine === seq.current) setPhase('error');
    }
  }, [applicationId, markOpened]);

  useEffect(() => {
    load();
    return () => {
      seq.current++; // ignore a response that lands after the tab was left
    };
  }, [load]);

  // The partner sends the visitor back to /partner/return INSIDE the frame; that page tells us.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === 'sl-alt-return') {
        returned.current = true;
        askNow();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [askNow]);

  useEffect(() => {
    if (!asking && returned.current) {
      returned.current = false;
      load();
    }
  }, [asking, load]);

  if (phase === 'loading') {
    return (
      <div className="grid min-h-[320px] place-items-center text-center" role="status" aria-busy="true">
        <div>
          <Loader2 className="text-primary mx-auto h-7 w-7 animate-spin" />
          <p className="text-muted-foreground mt-3 text-sm font-semibold">{t.framePreparing}</p>
        </div>
      </div>
    );
  }

  if (phase === 'error' || !result?.redirectUrl) {
    return (
      <div className="grid min-h-[320px] place-items-center text-center">
        <div className="max-w-sm">
          <p className="text-foreground text-base font-extrabold">{t.openFailed}</p>
          <button
            onClick={load}
            className="bg-brand-gradient text-primary-foreground mt-4 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
          >
            <RefreshCw className="h-4 w-4" /> {t.frameRetry}
          </button>
        </div>
      </div>
    );
  }

  if (result.embeddable) {
    return (
      <iframe
        data-testid="explore-frame"
        title={t.frameTitle}
        src={result.redirectUrl}
        className="border-border bg-card h-[calc(100dvh-15rem)] min-h-[640px] w-full rounded-2xl border"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  return (
    <div className="border-primary/30 bg-accent/60 mx-auto max-w-xl rounded-3xl border p-6 text-center" data-testid="explore-newtab">
      <span className="bg-accent text-primary mx-auto grid h-12 w-12 place-items-center rounded-2xl">
        <ExternalLink className="h-5 w-5" />
      </span>
      <h2 className="mt-3 text-lg font-extrabold">{t.newTabTitle}</h2>
      <p className="text-muted-foreground mt-2 text-sm">{t.newTabBody}</p>
      <button
        onClick={alt.open}
        disabled={alt.opening}
        aria-busy={alt.opening}
        data-voice-gate="explore-lenders"
        className="bg-brand-gradient text-primary-foreground mt-5 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold disabled:opacity-70"
      >
        {alt.opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        {t.reopen}
      </button>
      {alt.error && (
        <p className="text-danger mt-2 text-xs font-semibold" role="alert">
          {alt.error}
        </p>
      )}
    </div>
  );
}
