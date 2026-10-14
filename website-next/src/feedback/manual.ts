import { initSounds, isAgentActive, manualSoundsEnabled, playManualSound, playManualTypingTick, soundsEnabled } from './sounds';

/**
 * The visitor's OWN interaction — clicks, options, toggles, typing, sliders, scrolling — as sound.
 *
 * Silent in production: the website's rule (like the app's) is that only the voice assistant makes
 * these sounds. With `UI_SOUNDS_MANUAL_TEST_MODE` on (src/config/sounds.ts, or
 * `__swiftloanSounds.setManualSoundsEnabled(true)` in development) every handler below plays the
 * matching cue so the whole set can be tried by hand without starting a call.
 *
 * Only trusted (real user) events are considered: the assistant presses controls with synthetic
 * clicks and plays its own cues, so it never doubles up with these.
 */

const NAV_SELECTOR = 'header a, nav a, aside a';

function closestControl(t: EventTarget | null): HTMLElement | null {
  return t instanceof Element
    ? t.closest<HTMLElement>('button, a[href], [role="button"], [role="radio"], [role="switch"], input[type="checkbox"], label')
    : null;
}

export function installManualSounds(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  // Browsers only let audio start from a gesture; warm it up on the first one.
  const unlock = () => {
    if (soundsEnabled()) initSounds();
  };
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });
  document.addEventListener('keydown', unlock, { once: true, capture: true });

  const onClick = (e: MouseEvent) => {
    if (!e.isTrusted || !manualSoundsEnabled() || isAgentActive()) return;
    const c = closestControl(e.target);
    if (!c) return;
    const role = c.getAttribute('role');
    if (role === 'switch') {
      playManualSound(c.getAttribute('aria-checked') === 'true' ? 'toggleOff' : 'toggleOn'); // state before the click
    } else if (c instanceof HTMLInputElement && c.type === 'checkbox') {
      playManualSound(c.checked ? 'toggleOn' : 'toggleOff'); // already flipped
    } else if (role === 'radio' || c.hasAttribute('aria-pressed')) {
      playManualSound('select');
    } else if (c.matches(NAV_SELECTOR)) {
      playManualSound('nav');
    } else {
      playManualSound('tap');
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.isTrusted || !manualSoundsEnabled() || isAgentActive()) return;
    const t = e.target;
    if (t instanceof HTMLElement && t.getAttribute('role') === 'slider') {
      if (e.key.startsWith('Arrow') || e.key.startsWith('Page') || e.key === 'Home' || e.key === 'End') playManualSound('slide');
      return;
    }
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
      if (e.key === 'Backspace' || e.key === 'Delete') playManualTypingTick(true);
      else if (e.key.length === 1) playManualTypingTick(false);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!e.isTrusted || e.buttons !== 1 || !manualSoundsEnabled() || isAgentActive()) return;
    if (e.target instanceof Element && e.target.closest('[data-orientation]')) playManualSound('slide'); // pacing in playSound
  };

  let lastY = typeof window !== 'undefined' ? window.scrollY : 0;
  const onScroll = () => {
    if (!manualSoundsEnabled() || isAgentActive()) return;
    const y = window.scrollY;
    if (Math.abs(y - lastY) > 24) {
      lastY = y;
      playManualSound('scroll'); // paced to one pulse per 220 ms inside playSound
    }
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('scroll', onScroll);
  };
}
