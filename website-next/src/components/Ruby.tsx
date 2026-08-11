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
/**
 * Five real photographs of the same person, ordered by how open her mouth is.
 *
 * This is how hand-drawn animation does dialogue: a small set of mouth shapes
 * (visemes) chosen per frame from the audio, rather than one image distorted.
 * Every frame here is a genuine photo, so nothing is warped and there is no
 * rubbery in-between — the previous attempt failed precisely because you cannot
 * squash an open mouth shut when the teeth are baked into the pixels.
 *
 * Order matters: index 0 is fully closed (her resting/idle face) and index 4 is
 * widest. The rounded "oo" shape sits deliberately low in the ramp — the lips
 * are pursed, so it reads as a quieter sound than the wide-open one.
 */
const RUBY_FRAMES = [
  '/ruby-m0.png', // lips together, smiling — idle / between words
  '/ruby-m1.png', // slightly parted
  '/ruby-m2.png', // mid-open
  '/ruby-m3.png', // wide open
];

/** Below this level she is treated as silent and returns to the closed frame. */
const TALK_THRESHOLD = 0.1;

/**
 * Single-photo lip sync.
 *
 * The source portrait has her mouth OPEN (mid-sentence), and there is no
 * closed-mouth counterpart, so the two-frame swap above cannot be used. Instead
 * the jaw is warped on a canvas:
 *
 *   - the image is split just below the nose
 *   - the lower slice is squashed UPWARDS as loudness falls, which closes the
 *     mouth, and released back to the true photo as loudness rises
 *   - the upper slice is stretched by the same offset so the two always meet —
 *     otherwise a seam opens across her face, which is instantly obvious
 *
 * At full volume nothing is distorted at all: the frame is the original photo.
 * The distortion only ever *closes* her mouth, so the most-seen state (talking)
 * is the untouched image and only the quiet moments are synthetic. Doing it the
 * other way round — stretching the jaw open — warps the frame the viewer looks
 * at most, and looks rubbery.
 */
const RUBY_SRC = '/ruby.png';

/** Where to cut, as a fraction of image height — just under the nose. */
const JAW_SPLIT = 0.6;
/** How far the jaw travels, as a fraction of image height. */
const JAW_TRAVEL = 0.055;

export function RubyCanvas({ state, level = 0, size = 64, className }: RubyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  // Smoothed openness. Raw amplitude is jittery at frame rate and makes the jaw
  // buzz; easing towards the target reads like a real mouth.
  const openRef = useRef(0);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      imgRef.current = img;
      draw(0);
    };
    img.onerror = () => setFailed(true);
    img.src = RUBY_SRC;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(open: number) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = size * dpr;
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }

    const W = img.width;
    const H = img.height;
    const splitSrc = H * JAW_SPLIT;
    // Closed at open=0, true photo at open=1.
    const shift = (1 - open) * JAW_TRAVEL * H;
    const splitDst = splitSrc + shift;

    const sx = px / W;
    const sy = px / H;

    ctx.clearRect(0, 0, px, px);
    // Upper face, stretched down to meet the raised jaw.
    ctx.drawImage(img, 0, 0, W, splitSrc, 0, 0, W * sx, splitDst * sy);
    // Jaw, squashed into what is left.
    ctx.drawImage(img, 0, splitSrc, W, H - splitSrc, 0, splitDst * sy, W * sx, (H - splitDst) * sy);
  }

  useEffect(() => {
    if (failed) return;
    const target = state === 'speaking' ? Math.min(1, level * 1.15) : 0;
    let raf = 0;
    const step = () => {
      const cur = openRef.current;
      // Asymmetric easing: mouths open faster than they close.
      const k = target > cur ? 0.55 : 0.25;
      const next = cur + (target - cur) * k;
      openRef.current = Math.abs(next - target) < 0.004 ? target : next;
      draw(openRef.current);
      if (openRef.current !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, level, size, failed]);

  if (failed) return <Ruby state={state} level={level} size={size} className={className} />;

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
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ width: '100%', height: '100%', display: 'block' }}
        aria-label="Ruby, the SwiftLoan assistant"
        role="img"
      />
      {state === 'listening' && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxShadow: '0 0 0 2px rgba(255,255,255,.9) inset',
            animation: 'rubyPulse 1.8s ease-in-out infinite',
          }}
        />
      )}
      <style>{`@keyframes rubyPulse{0%,100%{opacity:.9}50%{opacity:.25}}`}</style>
    </span>
  );
}

export function RubyPhoto({ state, level = 0, size = 64, className }: RubyProps) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [frame, setFrame] = useState(0);
  const holdRef = useRef(0);

  // Preload every frame before she can speak. A frame fetched mid-sentence
  // would flash blank on its first use, which is far more noticeable than any
  // mismatch between the shapes.
  useEffect(() => {
    let alive = true;
    let loaded = 0;
    RUBY_FRAMES.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        loaded += 1;
        if (loaded === RUBY_FRAMES.length) setOk(true);
      };
      img.onerror = () => alive && setOk(false);
      img.src = src;
    });
    return () => {
      alive = false;
    };
  }, []);

  // Pick a mouth shape from the current loudness.
  useEffect(() => {
    // Minimum hold applies to EVERY frame change, including snapping back to
    // closed — real speech dips below the threshold between syllables dozens
    // of times a second, so without this the mouth was slamming shut and
    // reopening on each dip and read as a blinking flicker rather than talking.
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (now - holdRef.current < 70) return;

    const idx =
      state !== 'speaking' || level < TALK_THRESHOLD
        ? 0
        : Math.min(RUBY_FRAMES.length - 1, 1 + Math.floor(level * (RUBY_FRAMES.length - 1)));

    if (idx === frame) return;
    holdRef.current = now;
    setFrame(idx);
  }, [state, level, frame]);

  if (ok === false) return <Ruby state={state} level={level} size={size} className={className} />;

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
      {/* All frames stacked, switched on opacity. Swapping `src` instead would
          re-decode on every syllable and flicker. */}
      {RUBY_FRAMES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === 0 ? 'Ruby, the SwiftLoan assistant' : ''}
          aria-hidden={i !== 0}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: frame === i ? 1 : 0,
            // The frames are separate photographs, so lighting and the bokeh
            // behind her differ very slightly even after alignment. A short
            // cross-fade blends that away; a hard cut makes it visible as a
            // flash. Long enough to soften, short enough to stay in sync.
            transition: 'opacity 70ms linear',
          }}
        />
      ))}
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

  // Two REAL frames — closed and open — swapped on the live audio level.
  //
  // Not the canvas jaw-warp: that squashed the lower face to fake a closed
  // mouth, which cannot work when the source photo's mouth is open. The teeth
  // and mouth interior are in the pixels; compressing them yields a shorter
  // open mouth, not a closed one. Genuine lip sync needs a genuine closed-mouth
  // frame of the same person, in the same crop and lighting.
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
