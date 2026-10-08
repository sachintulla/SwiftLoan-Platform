import { writeValue } from '@/lib/voice-dom';
import { beginAgentActivity, playSound, playTypingTick } from './sounds';
import type { SoundName } from './soundData';

/**
 * What the visitor SEES and HEARS while the voice assistant works the page — the website twin of the
 * mobile app's src/feedback/agentFx.ts, with the same beats for every action it takes:
 *
 *   1. the page scrolls the control into view (`revealTarget`),
 *   2. the control lights up with a soft ring (`agentApproach`) — silent: the click that follows
 *      marks the action,
 *   3. text is typed in character by character with keyboard ticks (`typeText`); presses dip, ripple
 *      and click (`agentPress`); sliders walk to the value with a detent per step (`slideTo`),
 *   4. the ring settles (`agentSettle`) — silent on success; a refused entry plays the error cue.
 *
 * Visuals are overlays (a fixed-position ring and ripple that follow the control), so nothing here
 * touches a component's own markup or layout. They are skipped for visitors who ask the OS for
 * reduced motion; the sounds are governed by src/config/sounds.ts, not by this file.
 */

/* ── Timing ─────────────────────────────────────────────────────────────── */

let instant = false;
/** Tests (and anything that must not wait) turn the pacing off. */
export function configureFx(opts: { instant?: boolean }): void {
  if (opts.instant !== undefined) instant = opts.instant;
}
export const sleep = (ms: number): Promise<void> =>
  instant || ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ── Which element carries the ring ─────────────────────────────────────── */

/**
 * The thing the visitor perceives as "the control": a text box's rounded frame rather than the bare
 * <input> inside it, a checkbox's whole row, a slider's whole track.
 */
export function fxTarget(el: HTMLElement): HTMLElement {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el.closest<HTMLElement>('label') ?? el;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.closest<HTMLElement>('.input-interactive') ?? el;
  }
  if (el.getAttribute('role') === 'slider') {
    return el.closest<HTMLElement>('[data-orientation]') ?? el.parentElement ?? el;
  }
  return el;
}

/* ── Reveal ─────────────────────────────────────────────────────────────── */

/** Chrome that floats over the page: a sticky header and the sticky bottom action bar / launcher. */
const TOP_INSET = 84;
const BOTTOM_INSET = 110;

/**
 * Scrolls so the control is comfortably inside the visible part of the page, and waits for the scroll
 * to land. Returns true when the page actually moved. Never throws and never blocks the action it
 * precedes for long. Controls inside fixed layers (a popup, the header) are never scrolled to.
 */
export async function revealTarget(el: HTMLElement): Promise<boolean> {
  try {
    if (el.closest('.fixed, header, nav, [role="dialog"], [role="alertdialog"]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const visTop = TOP_INSET + 12;
    const visBottom = window.innerHeight - BOTTOM_INSET - 12;
    if (r.top >= visTop && r.bottom <= visBottom) return false; // already comfortably visible
    const delta = r.top + r.height / 2 - (visTop + visBottom) / 2;
    if (Math.abs(delta) < 4) return false;
    playSound('scroll'); // the same pulse roll the visitor hears when they scroll in test mode
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    // smooth scrolling has no completion event; the time scales with distance
    await sleep(Math.min(700, 240 + Math.abs(delta) * 0.45));
    return true;
  } catch {
    return false;
  }
}

/* ── The ring and ripple (overlays) ─────────────────────────────────────── */

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
    @keyframes slAgentGlow { from { opacity: .45; } to { opacity: 1; } }
    @keyframes slAgentRipple { 0% { opacity: .55; transform: scale(1); } 100% { opacity: 0; transform: scale(1.14); } }
    .sl-agent-ring, .sl-agent-ripple { position: fixed; pointer-events: none; z-index: 10000; box-sizing: border-box; }
    .sl-agent-ring { border: 2px solid #2FB183; box-shadow: 0 0 8px rgba(47,177,131,.55); animation: slAgentGlow .38s ease-in-out infinite alternate; }
    .sl-agent-ripple { border: 2px solid #079FA0; animation: slAgentRipple .48s ease-out forwards; }
  `;
  document.head.appendChild(st);
}

let ring: HTMLDivElement | null = null;
let ringFor: HTMLElement | null = null;
let ringRaf = 0;
let ringSafety: ReturnType<typeof setTimeout> | null = null;

function placeOverlay(overlay: HTMLElement, target: HTMLElement) {
  const r = target.getBoundingClientRect();
  const inset = 3;
  overlay.style.top = `${r.top - inset}px`;
  overlay.style.left = `${r.left - inset}px`;
  overlay.style.width = `${r.width + inset * 2}px`;
  overlay.style.height = `${r.height + inset * 2}px`;
  const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 8;
  overlay.style.borderRadius = `${radius + inset}px`;
}

function hideRing() {
  if (ringRaf) cancelAnimationFrame(ringRaf);
  ringRaf = 0;
  if (ringSafety) clearTimeout(ringSafety);
  ringSafety = null;
  ring?.remove();
  ring = null;
  ringFor = null;
}

function showRing(target: HTMLElement) {
  if (reducedMotion()) return;
  injectStyle();
  hideRing();
  ring = document.createElement('div');
  ring.className = 'sl-agent-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ring);
  ringFor = target;
  const follow = () => {
    if (!ring || !ringFor) return;
    placeOverlay(ring, ringFor);
    ringRaf = requestAnimationFrame(follow); // follows the control while the page scrolls
  };
  follow();
  // never leave a ring burning if the settle call is lost
  ringSafety = setTimeout(hideRing, 8000);
}

function ripple(target: HTMLElement) {
  if (reducedMotion()) return;
  injectStyle();
  const el = document.createElement('div');
  el.className = 'sl-agent-ripple';
  el.setAttribute('aria-hidden', 'true');
  placeOverlay(el, target);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 520);
  try {
    target.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(.94)', offset: 0.32 }, { transform: 'scale(1)' }],
      { duration: 250, easing: 'ease-out' },
    );
  } catch {
    // Web Animations unavailable — the ripple alone is enough
  }
}

/* ── Choreography the assistant's tools call ────────────────────────────── */

/** Bring the control into view and light it up — the "I'm about to do something here" beat. */
export async function agentApproach(el: HTMLElement): Promise<void> {
  const end = beginAgentActivity(); // keeps the page's own scroll cue quiet while we scroll
  try {
    const target = fxTarget(el);
    await revealTarget(target);
    showRing(target); // no sound of its own: the click that follows marks the action
    await sleep(260);
  } finally {
    end();
  }
}

/** Settle the ring after the action. Silent on success (no chime); a refused entry plays the error cue. */
export function agentSettle(ok = true): void {
  hideRing();
  if (!ok) playSound('error');
}

/** A press: the control dips and ripples, clicks, and only then does the press go through. */
export async function agentPress(
  el: HTMLElement,
  sound: Extract<SoundName, 'tap' | 'select' | 'toggleOn' | 'toggleOff' | 'nav'> = 'tap',
): Promise<void> {
  ripple(fxTarget(el));
  playSound(sound);
  await sleep(190);
}

/**
 * Types `text` into a field one character at a time, with a keyboard tick for each.
 * Writes through React's value tracking, so it behaves like real keystrokes.
 */
export async function typeText(el: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
  const end = beginAgentActivity();
  try {
    const chars = Array.from(text);
    const current = el.value;
    // Continue from what is already there when the new value extends it; otherwise start over.
    let from = 0;
    if (current && text.startsWith(current)) from = Array.from(current).length;
    else if (current) {
      writeValue(el, '');
      playTypingTick(true);
      await sleep(70);
    }
    if (instant) {
      writeValue(el, text);
      return;
    }
    const remaining = chars.length - from;
    // ~0.9 s for a typical value, never slower than 70 ms/char at full speed…
    const perChar = Math.max(18, Math.min(70, Math.round(900 / Math.max(1, remaining))));
    // …but every keystroke re-renders the form, which can cost real time on a phone. The whole fill
    // gets a budget, and when steps run slower than planned more characters go in per step.
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
      writeValue(el, chars.slice(0, upto).join(''));
      playTypingTick(false);
      await sleep(perChar);
      iterMs = Date.now() - stepStart;
      i = upto;
    }
  } finally {
    end();
  }
}

/** Walks a value to its target in a few steps, with a detent sound per step. */
export async function slideTo(opts: { from: number; to: number; write: (value: number) => void }): Promise<void> {
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
