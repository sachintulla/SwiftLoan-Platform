import { UI_SOUNDS_ENABLED, UI_SOUNDS_MANUAL_TEST_MODE } from '@/config/sounds';
import type { SoundName } from './soundData';

/**
 * UI sound effects — typing ticks, taps, toggles and the voice assistant's cues.
 *
 * Same clips as the mobile app (scripts/gen-sounds.js writes both copies of soundData.ts), played
 * with WebAudio. They are loaded lazily the first time the assistant starts a call (or the first
 * time the visitor interacts with the page in test mode), so a visitor who never uses voice never
 * downloads them. Every call is a no-op when audio is unavailable — sound is decoration and must
 * never be able to break a page.
 */

let enabled = UI_SOUNDS_ENABLED;
let manualEnabled = UI_SOUNDS_MANUAL_TEST_MODE;

/** Runtime override of the global switch in src/config/sounds.ts. */
export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}
export function soundsEnabled(): boolean {
  return enabled;
}
/** Runtime override of UI_SOUNDS_MANUAL_TEST_MODE: should the visitor's own interaction make sound? */
export function setManualSoundsEnabled(on: boolean): void {
  manualEnabled = on;
}
export function manualSoundsEnabled(): boolean {
  return manualEnabled;
}

/* ── Loading ──────────────────────────────────────────────────────────── */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
let loading: Promise<void> | null = null;

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Create/resume the audio context and decode every clip. Call it from a user gesture (the mic
 * tap that starts a call is one) — browsers only let a context start from one. Safe to call
 * repeatedly; later calls just resume a context the browser suspended.
 */
export function initSounds(): Promise<void> {
  if (typeof window === 'undefined' || !enabled) return Promise.resolve();
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return Promise.resolve();
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
  if (!loading) {
    const c = ctx!;
    loading = import('./soundData')
      .then(async ({ SOUND_DATA }) => {
        for (const name of Object.keys(SOUND_DATA) as SoundName[]) {
          try {
            buffers.set(name, await c.decodeAudioData(base64ToArrayBuffer(SOUND_DATA[name])));
          } catch {
            // one bad clip must not take the rest down
          }
        }
      })
      .catch(() => undefined);
  }
  return loading;
}

/* ── Per-sound pacing and level (identical to the app) ─────────────────── */

// A burst of identical sounds (fast typing, a scroll fling) turns into a buzz, so each kind has a
// minimum gap. Typing uses the shortest.
const MIN_GAP_MS: Partial<Record<SoundName, number>> = {
  tick1: 28,
  tick2: 28,
  tick3: 28,
  del: 40,
  slide: 45,
  scroll: 220,
  tap: 40,
};
const lastPlayedAt: Partial<Record<SoundName, number>> = {};
/** Test hook: forget when each sound last played. */
export function resetSoundPacing(): void {
  for (const k of Object.keys(lastPlayedAt)) delete lastPlayedAt[k as SoundName];
}

// Base level per sound, 0..1 — UI sounds sit well under the assistant's own voice.
const VOLUME: Partial<Record<SoundName, number>> = {
  tick1: 0.5,
  tick2: 0.5,
  tick3: 0.5,
  del: 0.45,
  scroll: 1, // full level; the clip is mastered hot so a low rumble sounds as present as a tap
  tap: 0.9,
  select: 0.9,
  toggleOn: 0.9,
  toggleOff: 0.9,
  slide: 0.45,
};

/** Development-only trace of what played, so the sound rules can be checked without ears. */
const soundLog: Array<{ name: SoundName; at: number; played: boolean }> = [];
function trace(name: SoundName, played: boolean) {
  if (process.env.NODE_ENV === 'production') return;
  soundLog.push({ name, at: Date.now(), played });
  if (soundLog.length > 200) soundLog.shift();
}
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as { __swiftloanSounds?: unknown }).__swiftloanSounds = {
    log: soundLog,
    setSoundsEnabled,
    setManualSoundsEnabled,
    state: () => ({ enabled, manualEnabled, ctx: ctx?.state ?? 'none', loaded: buffers.size }),
  };
}

/**
 * A sound for the VISITOR'S OWN interaction (clicks, options, toggles, typing, sliders, scrolling).
 * Silent unless the manual test mode is on — the assistant's cues use `playSound`.
 */
export function playManualSound(name: SoundName): void {
  if (!manualEnabled) return;
  playSound(name);
}

export function playSound(name: SoundName): void {
  if (!enabled) {
    trace(name, false);
    return;
  }
  const now = Date.now();
  const gap = MIN_GAP_MS[name] ?? 0;
  if (gap && now - (lastPlayedAt[name] ?? 0) < gap) return;
  lastPlayedAt[name] = now;
  const buf = buffers.get(name);
  if (!ctx || !master || !buf) {
    // Not loaded yet (the first cue of a session can beat the decode) — start loading, drop this one.
    initSounds();
    trace(name, false);
    return;
  }
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = VOLUME[name] ?? 0.6;
    src.connect(g).connect(master);
    src.start();
    trace(name, true);
  } catch {
    // ignore
  }
}

const TICKS: SoundName[] = ['tick1', 'tick2', 'tick3'];
let lastTick = -1;

/** One keystroke — rotates through three variants, never the same one twice in a row. */
export function playTypingTick(deleting = false): void {
  if (deleting) {
    playSound('del');
    return;
  }
  let i = Math.floor(Math.random() * TICKS.length);
  if (i === lastTick) i = (i + 1) % TICKS.length;
  lastTick = i;
  playSound(TICKS[i]!);
}

/** One keystroke typed by the visitor (test mode only). */
export function playManualTypingTick(deleting = false): void {
  if (!manualEnabled) return;
  playTypingTick(deleting);
}

/* ── Assistant activity flag ──────────────────────────────────────────────
 * While the assistant is filling a field / scrolling it plays its own cues, so the visitor-side
 * cues (test mode) must stay quiet then or every character would sound twice. */
let agentBusy = 0;
export function beginAgentActivity(): () => void {
  agentBusy++;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    agentBusy = Math.max(0, agentBusy - 1);
  };
}
export function isAgentActive(): boolean {
  return agentBusy > 0;
}
