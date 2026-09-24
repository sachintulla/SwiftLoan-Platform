'use client';

import { useEffect, useState } from 'react';
import { LockKeyhole, ScanLine, ShieldCheck, UserCheck } from 'lucide-react';

const STEPS = [
  { icon: ScanLine, label: 'Reading your PAN', hint: 'Checking the number format' },
  { icon: ShieldCheck, label: 'Verifying your identity', hint: 'Matching against PAN records' },
  { icon: UserCheck, label: 'Fetching your details', hint: 'Preparing your application' },
];
const STEP_MS = 1100; // pace while waiting on the API
const FINISH_MS = 280; // pace of the fast-forward once it has answered
const SLOW_MS = 8000; // after this, reassure that it's still working

/**
 * "Verifying your PAN" state for Step 1 — rendered in place of the form,
 * inside ApplyShell's content panel (the brand rail stays put), so it reads
 * as its own page within the funnel rather than an overlay on the site.
 *
 * Hero: a PAN card with a scanning beam inside pulsing viewfinder brackets
 * and a spinning "verifying" badge. Below, three steps: the active one gets
 * a spinning ring, completed ones pop into a green tick that draws itself,
 * and the connector fills as they complete. Steps advance on a timer as
 * progress feedback; the last stays active until the response arrives.
 *
 * Timing follows the real API call: while waiting, steps advance every
 * STEP_MS and the last one spins as long as it takes. When the caller flips
 * `done`, any remaining steps tick off quickly, all three show complete, and
 * `onFinished` fires — so a 2s, 4s or 16s response all end on a full set of
 * ticks. (On failure the caller just unmounts this; it never fakes success.)
 */
export function PanVerifyingLoader({ done = false, onFinished }: { done?: boolean; onFinished?: () => void }) {
  // step === STEPS.length means every step is complete.
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => { clearInterval(t); clearTimeout(slowTimer); };
  }, [done]);

  useEffect(() => {
    if (!done) return;
    if (step < STEPS.length) {
      const t = setTimeout(() => setStep((s) => s + 1), FINISH_MS);
      return () => clearTimeout(t);
    }
    // All ticked — hold a beat so the last tick is seen, then hand off.
    const t = setTimeout(() => onFinished?.(), 450);
    return () => clearTimeout(t);
  }, [done, step, onFinished]);

  const allDone = step >= STEPS.length;

  return (
    <div role="status" aria-live="polite" aria-label="Verifying your PAN" className="animate-rise-in flex flex-col items-center gap-8 py-4">
      <PanScanHero done={allDone} />

      <div className="text-center">
        <h1 className="text-2xl font-extrabold">{allDone ? 'PAN verified' : 'Verifying your PAN'}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {allDone ? 'Taking you to your details…' : slow ? 'Still working on it — almost there' : 'Hang tight — this usually takes a few seconds'}
        </p>
      </div>

      <ol className="relative w-full max-w-sm">
        {STEPS.map(({ icon: Icon, label, hint }, i) => {
          const done = i < step;
          const active = i === step;
          const last = i === STEPS.length - 1;
          return (
            <li key={label} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && (
                <span className="bg-border absolute top-11 left-[21px] h-[calc(100%-2.75rem)] w-0.5 overflow-hidden rounded-full" aria-hidden>
                  <span className={`bg-mint block w-full transition-[height] duration-700 ease-out ${done ? 'h-full' : 'h-0'}`} />
                </span>
              )}
              <span className="relative grid h-11 w-11 shrink-0 place-items-center">
                {active && (
                  <svg viewBox="0 0 44 44" className="absolute inset-0 h-11 w-11 animate-spin" aria-hidden>
                    <circle cx="22" cy="22" r="20" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="30 96" />
                  </svg>
                )}
                {done ? (
                  <span key="done" className="bg-mint animate-pop-check grid h-9 w-9 place-items-center rounded-full text-white shadow-[var(--shadow-soft)]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" className="animate-check-draw" />
                    </svg>
                  </span>
                ) : (
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-full transition-colors duration-300 ${
                      active ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                )}
              </span>
              <div className={`pt-1.5 transition-opacity duration-300 ${i > step ? 'opacity-45' : 'opacity-100'}`}>
                <p className={`text-sm ${active ? 'text-foreground font-extrabold' : 'text-foreground font-semibold'}`}>{label}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{done ? 'Done' : active ? `${hint}…` : hint}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="bg-accent flex w-full max-w-sm items-center gap-3.5 rounded-2xl p-4 text-left">
        <span className="bg-mint/20 grid h-10 w-10 shrink-0 place-items-center rounded-full">
          <LockKeyhole className="text-primary h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-bold">Your data is safe with us</div>
          <div className="text-muted-foreground text-xs">Encrypted end to end · never shared without your consent</div>
        </div>
      </div>
    </div>
  );
}

/** Stylised PAN card being scanned, inside viewfinder brackets, with a verifying badge. */
function PanScanHero({ done }: { done: boolean }) {
  return (
    <div className="relative grid h-[190px] w-[260px] place-items-center" aria-hidden>
      <span className="animate-soft-ping bg-mint/15 absolute h-40 w-56 rounded-[40px]" />

      {/* viewfinder corners */}
      <div className="animate-bracket-pulse absolute inset-0">
        {['top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl', 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl', 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl', 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl'].map((c) => (
          <span key={c} className={`border-primary absolute h-7 w-7 ${c}`} />
        ))}
      </div>

      {/* the card */}
      <div className="bg-brand-gradient relative h-[124px] w-[200px] overflow-hidden rounded-2xl p-3.5 shadow-[var(--shadow-float)]">
        <div className="flex items-center justify-between">
          <span className="h-1.5 w-20 rounded-full bg-white/60" />
          <span className="h-4 w-4 rounded-full border-2 border-white/60" />
        </div>
        <div className="mt-3 flex gap-3">
          <span className="h-[52px] w-11 shrink-0 rounded-lg bg-white/25" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <span className="h-1.5 w-full rounded-full bg-white/55" />
            <span className="h-1.5 w-4/5 rounded-full bg-white/40" />
            <span className="h-1.5 w-3/5 rounded-full bg-white/40" />
          </div>
        </div>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className="h-2 flex-1 rounded-sm bg-white/45" />
          ))}
        </div>

        {/* scanning beam (stops once verified) */}
        {!done && (
          <>
            <span className="animate-pan-scan absolute right-0 left-0 h-8 -translate-y-full bg-gradient-to-b from-transparent to-white/35" />
            <span className="animate-pan-scan absolute right-2 left-2 h-[2px] rounded-full bg-white shadow-[0_0_12px_3px_rgba(255,255,255,0.85)]" />
          </>
        )}
      </div>

      {/* verifying badge → green tick once verified */}
      {done ? (
        <span className="bg-mint animate-pop-check absolute right-3 bottom-2 grid h-12 w-12 place-items-center rounded-full text-white shadow-[var(--shadow-soft)]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" className="animate-check-draw" />
          </svg>
        </span>
      ) : (
        <span className="bg-card absolute right-3 bottom-2 grid h-12 w-12 place-items-center rounded-full shadow-[var(--shadow-soft)]">
          <svg viewBox="0 0 48 48" className="absolute inset-0 h-12 w-12 animate-spin" aria-hidden>
            <circle cx="24" cy="24" r="21" fill="none" stroke="var(--mint)" strokeWidth="3" strokeLinecap="round" strokeDasharray="34 100" />
          </svg>
          <ShieldCheck className="text-primary h-5 w-5" />
        </span>
      )}
    </div>
  );
}
