import React from 'react';

/**
 * Full-screen shell for the signed-out pages (login, forgot password, reset).
 *
 * Two halves: a brand panel on the left that shows what the dashboard is for
 * (the journey a customer goes through, the activity feed, the outreach), and
 * the form on the right. On a narrow window the brand panel is dropped and the
 * form takes the whole screen.
 *
 * The motion is borrowed from the mobile app's launch splash, not copied: soft
 * orbs drifting up and down and speed lines that rush in from the left. The
 * preview cards are an illustration only: they carry no numbers and no data.
 * Styles live in globals.css (`.ab-*`) and are switched off for reduced motion.
 */
const LINES = [
  { top: '14%', w: 180, color: 'rgba(98,205,189,.55)', delay: '0s', dur: '7s' },
  { top: '38%', w: 240, color: 'rgba(152,220,210,.40)', delay: '2.2s', dur: '8.5s' },
  { top: '71%', w: 200, color: 'rgba(214,241,236,.36)', delay: '4.1s', dur: '7.5s' },
  { top: '90%', w: 150, color: 'rgba(98,205,189,.45)', delay: '1.1s', dur: '9s' },
];

const ORBS = [
  { size: 340, left: '-12%', top: '-6%', color: 'rgba(47,177,131,.28)', dur: '9s', delay: '0s' },
  { size: 240, left: '70%', top: '2%', color: 'rgba(12,182,166,.26)', dur: '11s', delay: '-3s' },
  { size: 260, left: '62%', top: '68%', color: 'rgba(191,243,230,.14)', dur: '10s', delay: '-6s' },
  { size: 150, left: '4%', top: '78%', color: 'rgba(255,255,255,.09)', dur: '12s', delay: '-2s' },
];

/** The steps a customer goes through, in the order the dashboard tracks them. */
const JOURNEY = ['Mobile verified', 'PAN verified', 'Details', 'Offers', 'Applied'];

/** Kinds of activity the dashboard shows as they happen (labels only). */
const FEED = [
  { tone: '#7CF0C8', text: 'PAN verified' },
  { tone: '#8EC5FF', text: 'Offers ready' },
  { tone: '#FFD27A', text: 'Follow-up sent' },
  { tone: '#7CF0C8', text: 'Applied with a lender' },
];

const BARS = [38, 56, 44, 72, 60, 88, 68];

const POINTS = [
  { title: 'One view of every customer', text: 'App and website journeys, side by side.' },
  { title: 'Outreach you control', text: 'WhatsApp, SMS and calls, stage by stage.' },
  { title: 'Every change on record', text: 'Role-based access with an audit log.' },
];

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Decorative preview of the dashboard. Hidden from screen readers. */
function Showcase() {
  return (
    <div className="ab-show" aria-hidden>
      <span className="ab-halo" />

      <div className="ab-glass ab-journey">
        <div className="ab-glass-head">
          <span>Customer journey</span>
          <span className="ab-live"><i />Live</span>
        </div>
        <div className="ab-track">
          <span className="ab-track-fill" />
          {JOURNEY.map((label, i) => (
            <div key={label} className="ab-step" style={{ ['--i' as string]: i } as React.CSSProperties}>
              <span className="ab-node"><Check /></span>
              <span className="ab-step-label">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ab-duo">
        <div className="ab-glass ab-chart">
          <div className="ab-glass-head"><span>Applications</span></div>
          <div className="ab-bars">
            {BARS.map((h, i) => (
              <span key={i} style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        </div>
        <div className="ab-glass ab-feed">
          <div className="ab-glass-head"><span>Activity</span></div>
          <div className="ab-feed-window">
            <div className="ab-feed-roll">
              {/* The list is written twice so the loop has no visible jump. */}
              {[...FEED, ...FEED].map((f, i) => (
                <div key={i} className="ab-feed-row">
                  <i style={{ background: f.tone }} />
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="ab-root">
      <aside className="ab-side">
        <div className="ab-layer" aria-hidden>
          <span className="ab-grid" />
          {ORBS.map((o, i) => (
            <span
              key={i}
              className="ab-orb"
              style={{ width: o.size, height: o.size, left: o.left, top: o.top, background: o.color, animationDuration: o.dur, animationDelay: o.delay }}
            />
          ))}
          {LINES.map((l, i) => (
            <span
              key={i}
              className="ab-line"
              style={{ top: l.top, width: l.w, background: `linear-gradient(90deg, transparent, ${l.color})`, animationDelay: l.delay, animationDuration: l.dur }}
            />
          ))}
        </div>

        <div className="ab-side-inner">
          <div className="ab-pitch">
            <span className="ab-eyebrow">SwiftLoan operations</span>
            <h1 className="ab-title">Every loan journey,<br />in one place.</h1>
            <p className="ab-lead">
              Follow each customer from the first tap to the lender, see where people stop, and decide what reaches them next.
            </p>
          </div>

          <Showcase />

          <ul className="ab-points">
            {POINTS.map((p) => (
              <li key={p.title}>
                <span className="ab-tick"><Check /></span>
                <div><b>{p.title}</b><span>{p.text}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="ab-main">
        <div className="ab-content">{children}</div>
        <p className="ab-foot">Authorised SwiftLoan staff only.</p>
      </main>
    </div>
  );
}
