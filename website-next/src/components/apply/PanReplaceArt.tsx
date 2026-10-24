'use client';

import { ArrowRightLeft, CreditCard, ShieldCheck } from 'lucide-react';

/**
 * Animated illustration for the "replace PAN on file?" confirm.
 *
 * It shows the PAN already stored in SwiftLoan (masked) cross-fading/sliding to a
 * fresh "New PAN" card — a ping-pong swap (CSS `alternate`, so the loop is seamless)
 * over a small SwiftLoan badge, to make clear the PAN on record is about to change.
 * Honours prefers-reduced-motion (static side-by-side, no motion).
 */
export function PanReplaceArt({ masked }: { masked: string }) {
  return (
    <div className="relative mx-auto mb-1 w-full max-w-[260px] select-none" aria-hidden>
      <style>{SLPAN_CSS}</style>
      <div className="relative mx-auto flex h-[88px] items-center justify-center">
        {/* Old PAN on file */}
        <div className="slpan-card slpan-old border-border bg-muted/70">
          <div className="slpan-chip bg-border/80" />
          <div className="text-muted-foreground text-[9px] font-bold tracking-wide uppercase">PAN on file</div>
          <div className="text-foreground font-mono text-[13px] font-bold tracking-[0.12em]">{masked || 'XXXXXX000X'}</div>
        </div>

        {/* Swap indicator */}
        <span className="slpan-swap bg-brand-gradient text-primary-foreground shadow-[var(--shadow-soft)]">
          <ArrowRightLeft className="h-4 w-4" />
        </span>

        {/* New PAN being entered */}
        <div className="slpan-card slpan-new border-primary/40 bg-brand-gradient text-primary-foreground">
          <div className="slpan-chip bg-white/40" />
          <div className="text-[9px] font-bold tracking-wide uppercase opacity-90">New PAN</div>
          <div className="flex items-center gap-1 font-mono text-[13px] font-bold tracking-[0.12em]">
            <CreditCard className="h-3.5 w-3.5" /> ••••••
          </div>
        </div>
      </div>

      {/* Destination: the SwiftLoan system */}
      <div className="mt-1 flex items-center justify-center">
        <span className="border-border bg-card text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold">
          <ShieldCheck className="text-mint h-3.5 w-3.5" /> SwiftLoan
        </span>
      </div>
    </div>
  );
}

const SLPAN_CSS = `
.slpan-card{position:absolute;top:0;display:flex;flex-direction:column;justify-content:center;gap:4px;width:124px;height:72px;border-width:1px;border-style:solid;border-radius:12px;padding:10px 12px;will-change:transform,opacity}
.slpan-chip{position:absolute;top:10px;right:12px;width:18px;height:13px;border-radius:3px}
.slpan-old{left:0;transform-origin:center;animation:slpan-old 1.7s ease-in-out infinite alternate}
.slpan-new{right:0;transform-origin:center;animation:slpan-new 1.7s ease-in-out infinite alternate}
.slpan-swap{position:relative;z-index:2;display:grid;place-items:center;width:32px;height:32px;border-radius:9999px;animation:slpan-pulse 1.7s ease-in-out infinite}
@keyframes slpan-old{from{opacity:1;transform:translateX(16px) rotate(0) scale(1)}to{opacity:.25;transform:translateX(-6px) rotate(-7deg) scale(.93)}}
@keyframes slpan-new{from{opacity:.25;transform:translateX(6px) rotate(7deg) scale(.93)}to{opacity:1;transform:translateX(-16px) rotate(0) scale(1)}}
@keyframes slpan-pulse{0%,100%{transform:scale(.92)}50%{transform:scale(1.08)}}
@media (prefers-reduced-motion: reduce){.slpan-old,.slpan-new,.slpan-swap{animation:none}.slpan-old{opacity:.6;transform:translateX(16px)}.slpan-new{opacity:1;transform:translateX(-16px)}}
`;
