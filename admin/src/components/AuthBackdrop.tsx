import React from 'react';

/**
 * Full-screen shell for the signed-out pages (login, forgot password).
 *
 * The motion is borrowed from the mobile app's launch splash, not copied:
 * soft orbs drifting up and down, speed lines that rush in from the left, and a
 * halo that pulses outward behind the card. Here it simply loops in the background.
 * Styles live in globals.css (`.ab-*`) and are switched off for reduced motion.
 */
const LINES = [
  { top: '22%', w: 180, color: 'rgba(98,205,189,.55)', delay: '0s', dur: '7s' },
  { top: '34%', w: 240, color: 'rgba(152,220,210,.45)', delay: '2.2s', dur: '8.5s' },
  { top: '66%', w: 200, color: 'rgba(214,241,236,.40)', delay: '4.1s', dur: '7.5s' },
  { top: '78%', w: 150, color: 'rgba(98,205,189,.45)', delay: '1.1s', dur: '9s' },
];

const ORBS = [
  { size: 320, left: '-6%', top: '8%', color: 'rgba(47,177,131,.22)', dur: '9s', delay: '0s' },
  { size: 220, left: '82%', top: '4%', color: 'rgba(12,182,166,.22)', dur: '11s', delay: '-3s' },
  { size: 180, left: '76%', top: '70%', color: 'rgba(191,243,230,.14)', dur: '10s', delay: '-6s' },
  { size: 130, left: '8%', top: '74%', color: 'rgba(255,255,255,.09)', dur: '12s', delay: '-2s' },
];

export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="ab-root">
      <div className="ab-layer" aria-hidden>
        {ORBS.map((o, i) => (
          <span
            key={i}
            className="ab-orb"
            style={{ width: o.size, height: o.size, left: o.left, top: o.top, background: o.color, animationDuration: o.dur, animationDelay: o.delay }}
          />
        ))}
        <span className="ab-halo" />
        {LINES.map((l, i) => (
          <span
            key={i}
            className="ab-line"
            style={{ top: l.top, width: l.w, background: `linear-gradient(90deg, transparent, ${l.color})`, animationDelay: l.delay, animationDuration: l.dur }}
          />
        ))}
      </div>
      <div className="ab-content">{children}</div>
    </div>
  );
}
