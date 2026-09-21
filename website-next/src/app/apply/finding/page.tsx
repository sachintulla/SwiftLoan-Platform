'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { useApply } from '@/lib/applyContext';
import { prequalify } from '@/lib/applyApi';

const MIN_DISPLAY_MS = 2600;

/**
 * Same composition as the app's finding.tsx: an orbiting dashed ring + pulsing
 * halo + twinkling sparkles around a centre mark, a progress bar animating
 * 6% -> 100% over the same ~2.6s minimum the real prequalify() wait uses, a
 * "checking your eligibility" step row, and the soft-enquiry safe-data card.
 */
export default function FindingPage() {
  const router = useRouter();
  const { applicationId, sessionReady } = useApply();
  const [error, setError] = useState<string | null>(null);
  const [fillWidth, setFillWidth] = useState('6%');
  const startedRef = useRef(false);

  useEffect(() => {
    // Wait for ApplyProvider to sync applicationId in from sessionStorage —
    // otherwise this runs once on mount with the SSR-safe default (null) and
    // both redirects away AND fires prequalify(null) before the real id loads.
    if (!sessionReady) return;
    if (!applicationId) {
      router.replace('/apply/step-1');
      return;
    }
    // Guards the real prequalify() call against firing twice for one visit —
    // React Strict Mode (dev only) deliberately double-invokes this effect to
    // surface non-idempotent effects, and this one used to fire a second,
    // real, concurrent request to Aurix each time: confirmed as the cause of
    // one application ending up with 10 duplicate offers instead of 5 (two
    // genuine Aurix responses, 4ms apart). The backend now also makes its
    // delete-then-recreate atomic against exactly this race, but skipping the
    // redundant call here avoids wasting a real request to Aurix at all.
    if (startedRef.current) return;
    startedRef.current = true;
    // Start at 6% on mount, then kick to 100% next frame so the CSS
    // transition actually animates instead of snapping straight to full.
    const raf = requestAnimationFrame(() => setFillWidth('100%'));
    const start = Date.now();
    let cancelled = false;
    prequalify(applicationId)
      .catch((e) => {
        // Mirrors finding.tsx: failure/empty results are rendered by the
        // offers screen itself (Empty state), never a separate error screen.
        setError(e instanceof Error ? e.message : null);
      })
      .finally(() => {
        const elapsed = Date.now() - start;
        setTimeout(() => {
          // replace, not push: this loading screen is a transient gate (like
          // OTP verify), not a real page — with push, the browser's Back
          // button from Offers landed here, re-fired a real prequalify()
          // call on remount, and auto-forwarded straight back to Offers, a
          // dead loop instead of a real "back".
          if (!cancelled) router.replace('/apply/offers');
        }, Math.max(0, MIN_DISPLAY_MS - elapsed));
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [sessionReady, applicationId, router]);

  return (
    <ApplyShell stepLabel="Finding your offers…" center>
      <div className="flex flex-col items-center gap-6">
        <div className="relative flex h-[220px] w-[220px] items-center justify-center">
          <svg viewBox="0 0 260 260" className="animate-spin-slow absolute inset-0 h-full w-full">
            <circle cx="130" cy="130" r="116" fill="none" stroke="var(--mint)" strokeOpacity="0.4" strokeWidth="2" strokeDasharray="1 10" strokeLinecap="round" />
            <circle cx="130" cy="14" r="5" fill="var(--mint)" />
          </svg>
          <span className="animate-soft-ping bg-mint/15 absolute h-40 w-40 rounded-full" aria-hidden />
          <div className="bg-brand-gradient relative grid h-24 w-24 place-items-center rounded-3xl text-3xl font-extrabold text-white shadow-[var(--shadow-float)]">
            S
          </div>
          <span className="animate-twinkle text-mint absolute top-3 right-6 text-lg" aria-hidden>
            ✨
          </span>
          <span className="animate-twinkle text-primary absolute bottom-10 left-2 text-sm" style={{ animationDelay: '500ms' }} aria-hidden>
            ✦
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold">Finding your personalised offers…</h1>
          <p className="text-muted-foreground mt-2 text-sm">Connecting to bureaus securely</p>
        </div>

        <div className="bg-border h-2 w-[86%] max-w-xs overflow-hidden rounded-full">
          <div className="bg-brand-gradient h-full rounded-full transition-[width] duration-[2400ms] ease-out" style={{ width: fillWidth }} />
        </div>

        <div className="flex items-center gap-2.5">
          <span className="bg-mint grid h-7 w-7 place-items-center rounded-full text-white">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold">Checking your eligibility</span>
        </div>

        {error && <p className="text-danger text-xs font-semibold">{error}</p>}

        <div className="bg-accent mt-4 flex w-full items-center gap-3.5 rounded-2xl p-4 text-left">
          <span className="bg-mint/20 grid h-10 w-10 shrink-0 place-items-center rounded-full">
            <LockKeyhole className="text-primary h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold">Your data is safe with us</div>
            <div className="text-muted-foreground text-xs">We run a soft enquiry only · does not affect your credit score</div>
          </div>
        </div>
      </div>
    </ApplyShell>
  );
}
