/**
 * GLOBAL SWITCHES for the UI sound effects.
 *
 * UI_SOUNDS_ENABLED — master switch.
 *   false → no sound at all, anywhere (the agent's visual effects — scroll-into-view, typing
 *           animation, ring, ripple — still run).
 *   true  → sounds on, with the rules below.
 *
 * UI_SOUNDS_MANUAL_TEST_MODE — whether the USER'S OWN interaction makes sound.
 *   false → PRODUCTION (the shipped setting): the user's own taps, typing, sliders, scrolling and
 *           menu-bar taps are ALL silent. Sound plays only while the voice agent is acting on the
 *           screen (scrolling to a control, typing, tapping, toggling, sliding, switching tab…).
 *   true  → TEST MODE: every manual interaction also plays the full sound set (tap click, chip
 *           select, toggle on/off, key ticks, slider detents, scroll roll, menu-bar nav), so all of
 *           it can be tried by hand without starting a call.
 *
 * Flip these here (relaunch the app to pick them up) or call `setSoundsEnabled()` /
 * `setManualSoundsEnabled()` at runtime (see src/feedback/sounds.ts).
 */
export const UI_SOUNDS_ENABLED = true;

/** Leave `false` for real use; set `true` only to try the sounds by hand. */
export const UI_SOUNDS_MANUAL_TEST_MODE = false;
