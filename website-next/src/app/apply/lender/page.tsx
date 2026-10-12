'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { useCopy } from '@/lib/i18n';
import { applyFlowCopy } from '@/i18n/apply-flow';

const LOAD_TIMEOUT_MS = 6000;

export default function LenderFramePage() {
  const router = useRouter();
  const t = useCopy(applyFlowCopy).lender;
  const { selectedOffer, sessionReady } = useApply();
  const accountUser = useAccountUser();
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Wait for ApplyProvider to sync selectedOffer in from sessionStorage —
    // see applyContext.tsx.
    if (!sessionReady) return;
    if (!selectedOffer?.redirectionUrl) {
      router.replace('/apply/offers');
      return;
    }
    timeoutRef.current = setTimeout(() => setBlocked(true), LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [sessionReady, selectedOffer, router]);

  if (!selectedOffer?.redirectionUrl) return null;

  const lenderName = selectedOffer.lenderName || t.lenderFallback;
  const url = selectedOffer.redirectionUrl;

  const onFrameLoad = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoaded(true);
  };

  return (
    <ApplyShell backHref="/apply/offers" backLabel={t.backLabel} stepLabel={t.stepLabel} accountUser={accountUser} wide>
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">{t.title(lenderName)}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t.subtitle}
          </p>
        </div>

        {/* Fills the screen: viewport minus the shell header, title and the note below. */}
        <div className="border-border relative h-[calc(100dvh-220px)] min-h-[480px] overflow-hidden rounded-2xl border shadow-[var(--shadow-soft)]">
          {!loaded && !blocked && (
            <div className="bg-card absolute inset-0 grid place-items-center gap-3 text-center" aria-busy="true">
              <div className="bg-accent grid h-16 w-16 place-items-center rounded-2xl text-lg font-extrabold">
                {lenderName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold">{t.loadingTitle}</div>
                <div className="text-muted-foreground mt-1 max-w-xs text-xs">
                  {t.loadingBody(lenderName)}
                </div>
              </div>
            </div>
          )}
          {blocked && (
            <div className="bg-card absolute inset-0 grid place-items-center gap-3 p-8 text-center">
              <div>
                <div className="text-sm font-bold">{t.blockedTitle}</div>
                <div className="text-muted-foreground mt-1 text-xs">{t.blockedBody}</div>
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand-gradient text-primary-foreground rounded-full px-5 py-2.5 text-sm font-bold"
              >
                {t.continueWith(lenderName)}
              </a>
            </div>
          )}
          <iframe
            src={url}
            title={t.frameTitle(lenderName)}
            onLoad={onFrameLoad}
            className={`h-full w-full ${loaded ? '' : 'invisible'}`}
            // Without this, the browser's Permissions Policy blocks the
            // lender's page from ever showing its own permission prompt for
            // these — geolocation (address/fraud checks), camera + microphone
            // (video KYC, advertised on the homepage), regardless of what the
            // lender's own page does. This only grants the ABILITY to ask;
            // the user still sees and clicks the browser's real Allow/Block
            // prompt themselves.
            allow="geolocation; camera; microphone"
          />
        </div>

        <div className="bg-muted text-muted-foreground flex items-start gap-2 rounded-xl p-3 text-xs">
          <ShieldCheck className="text-mint mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t.noteA(lenderName)}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">
              {t.noteLink}
            </a>
            {t.noteEnd}
          </span>
        </div>
      </div>
    </ApplyShell>
  );
}
