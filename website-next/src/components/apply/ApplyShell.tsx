'use client';

import Link from 'next/link';
import { ShieldCheck, FileCheck, Clock3, ChevronLeft } from 'lucide-react';
import { AccountRail, type AccountRailUser } from './AccountRail';

const BRAND_POINTS = [
  { icon: ShieldCheck, text: 'Bank-grade 256-bit encryption on every step' },
  { icon: FileCheck, text: '100% digital — no physical paperwork' },
  { icon: Clock3, text: 'Most applicants get offers in under 5 minutes' },
];

/**
 * The persistent split-screen frame for the whole /apply funnel — a left
 * rail and a right content panel the step page fills in. The rail is the
 * marketing brand pitch (identical copy across Steps 1–3, like a real
 * lender's apply flow) UNLESS the caller passes `accountUser` — from Offers
 * onward the visitor is a real logged-in applicant, not someone still being
 * pitched the product, so those pages fetch their own profile and pass it
 * here to swap in the same account sidebar /account/* uses (My Applications,
 * Profile, Support, Log out).
 */
export function ApplyShell({
  children,
  backHref,
  backLabel = 'Back',
  stepLabel,
  progressPct,
  center = false,
  accountUser,
}: {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  stepLabel?: string;
  progressPct?: number;
  center?: boolean;
  accountUser?: AccountRailUser | null;
}) {
  return (
    <div className="bg-background flex min-h-screen w-full">
      {accountUser ? (
        <AccountRail user={accountUser} />
      ) : (
        <aside className="bg-deep-gradient relative hidden w-[360px] shrink-0 flex-col gap-7 overflow-hidden p-10 text-white lg:flex">
          <div className="absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-[var(--mint)]/25 blur-3xl" aria-hidden />
          <Link href="/" className="relative z-10 flex items-center gap-2.5 text-lg font-extrabold">
            <span className="bg-brand-gradient grid h-8 w-8 place-items-center rounded-xl text-sm">S</span>
            SwiftLoan
          </Link>
          <div className="relative z-10">
            <h2 className="text-2xl leading-tight font-extrabold">Smarter borrowing starts here</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              We compare offers from 12+ RBI-registered lending partners to find your best rate — no paperwork, no branch visits.
            </p>
          </div>
          <ul className="relative z-10 flex flex-col gap-3.5">
            {BRAND_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/85">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/10">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <span className="relative z-10 mt-auto inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs text-white/90">
            🔒 Trusted by 50,000+ borrowers across India
          </span>
        </aside>
      )}

      <div className="relative flex min-h-screen flex-1 flex-col">
        {typeof progressPct === 'number' && (
          <div className="bg-border absolute top-0 left-0 h-[3px] w-full">
            <div className="bg-brand-gradient h-full transition-[width] duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        )}
        {(backHref || stepLabel) && (
          <div className="flex items-center justify-between px-6 pt-5 sm:px-10">
            {backHref ? (
              <Link
                href={backHref}
                className="border-border inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-2 text-sm font-semibold text-muted-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            ) : (
              <span />
            )}
            {stepLabel && (
              <span className="bg-accent text-accent-foreground rounded-full px-3 py-1.5 text-xs font-bold">{stepLabel}</span>
            )}
          </div>
        )}
        <div className={`flex-1 px-6 pt-6 pb-10 sm:px-10 ${center ? 'flex flex-col items-center justify-center text-center' : ''}`}>
          <div className={center ? 'w-full max-w-md' : 'mx-auto w-full max-w-2xl'}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: 'Basics' },
    { n: 2, label: 'More details' },
    { n: 3, label: 'PAN & consent' },
  ];
  return (
    <div className="mb-6 flex items-center">
      {items.map((it, i) => {
        const done = it.n < step;
        const active = it.n === step;
        return (
          <div key={it.n} className="relative flex flex-1 flex-col items-center gap-2">
            {i < items.length - 1 && (
              <div className={`absolute top-4 left-1/2 h-0.5 w-full ${done ? 'bg-mint' : 'bg-border'}`} />
            )}
            <div
              className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${
                done
                  ? 'border-mint bg-mint text-white'
                  : active
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border bg-card text-muted-foreground'
              }`}
            >
              {done ? '✓' : it.n}
            </div>
            <span className={`text-xs font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BottomBar({ children, meta }: { children: React.ReactNode; meta?: string }) {
  return (
    <div className="border-border bg-background/95 sticky bottom-0 mt-8 flex items-center justify-between gap-4 border-t px-6 py-4 backdrop-blur sm:px-10">
      {meta ? <span className="text-muted-foreground text-xs font-semibold">{meta}</span> : <span />}
      <div className="flex gap-3">{children}</div>
    </div>
  );
}
