'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Check, CreditCard, LockKeyhole } from 'lucide-react';

const STEPS = ['Verifying your PAN', 'Fetching your details', 'Securing your information'];
const STEP_MS = 900;

/**
 * Full-screen "verifying PAN" loader, shown while POST /api/kyc/pan/verify
 * runs. Same visual language as the finding-offers screen (orbiting dashed
 * ring, pulsing halo, twinkles, brand-gradient tile, progress bar) so the
 * two waits feel like one product. The step list ticks forward on a timer
 * purely as progress feedback — it doesn't claim more than "working on it".
 */
export function PanVerifyingOverlay({ open }: { open: boolean }) {
  const [fill, setFill] = useState('6%');
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setFill('6%');
      setStep(0);
      return;
    }
    const raf = requestAnimationFrame(() => setFill('92%'));
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  // Portal to <body>: a transformed/filtered ancestor would otherwise trap
  // `position: fixed` inside the page layout instead of the viewport.
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-label="Verifying your PAN"
      className="animate-in fade-in bg-background/95 fixed inset-0 z-[10000] flex items-center justify-center p-6 backdrop-blur-sm duration-300"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="relative flex h-[200px] w-[200px] items-center justify-center">
          <svg viewBox="0 0 260 260" className="animate-spin-slow absolute inset-0 h-full w-full" aria-hidden>
            <circle cx="130" cy="130" r="116" fill="none" stroke="var(--mint)" strokeOpacity="0.4" strokeWidth="2" strokeDasharray="1 10" strokeLinecap="round" />
            <circle cx="130" cy="14" r="5" fill="var(--mint)" />
          </svg>
          <span className="animate-soft-ping bg-mint/15 absolute h-36 w-36 rounded-full" aria-hidden />
          <div className="bg-brand-gradient relative grid h-24 w-24 place-items-center rounded-3xl text-white shadow-[var(--shadow-float)]">
            <CreditCard className="h-10 w-10" />
          </div>
          <span className="animate-twinkle text-mint absolute top-3 right-5 text-lg" aria-hidden>✨</span>
          <span className="animate-twinkle text-primary absolute bottom-9 left-2 text-sm [animation-delay:500ms]" aria-hidden>✦</span>
        </div>

        <div>
          <h2 className="text-2xl font-extrabold">Verifying your PAN…</h2>
          <p className="text-muted-foreground mt-2 text-sm">This usually takes a few seconds</p>
        </div>

        <div className="bg-border h-2 w-[86%] overflow-hidden rounded-full">
          <div className="bg-brand-gradient h-full rounded-full transition-[width] duration-[6000ms] ease-out" style={{ width: fill }} />
        </div>

        <ul className="flex w-full flex-col gap-2.5 text-left">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} className={`flex items-center gap-3 transition-opacity duration-300 ${i > step ? 'opacity-40' : 'opacity-100'}`}>
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                    done ? 'bg-mint text-white' : active ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : active ? <span className="bg-primary h-2 w-2 animate-pulse rounded-full" /> : <span className="h-2 w-2 rounded-full bg-current opacity-50" />}
                </span>
                <span className={`text-sm ${active ? 'font-bold' : 'font-semibold'}`}>{label}</span>
              </li>
            );
          })}
        </ul>

        <div className="bg-accent flex w-full items-center gap-3.5 rounded-2xl p-4 text-left">
          <span className="bg-mint/20 grid h-10 w-10 shrink-0 place-items-center rounded-full">
            <LockKeyhole className="text-primary h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold">Your data is safe with us</div>
            <div className="text-muted-foreground text-xs">Encrypted end to end · never shared without your consent</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
