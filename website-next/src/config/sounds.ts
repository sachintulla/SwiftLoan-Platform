/**
 * GLOBAL SWITCHES for the website's UI sound effects — same two keys, same meaning as the mobile
 * app's src/config/sounds.ts, so the two behave alike.
 *
 * UI_SOUNDS_ENABLED — master switch.
 *   false → no sound at all, anywhere (the agent's visual effects — scroll-into-view, typing
 *           animation, ring, ripple — still run).
 *   true  → sounds on, with the rules below.
 *
 * UI_SOUNDS_MANUAL_TEST_MODE — whether the VISITOR'S OWN interaction makes sound.
 *   false → PRODUCTION (the shipped setting): the visitor's own clicks, typing, sliders and
 *           scrolling are ALL silent. Sound plays only while the voice assistant is acting on the
 *           page (scrolling to a control, typing, pressing, toggling, sliding, changing page).
 *   true  → TEST MODE: every manual interaction also plays the full sound set, so all of it can
 *           be tried by hand without starting a call.
 *
 * Both can also be flipped at runtime from the console: `setSoundsEnabled(false)` /
 * `setManualSoundsEnabled(true)` are exposed on `window.__swiftloanSounds` in development.
 */
export const UI_SOUNDS_ENABLED = true;

/** Leave `false` for real use; set `true` only to try the sounds by hand. */
export const UI_SOUNDS_MANUAL_TEST_MODE = false;
