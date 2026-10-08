import type { RefObject } from 'react';
import type { View } from 'react-native';
import { beginAgentActivity, playSound, playTypingTick } from './sounds';

/**
 * What the user SEES and HEARS while the voice agent works the screen.
 *
 * The agent's actions used to land instantly and invisibly — a field simply changed, and a
 * field below the fold changed where nobody could see it. Now, for every action it takes:
 *
 *   1. the page scrolls the control into view (`revealTarget`),
 *   2. the control lights up with a soft ring and a cue sound (`focus`),
 *   3. text is typed in character by character with keyboard ticks (`typeText`),
 *      taps press down and click, toggles and options flip with their own sound,
 *   4. the ring settles with a confirmation chime (`done`).
 *
 * Controls take part by registering their View with `useAgentFx` (./useAgentFx.tsx), which
 * also subscribes them to the animation events below.
 */

/* ── Timing ─────────────────────────────────────────────────────────────── */

const underJest = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.JEST_WORKER_ID;
let instant = underJest;
// Animated.timing runs on a 0 ms requestAnimationFrame shim under Jest, which spins forever when
// the clock is faked — so the visual animations are off in tests unless one opts in.
let animate = !underJest;
/** Tests (and anything that must not wait) turn the pacing off. */
export function configureFx(opts: { instant?: boolean; animate?: boolean }): void {
  if (opts.instant !== undefined) instant = opts.instant;
  if (opts.animate !== undefined) animate = opts.animate;
}
export function fxAnimates(): boolean {
  return animate;
}
export function fxIsInstant(): boolean {
  return instant;
}
export const sleep = (ms: number): Promise<void> =>
  instant || ms <= 0 ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms));

/* ── Events (agent → control) ───────────────────────────────────────────── */

export type FxKind = 'focus' | 'press' | 'done';
export interface FxEvent {
  kind: FxKind;
  /** normalised `label|group` of the control the agent is acting on */
  key: string;
}

const norm = (s?: string): string => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const fxKey = (label?: string, group?: string): string => `${norm(label)}|${norm(group)}`;

const listeners = new Set<(e: FxEvent) => void>();
export function subscribeFx(fn: (e: FxEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitFx(kind: FxKind, label?: string, group?: string): void {
  const e: FxEvent = { kind, key: fxKey(label, group) };
  listeners.forEach(fn => fn(e));
}

/* ── Where each control lives (for scroll-into-view) ───────────────────── */

interface RevealEntry {
  label: string;
  group: string;
  ref: RefObject<View | null>;
}
const revealByScreen = new Map<string, Map<string, RevealEntry>>();

export function registerReveal(
  screen: string,
  label: string | undefined,
  group: string | undefined,
  ref: RefObject<View | null>,
): () => void {
  if (!label) return () => {};
  const key = fxKey(label, group);
  let m = revealByScreen.get(screen);
  if (!m) revealByScreen.set(screen, (m = new Map()));
  const entry: RevealEntry = { label: norm(label), group: norm(group), ref };
  m.set(key, entry);
  return () => {
    // a re-render may already have registered a newer entry under the same key
    if (revealByScreen.get(screen)?.get(key) === entry) revealByScreen.get(screen)?.delete(key);
  };
}

function findEntry(screen: string, label: string, group?: string): RevealEntry | undefined {
  const m = revealByScreen.get(screen);
  if (!m) return undefined;
  const exact = m.get(fxKey(label, group)) ?? m.get(fxKey(label, ''));
  if (exact) return exact;
  // The agent's label for a control (auto-discovered) is usually, but not always, byte-equal
  // to the one the control registered under — fall back to a close match.
  const q = norm(label);
  if (q.length < 3) return undefined;
  const g = norm(group);
  for (const e of m.values()) {
    if (g && e.group && e.group !== g) continue;
    if (e.label.length >= 3 && (e.label.includes(q) || q.includes(e.label))) return e;
  }
  return undefined;
}

/** A screen's scroll container, registered by <Screen>. */
export interface Scroller {
  scrollToY: (y: number) => void;
  getOffset: () => number;
  measureViewport: (cb: (top: number, height: number) => void) => void;
  /** px at the bottom of the viewport that something else (tab bar, FAB) sits over */
  bottomInset: number;
  /** px at the top of the viewport covered by a pinned header */
  topInset: number;
}
const scrollers = new Map<string, Scroller>();
export function registerScroller(screen: string, s: Scroller): () => void {
  scrollers.set(screen, s);
  return () => {
    if (scrollers.get(screen) === s) scrollers.delete(screen);
  };
}

function measureWindow(ref: RefObject<View | null>): Promise<{ y: number; h: number } | null> {
  return new Promise(resolve => {
    const node = ref.current;
    if (!node?.measureInWindow) return resolve(null);
    let done = false;
    const finish = (v: { y: number; h: number } | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    setTimeout(() => finish(null), 400);
    try {
      node.measureInWindow((_x, y, _w, h) => finish(Number.isFinite(y) && h > 0 ? { y, h } : null));
    } catch {
      finish(null);
    }
  });
}

/**
 * Scrolls so the control is comfortably inside the visible part of the page, and waits for the
 * scroll to land. Returns true when the page actually moved. Never throws and never blocks the
 * action it precedes for long — if the control can't be measured the action just proceeds.
 */
export async function revealTarget(screen: string, label: string, group?: string): Promise<boolean> {
  try {
    const entry = findEntry(screen, label, group);
    const scroller = scrollers.get(screen);
    if (!entry || !scroller) return false;

    const el = await measureWindow(entry.ref);
    if (!el) return false;
    const viewport = await new Promise<{ top: number; height: number } | null>(resolve => {
      const t = setTimeout(() => resolve(null), 400);
      try {
        scroller.measureViewport((top, height) => {
          clearTimeout(t);
          resolve({ top, height });
        });
      } catch {
        clearTimeout(t);
        resolve(null);
      }
    });
    if (!viewport) return false;

    const visTop = viewport.top + scroller.topInset + 12;
    const visBottom = viewport.top + viewport.height - scroller.bottomInset - 12;
    if (el.y >= visTop && el.y + el.h <= visBottom) return false; // already comfortably visible

    const delta = el.y + el.h / 2 - (visTop + visBottom) / 2;
    const target = Math.max(0, scroller.getOffset() + delta);
    if (Math.abs(target - scroller.getOffset()) < 4) return false;

    playSound('scroll'); // the same pulse roll the user hears when they scroll
    scroller.scrollToY(target);
    // animated scrollTo has no completion callback; the time scales with distance
    await sleep(Math.min(700, 240 + Math.abs(delta) * 0.45));
    return true;
  } catch {
    return false;
  }
}

/* ── Choreography the agent's tools call ────────────────────────────────── */

export interface FxTarget {
  label: string;
  group?: string;
}

/** Bring the control into view and light it up — the "I'm about to do something here" beat. */
export async function agentApproach(screen: string, t: FxTarget, opts: { reveal?: boolean } = {}): Promise<void> {
  const end = beginAgentActivity(); // keeps the page's own scroll ticks quiet while we scroll
  try {
    if (opts.reveal !== false) await revealTarget(screen, t.label, t.group);
    emitFx('focus', t.label, t.group); // the ring — no sound of its own: the click that follows marks the action
    await sleep(260);
  } finally {
    end();
  }
}

/** Settle the ring after the action. Silent on success (no chime); a refused entry plays the error cue. */
export function agentSettle(t: FxTarget, ok = true): void {
  emitFx('done', t.label, t.group);
  if (!ok) playSound('error');
}

/** A press: the control dips and ripples, clicks, and only then does the tap go through. */
export async function agentPress(t: FxTarget, sound: 'tap' | 'select' | 'toggleOn' | 'toggleOff' | 'nav' = 'tap'): Promise<void> {
  emitFx('press', t.label, t.group);
  playSound(sound);
  await sleep(190);
}

/**
 * Types `text` into a field one character at a time, with a keyboard tick for each.
 * `write` must always act on the CURRENT field (the caller re-resolves it each call —
 * the handler captured at registration goes stale as the field re-renders).
 */
export async function typeText(opts: {
  current: string;
  text: string;
  write: (value: string) => void;
}): Promise<void> {
  const end = beginAgentActivity();
  try {
    const { current, text, write } = opts;
    const chars = Array.from(text);
    // Continue from what is already there when the new value extends it; otherwise start over.
    let from = 0;
    if (current && text.startsWith(current)) from = Array.from(current).length;
    else if (current) {
      write('');
      playTypingTick(true);
      await sleep(70);
    }
    if (instant) {
      write(text);
      return;
    }
    const remaining = chars.length - from;
    // ~0.9 s for a typical value, never slower than 70 ms/char at full speed…
    const perChar = Math.max(18, Math.min(70, Math.round(900 / Math.max(1, remaining))));
    // …but every keystroke re-renders the whole screen, which on a slow phone (or a dev build)
    // can cost 300 ms+. So the pace adapts: the whole fill gets a time budget, and when each step
    // is taking longer than planned, more characters go in per step instead of the fill dragging on.
    const BUDGET_MS = 1500;
    const t0 = Date.now();
    let iterMs = perChar;
    let i = from;
    while (i < chars.length) {
      const left = BUDGET_MS - (Date.now() - t0);
      const stepsLeft = Math.max(1, Math.floor(left / Math.max(iterMs, perChar)));
      const chunk = Math.max(1, Math.ceil((chars.length - i) / stepsLeft));
      const upto = Math.min(chars.length, i + chunk);
      const stepStart = Date.now();
      write(chars.slice(0, upto).join(''));
      playTypingTick(false);
      await sleep(perChar);
      iterMs = Date.now() - stepStart;
      i = upto;
    }
  } finally {
    end();
  }
}

/** Walks a slider to its new value in a few steps, with a detent sound per step. */
export async function slideTo(opts: {
  from: number;
  to: number;
  write: (value: number) => void;
}): Promise<void> {
  const end = beginAgentActivity();
  try {
    const { from, to, write } = opts;
    if (instant || from === to || !Number.isFinite(from)) {
      write(to);
      return;
    }
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      write(from + ((to - from) * i) / steps);
      playSound('slide');
      await sleep(55);
    }
    write(to);
  } finally {
    end();
  }
}
