/**
 * The ONE stacking order for everything that floats over a page.
 *
 * The owner's rule: Ruby (the floating voice assistant) is background. Whenever a banner,
 * menu, pop-up, sheet, alert or toast is showing, it is drawn ABOVE Ruby, never under her.
 *
 * Bottom → top:
 *
 *   page      0 – 100   ordinary content, sticky headers and bottom bars (their own small
 *                       z-indexes: z-10 … z-50, the old `.nav` at 100). Nothing in a page
 *                       may use a z-index of 1000 or more except through this file.
 *   ruby      1000      Ruby: desktop pill, phone button + its call panel, her error note.
 *   banner    2000      bottom banners that ask something (the ads consent banner).
 *   menu      3000      menus and drawers: language menu, account drawer on phones, the open
 *                       site header menu.
 *   modal     4000      pop-ups and bottom sheets with a backdrop (OTP, quick check, camera,
 *                       log out, "Did you proceed?", filters, support ticket, "trying other
 *                       lenders").
 *   alert     5000      blocking alerts that can open over a pop-up (PAN not found …) and the
 *                       assistant's own "Allow / Deny" confirmation.
 *   takeover  6000      full-screen take-overs (Ruby's welcome clip).
 *   toast     7000      toasts: short, never block, must stay readable over anything.
 *   agentFx   8000      the assistant's focus ring / ripple. It cannot be clicked
 *                       (pointer-events: none) and must outline controls inside pop-ups too.
 *
 * How to use it:
 *   - Tailwind:      className="… z-[var(--z-modal)]"   (variables come from `layerCssVars()`,
 *                    which the root layout writes into <head>)
 *   - inline / CSS strings built in JS:   LAYERS.ruby
 *
 * A z-index only competes inside its own stacking context. A pop-up rendered inside an
 * ancestor that is `sticky`/`fixed`, has a `z-index`, `transform`, `filter` or
 * `backdrop-filter` is trapped under Ruby whatever number it has: portal it to <body>.
 */
export const LAYERS = {
  ruby: 1000,
  banner: 2000,
  menu: 3000,
  modal: 4000,
  alert: 5000,
  takeover: 6000,
  toast: 7000,
  agentFx: 8000,
} as const;

export type LayerName = keyof typeof LAYERS;

/** Highest z-index ordinary page content (sticky bars included) may use. */
export const PAGE_LAYER_MAX = 100;

/** `:root{--z-ruby:1000;…}` — written once into <head> by the root layout. */
export function layerCssVars(): string {
  const body = (Object.keys(LAYERS) as LayerName[]).map((k) => `--z-${k}:${LAYERS[k]}`).join(';');
  return `:root{${body}}`;
}

/* ───────────── Ruby and a bottom banner on screen together ───────────── */

/** CSS variable Ruby's bottom offset adds on; set by the banner while it is visible. */
export const BANNER_LIFT_VAR = '--sl-banner-lift';

/** Width of the corner Ruby occupies, measured from the right edge of the screen. */
const RUBY_CORNER_DESKTOP_PX = 320; // pill (min 250px) + its 22px margin, with room for longer labels
const RUBY_CORNER_PHONE_PX = 96; // 64px button + 16px margin, plus her halo
/** Below this width the phone button is used instead of the desktop pill (VoiceWidget's own breakpoint). */
const RUBY_PHONE_MAX_WIDTH = 1023;
/** Air left between the top of the banner and Ruby. */
const BANNER_GAP_PX = 8;

/**
 * How far (px) Ruby must move up so she does not sit over, or under, a banner fixed to the
 * bottom of the screen. 0 when the banner does not reach her corner (a wide desktop window,
 * where the centred banner and the right-hand pill are side by side) or has no size yet.
 */
export function bannerLiftPx(o: {
  bannerTop: number;
  bannerRight: number;
  bannerHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): number {
  if (!(o.bannerHeight > 0) || !(o.viewportWidth > 0) || !(o.viewportHeight > 0)) return 0;
  const corner = o.viewportWidth <= RUBY_PHONE_MAX_WIDTH ? RUBY_CORNER_PHONE_PX : RUBY_CORNER_DESKTOP_PX;
  if (o.bannerRight <= o.viewportWidth - corner) return 0;
  return Math.max(0, Math.round(o.viewportHeight - o.bannerTop + BANNER_GAP_PX));
}
