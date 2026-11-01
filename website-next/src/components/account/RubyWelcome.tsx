'use client';

import { useEffect, useRef, useState } from 'react';

// Web port of the mobile app's RubyWelcome (src/components/RubyWelcome.tsx).
// A short welcome clip of Ruby plays full-screen over the account page as a
// layover: it rises in, plays once (with its own voice-over audio), then recedes
// and dissolves back to the page. A Skip control and a safety timeout prevent any
// dead-end.
//
// This is the full composed clip (H.264 + AAC) — it carries its own audio, so no
// separate audio track is needed. Autoplay with sound can be blocked by the
// browser until the visitor interacts, so we start muted (always allowed) and
// unmute on the first pointer interaction.
const VIDEO = '/ruby-welcome.mp4';

// Hard ceiling so a blocked autoplay / load failure can never trap the visitor
// behind the overlay. The clip is ~10s.
const MAX_MS = 12500;
const SINK_MS = 760; // keep in sync with the sl-rw-sink keyframe

export function RubyWelcome({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const finish = useRef(() => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    window.setTimeout(onDone, SINK_MS);
  }).current;

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      // Try to play with sound; if the browser blocks autoplay-with-audio, fall
      // back to a muted autoplay (always allowed) and unmute on first interaction.
      const tryUnmuted = v.play();
      if (tryUnmuted && typeof tryUnmuted.catch === 'function') {
        tryUnmuted.catch(() => {
          v.muted = true;
          v.play().catch(() => {});
          const unmute = () => {
            v.muted = false;
            v.play().catch(() => {});
            window.removeEventListener('pointerdown', unmute);
          };
          window.addEventListener('pointerdown', unmute);
        });
      }
    }
    const t = window.setTimeout(finish, MAX_MS);
    return () => window.clearTimeout(t);
  }, [finish]);

  return (
    <div className={`sl-rw${leaving ? ' sl-rw-leave' : ''}`} role="dialog" aria-label="Welcome from Ruby">
      {/* The clip ending dismisses the intro; a load 'error' is ignored so a slow
          asset can't drop the layover early — the safety timeout still exits. */}
      <video
        ref={videoRef}
        className="sl-rw-video"
        autoPlay
        playsInline
        preload="auto"
        aria-hidden="true"
        onEnded={finish}
        src={VIDEO}
      />
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
        .sl-rw-video {
          /* Fill the whole viewport with the composed scene (it is a 16:9 clip, so
             cover crops the sides a little on tall phones, keeping Ruby centred). */
          position: fixed; inset: 0; width: 100%; height: 100%;
          object-fit: cover; object-position: center top;
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
