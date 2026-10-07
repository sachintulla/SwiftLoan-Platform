import { NativeModules } from 'react-native';
import { UI_SOUNDS_ENABLED, UI_SOUNDS_MANUAL_TEST_MODE } from '../config/sounds';
import { SOUND_DATA } from './soundData';
import { vlog } from '../voice/log';
import type { SoundName } from './soundData';

/**
 * UI sound effects — typing ticks, taps, toggles and the voice agent's cues.
 *
 * The clips are synthesised (scripts/gen-sounds.js) and embedded, so there is nothing to
 * link; they are handed to the native `UiSound` module once and played from there. Every
 * call is a no-op when the module is missing (Jest, a stale build) — sound is decoration
 * and must never be able to break a screen.
 */

type NativeUiSound = {
  load: (name: string, base64Wav: string) => void;
  play: (name: string, volume: number) => void;
};

// Looked up on use, not captured at import: the module may be registered after this file loads.
const getNative = (): NativeUiSound | undefined => (NativeModules as { UiSound?: NativeUiSound }).UiSound;

let enabled = UI_SOUNDS_ENABLED;
let manualEnabled = UI_SOUNDS_MANUAL_TEST_MODE;
let loaded = false;

/** Runtime override of the global switch in src/config/sounds.ts (tests, a future Settings toggle). */
export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}
export function soundsEnabled(): boolean {
  return enabled;
}
/** Runtime override of UI_SOUNDS_MANUAL_TEST_MODE: should the user's own interaction make sound? */
export function setManualSoundsEnabled(on: boolean): void {
  manualEnabled = on;
}
export function manualSoundsEnabled(): boolean {
  return manualEnabled;
}

/** Loads every clip into the native player. Safe to call repeatedly. */
export function initSounds(): void {
  const native = getNative();
  if (loaded || !native) return;
  loaded = true;
  try {
    for (const name of Object.keys(SOUND_DATA) as SoundName[]) native.load(name, SOUND_DATA[name]);
  } catch {
    // never let sound set-up break start-up
  }
}

/* ── Per-sound pacing ─────────────────────────────────────────────────────
 * A burst of identical sounds (fast typing, a scroll fling) turns into a buzz, so each
 * kind has a minimum gap. Typing uses the shortest. */
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
/** Test hook: forget when each sound last played, so pacing from an earlier test can't leak in. */
export function resetSoundPacing(): void {
  for (const k of Object.keys(lastPlayedAt)) delete lastPlayedAt[k as SoundName];
}

/** Base level per sound, 0..1 — UI sounds sit well under the agent's own voice. */
const VOLUME: Partial<Record<SoundName, number>> = {
  tick1: 0.5,
  tick2: 0.5,
  tick3: 0.5,
  del: 0.45,
  scroll: 1, // full level, and the clip is mastered hot: a low rumble needs it to sound as loud as a tap
  tap: 0.9,
  select: 0.9,
  toggleOn: 0.9,
  toggleOff: 0.9,
  slide: 0.45,
};

/**
 * Set while a sound has been played for the current press, so the app-wide generic "tap" (see
 * installPressableFx) can stand down when a control already played its own.
 */
let pressHandled = false;
export function beginPress(): void {
  pressHandled = false;
}
export function wasPressHandled(): boolean {
  return pressHandled;
}

/**
 * A sound for the USER'S OWN interaction (taps, chips, toggles, typing, sliders, scrolling).
 * Silent unless the manual test mode is on — the agent's cues and the menu bar use `playSound`.
 */
export function playManualSound(name: SoundName): void {
  pressHandled = true;
  if (!manualEnabled) {
    vlog('sound', name, 'skipped: manual test mode is off');
    return;
  }
  playSound(name);
}

export function playSound(name: SoundName): void {
  pressHandled = true; // a sound inside a press handler means the generic tap click stands down
  const native = getNative();
  if (!enabled || !native) {
    vlog('sound', name, !enabled ? 'skipped: sounds disabled' : 'skipped: native UiSound module missing');
    return;
  }
  const now = Date.now();
  const gap = MIN_GAP_MS[name] ?? 0;
  if (gap && now - (lastPlayedAt[name] ?? 0) < gap) return;
  lastPlayedAt[name] = now;
  try {
    vlog('sound', name, 'play');
    native.play(name, VOLUME[name] ?? 0.6);
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
  playSound(TICKS[i]);
}

/** One keystroke typed by the user (test mode only). */
export function playManualTypingTick(deleting = false): void {
  if (!manualEnabled) return;
  playTypingTick(deleting);
}

/* ── Agent activity flag ──────────────────────────────────────────────────
 * While the voice agent is filling a field / scrolling, it plays its own cues, so the user-side
 * ticks (test mode) must stay quiet then or every character would sound twice. */
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
