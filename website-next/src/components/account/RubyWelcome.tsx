'use client';

import { useEffect, useRef, useState } from 'react';

// Web port of the mobile app's RubyWelcome (src/components/RubyWelcome.tsx).
// A transparent GIF of ONLY Ruby plays with her matching voice-over (a separate
// audio track) as a full-viewport layover over the live account page — a
// see-through talking Ruby, no video-alpha codec needed. She rises in, plays
// once in sync with the audio, then recedes and dissolves back to the page.
// A Skip control and a safety timeout prevent any dead-end.
const GIF = '/ruby-welcome.gif';
const AUDIO = '/ruby-welcome.m4a';

// Hard ceiling so a blocked autoplay / load failure can never trap the visitor
// behind the overlay. The clip is ~10s.
const MAX_MS = 12500;
const SINK_MS = 760; // keep in sync with the sl-rw-sink keyframe

export function RubyWelcome({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const finish = useRef(() => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    window.setTimeout(onDone, SINK_MS);
  }).current;

  useEffect(() => {
    const a = audioRef.current;
    if (a) {
      // Autoplay-with-sound can be refused on first load (browser policy); retry
      // on the first pointer interaction, exactly like the mobile WebView does.
      const p = a.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          const retry = () => {
            a.play().catch(() => {});
            window.removeEventListener('pointerdown', retry);
          };
          window.addEventListener('pointerdown', retry);
        });
      }
    }
    const t = window.setTimeout(finish, MAX_MS);
    return () => window.clearTimeout(t);
  }, [finish]);

  return (
    <div className={`sl-rw${leaving ? ' sl-rw-leave' : ''}`} role="dialog" aria-label="Welcome from Ruby">
      {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF layover, not a next/image candidate */}
      <img className="sl-rw-img" src={GIF} alt="" aria-hidden="true" />
      {/* Only the audio ending dismisses the intro (an 'error' is ignored so a slow
          8 MB GIF can't drop the layover early — the safety timeout still exits). */}
      <audio ref={audioRef} src={AUDIO} preload="auto" onEnded={finish} />
      <button type="button" className="sl-rw-skip" onClick={finish} aria-label="Skip intro">
        Skip
      </button>
      <style>{`
        .sl-rw {
          position: fixed; inset: 0; z-index: 10000;
          background: transparent;
          animation: sl-rw-rise 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .sl-rw-leave { animation: sl-rw-sink ${SINK_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
        .sl-rw-img {
          position: fixed; inset: 0; width: 100%; height: 100%;
          object-fit: contain; object-position: center bottom;
          /* Fade out the GIF's bottom so its baked-in nav/FAB disappears cleanly. */
          -webkit-mask-image: linear-gradient(to bottom, #000 82%, transparent 88%);
          mask-image: linear-gradient(to bottom, #000 82%, transparent 88%);
        }
        .sl-rw-skip {
          position: fixed; top: 16px; right: 18px;
          padding: 7px 16px; border: 0; border-radius: 999px;
          background: rgba(0, 0, 0, 0.42); color: #fff;
          font-size: 13px; font-weight: 700; letter-spacing: 0.2px; cursor: pointer;
        }
        @keyframes sl-rw-rise {
          from { opacity: 0; transform: translateY(8%) scale(1.04); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes sl-rw-sink {
          from { opacity: 1; transform: none; }
          to   { opacity: 0; transform: translateY(-5%) scale(0.9); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sl-rw, .sl-rw-leave { animation-duration: 1ms; }
        }
      `}</style>
    </div>
  );
}

// Session key so the intro plays once per browser session (a fresh login in a new
// session replays it), mirroring the app's once-per-login behaviour without nagging
// on every in-session navigation back to the account page.
const SHOWN_KEY = 'sl_ruby_welcome_shown';

/**
 * Decides whether to show the welcome once per session and renders it. Mount this
 * on the account page. Safe during SSR (reads sessionStorage only after mount).
 */
export function AccountWelcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SHOWN_KEY)) return;
      sessionStorage.setItem(SHOWN_KEY, '1');
      setShow(true);
    } catch {
      // sessionStorage unavailable (private mode / blocked): just skip the intro.
    }
  }, []);

  if (!show) return null;
  return <RubyWelcome onDone={() => setShow(false)} />;
}
