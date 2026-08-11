'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Ruby — the face of the SwiftLoan voice assistant.
 *
 * A hand-drawn SVG character rather than a photo or a video avatar, chosen
 * deliberately:
 *
 *  - A photorealistic face that does not *quite* move right is worse than an
 *    illustration that does: the uncanny valley is unforgiving, and a lending
 *    site needs to feel trustworthy above all.
 *  - It is ~4KB of markup with no third-party avatar service, no per-session
 *    cost, and nothing leaving the page. A hosted talking-head would send every
 *    visitor's conversation audio to another vendor.
 *  - It scales crisply from the 64px launcher to the expanded panel.
 *
 * The mouth is driven by the REAL output level of the agent's voice (see
 * ElloAgent.getOutputLevel), so it opens and closes with actual speech and
 * falls silent in the gaps — not a loop that flaps while the agent is thinking.
 */

export type RubyState = 'idle' | 'listening' | 'speaking' | 'thinking';

/** Minimal surface RubyLive needs — avoids importing ElloAgent's whole type. */
interface SpeakingSource {
  getOutputLevel: () => number;
  on: (event: string, fn: (payload: never) => void) => void;
}

/**
 * Photo mode.
 *
 * Two portraits — mouth closed and mouth open — swapped from the live audio
 * level. That is genuine two-frame lip sync: the same technique hand-drawn
 * animation uses for dialogue, and at launcher size it reads convincingly
 * because the eyes, hair and lighting stay identical between frames.
 *
 * Both images must be the SAME crop and framing, or the swap looks like a jump
 * cut rather than a mouth moving. Drop them in website-next/public/.
 *
 * If either file is missing the component falls back to the drawn SVG rather
 * than showing a broken image — a launcher button is not a place to fail.
 */
const RUBY_IDLE_SRC = '/ruby-idle.png';
const RUBY_TALK_SRC = '/ruby-talking.png';

/** Above this output level the mouth-open frame is shown. */
const TALK_THRESHOLD = 0.18;

export function RubyPhoto({ state, level = 0, size = 64, className }: RubyProps) {
  const [ok, setOk] = useState<boolean | null>(null);

  // Probe once: both frames must load, and we want the open-mouth frame warm
  // in cache before she first speaks, or the first word shows a blank.
  useEffect(() => {
    let alive = true;
    let loaded = 0;
    let failed = false;
    [RUBY_IDLE_SRC, RUBY_TALK_SRC].forEach((src) => {
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        loaded += 1;
        if (loaded === 2 && !failed) setOk(true);
      };
      img.onerror = () => {
        if (!alive) return;
        failed = true;
        setOk(false);
      };
      img.src = src;
    });
    return () => {
      alive = false;
    };
  }, []);

  if (ok === false) return <Ruby state={state} level={level} size={size} className={className} />;

  const talking = state === 'speaking' && level > TALK_THRESHOLD;

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'block',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: 'linear-gradient(135deg,#0CB6A6,#2FB183)',
      }}
    >
      {/* Both frames are stacked and cross-faded on opacity. Toggling `src`
          instead would re-decode the image on every syllable and flicker. */}
      <img
        src={RUBY_IDLE_SRC}
        alt="Ruby, the SwiftLoan assistant"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: talking ? 0 : 1, transition: 'opacity 60ms linear' }}
      />
      <img
        src={RUBY_TALK_SRC}
        alt=""
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: talking ? 1 : 0, transition: 'opacity 60ms linear' }}
      />
      {state === 'listening' && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxShadow: '0 0 0 2px rgba(255,255,255,.85) inset',
            animation: 'rubyPulse 1.8s ease-in-out infinite',
          }}
        />
      )}
      <style>{`@keyframes rubyPulse{0%,100%{opacity:.85}50%{opacity:.25}}`}</style>
    </span>
  );
}

/**
 * Ruby, wired to a live agent.
 *
 * Owns its own requestAnimationFrame loop so the mouth samples the audio at
 * frame rate without the parent re-rendering. The loop only runs while she is
 * speaking — an always-on rAF on a marketing page is a needless battery drain.
 */
export function RubyLive({ agent, size, className }: { agent: SpeakingSource; size?: number; className?: string }) {
  const [state, setState] = useState<RubyState>('idle');
  const [level, setLevel] = useState(0);

  useEffect(() => {
    agent.on('statusChange', ((s: string) => {
      setState(
        s === 'speaking' ? 'speaking'
          : s === 'listening' ? 'listening'
          : s === 'connecting' || s === 'executingTool' ? 'thinking'
          : 'idle',
      );
    }) as (payload: never) => void);
  }, [agent]);

  useEffect(() => {
    if (state !== 'speaking') {
      setLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setLevel(agent.getOutputLevel());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, agent]);

  // Photo first, drawn SVG as the automatic fallback.
  return <RubyPhoto state={state} level={level} size={size} className={className} />;
}

interface RubyProps {
  state: RubyState;
  /** 0..1 loudness of the agent's own voice; only meaningful when speaking. */
  level?: number;
  size?: number;
  className?: string;
}

export function Ruby({ state, level = 0, size = 64, className }: RubyProps) {
  const [blink, setBlink] = useState(false);

  // Idle blinking, at irregular intervals. A fixed cadence reads as a machine;
  // humans blink roughly every 2–6 seconds, sometimes twice in quick succession.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 130);
        schedule();
      }, 2200 + Math.random() * 3800);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  const speaking = state === 'speaking';
  // Mouth geometry. Height grows with loudness; width narrows slightly as it
  // opens, which is what stops it reading as a flapping letterbox.
  const open = speaking ? Math.max(0.08, level) : 0;
  const mouthRy = 1.6 + open * 5.2;
  const mouthRx = 7.2 - open * 1.4;

  const eyeRy = blink ? 0.6 : 2.4;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Ruby, the SwiftLoan assistant"
    >
      <defs>
        <linearGradient id="ruby-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0CB6A6" />
          <stop offset="1" stopColor="#2FB183" />
        </linearGradient>
        <linearGradient id="ruby-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A1B18" />
          <stop offset="1" stopColor="#4A2F27" />
        </linearGradient>
        <clipPath id="ruby-clip">
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>

      <g clipPath="url(#ruby-clip)">
        <circle cx="32" cy="32" r="32" fill="url(#ruby-bg)" />

        {/* shoulders / blazer — professional, reads instantly at small size */}
        <path d="M8 64c0-11 10.5-17 24-17s24 6 24 17z" fill="#123E45" />
        <path d="M26 48l6 8 6-8-6-3z" fill="#F4FBFA" />

        {/* hair behind */}
        <path d="M14 32c0-12 8-19 18-19s18 7 18 19c0 6-1 10-2 13 1-14-6-19-16-19s-17 5-16 19c-1-3-2-7-2-13z" fill="url(#ruby-hair)" />

        {/* face */}
        <ellipse cx="32" cy="32" rx="13" ry="14.5" fill="#F0C5A4" />
        {/* soft cheek warmth */}
        <ellipse cx="24.5" cy="35" rx="2.6" ry="1.7" fill="#E8A88A" opacity="0.55" />
        <ellipse cx="39.5" cy="35" rx="2.6" ry="1.7" fill="#E8A88A" opacity="0.55" />

        {/* brows — lift a little when listening, which reads as attention */}
        <g fill="none" stroke="#3A2620" strokeWidth="1.5" strokeLinecap="round">
          <path d={`M25 ${state === 'listening' ? 25.2 : 26.2} q3 -1.6 6 -0.2`} />
          <path d={`M33 ${state === 'listening' ? 25 : 26} q3 -1.4 6 0.4`} />
        </g>

        {/* eyes */}
        <g fill="#2A1B18">
          <ellipse cx="27.5" cy="31" rx="1.9" ry={eyeRy} />
          <ellipse cx="36.5" cy="31" rx="1.9" ry={eyeRy} />
        </g>
        {!blink && (
          <g fill="#fff" opacity="0.9">
            <circle cx="28.2" cy="30.2" r="0.6" />
            <circle cx="37.2" cy="30.2" r="0.6" />
          </g>
        )}

        {/* nose */}
        <path d="M32 33.5q1.2 1.8 -0.6 2.4" fill="none" stroke="#D9A184" strokeWidth="1" strokeLinecap="round" />

        {/* mouth — the lip-sync element */}
        <ellipse cx="32" cy="40.5" rx={mouthRx} ry={mouthRy} fill="#8E3B44" />
        {open > 0.35 && <ellipse cx="32" cy={40.5 + mouthRy * 0.42} rx={mouthRx * 0.55} ry={mouthRy * 0.35} fill="#C4636A" opacity="0.85" />}
        {open > 0.2 && <rect x={32 - mouthRx * 0.62} y={40.5 - mouthRy * 0.78} width={mouthRx * 1.24} height="1.5" rx="0.7" fill="#fff" opacity="0.92" />}
        {!speaking && (
          // Closed, gently smiling.
          <path d="M26.5 40.2q5.5 3.4 11 0" fill="none" stroke="#8E3B44" strokeWidth="1.6" strokeLinecap="round" />
        )}

        {/* hair front */}
        <path d="M17 30c1-11 8-17 15-17s14 6 15 17c-2-7-6-10-9-9-4 1-6 3-11 2-4-1-8 1-10 7z" fill="url(#ruby-hair)" />
      </g>

      {/* listening ring — a quiet pulse so it is obvious she is hearing you */}
      {state === 'listening' && (
        <circle cx="32" cy="32" r="30.5" fill="none" stroke="#fff" strokeWidth="2" opacity="0.75">
          <animate attributeName="r" values="29;31.5;29" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.75;0.25;0.75" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
      {state === 'thinking' && (
        <circle cx="32" cy="32" r="30.5" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="6 10" opacity="0.8">
          <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
