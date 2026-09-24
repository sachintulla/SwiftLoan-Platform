'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';

const LOAD_TIMEOUT_MS = 6000;

export default function LenderFramePage() {
  const router = useRouter();
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

  const lenderName = selectedOffer.lenderName || 'the lender';
  const url = selectedOffer.redirectionUrl;

  const onFrameLoad = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoaded(true);
  };

  return (
    <ApplyShell backHref="/apply/offers" backLabel="Cancel & return to offers" stepLabel="Completing your application" accountUser={accountUser} wide>
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">Finish up with {lenderName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            A few final identity and e-sign steps, shown right here — no need to go anywhere else. Your status updates
            automatically once you&apos;re done.
          </p>
        </div>

        {/* Fills the screen: viewport minus the shell header, title and the note below. */}
        <div className="border-border relative h-[calc(100dvh-220px)] min-h-[480px] overflow-hidden rounded-2xl border shadow-[var(--shadow-soft)]">
          {!loaded && !blocked && (
            <div className="bg-card absolute inset-0 grid place-items-center gap-3 text-center">
              <div className="bg-accent grid h-16 w-16 place-items-center rounded-2xl text-lg font-extrabold">
                {lenderName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold">Loading your application form…</div>
                <div className="text-muted-foreground mt-1 max-w-xs text-xs">
                  Securely provided by {lenderName} as part of your SwiftLoan application.
                </div>
              </div>
            </div>
          )}
          {blocked && (
            <div className="bg-card absolute inset-0 grid place-items-center gap-3 p-8 text-center">
              <div>
                <div className="text-sm font-bold">This form can&apos;t be shown here</div>
                <div className="text-muted-foreground mt-1 text-xs">Open it in a new tab to continue — we&apos;ll keep tracking your status either way.</div>
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand-gradient text-primary-foreground rounded-full px-5 py-2.5 text-sm font-bold"
              >
                Continue with {lenderName} ↗
              </a>
            </div>
          )}
          <iframe
            src={url}
            title={`${lenderName} application`}
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
            SwiftLoan can&apos;t see anything you enter above — it&apos;s handled directly and securely by {lenderName}. Trouble
            loading?{' '}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">
              Continue here instead
            </a>
            .
          </span>
        </div>
      </div>
    </ApplyShell>
  );
}
