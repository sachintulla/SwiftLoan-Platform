/**
 * The image that goes with a WhatsApp template that was approved with an IMAGE header. WhatsApp needs the image's public https URL on
 * EVERY send of such a template, so `sendWhatsAppTemplate` (whatsapp.ts) looks it up here whenever the caller did not pass one: every
 * sender (drop-off, Ruby's link, the no-offers notice, reminders…) gets the image without knowing which templates have one.
 *
 * Where the URL comes from, in order:
 *   1. the template's "Image address" in Admin → Configs → WhatsApp (Vox) → Templates (`templateLibrary[name].headerImageUrl`), so a new
 *      image template needs no deploy: upload the picture anywhere public over https and paste its address;
 *   2. the shipped defaults below, whose banners are served by the website (website-next/public).
 * A template with neither is sent without an image header, exactly as before.
 *
 * Pure (no database), so it is unit-tested. It must not import whatsapp.ts (whatsapp.ts imports it).
 */

const SITE = 'https://swiftloan.ai';

/** Image templates approved in Meta (owner, 6 Nov 2026), and the banner each was approved with. */
export const DEFAULT_TEMPLATE_IMAGES: Readonly<Record<string, string>> = Object.freeze({
  welcome_continue_app: `${SITE}/whatsapp-welcome.png`,
  no_offers_call: `${SITE}/whatsapp-no-offers.png`,
  continue_application_link: `${SITE}/whatsapp-continue-link.jpg`,
  continue_application_app: `${SITE}/whatsapp-continue-app.jpg`,
  offers_ready_view_link: `${SITE}/whatsapp-offers-link.png`,
  offers_ready_open_app: `${SITE}/whatsapp-offers-app.jpg`,
  no_offers_missed_call: `${SITE}/whatsapp-missed-call.jpg`, // "we tried to call you" after an unanswered no-offers call
});

/** A usable image address: https only (WhatsApp fetches it from Meta's servers), at most 2,000 characters. */
export function isImageUrl(value: unknown): value is string {
  const s = String(value ?? '').trim();
  if (!s || s.length > 2000) return false;
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The header image for `templateName`, or '' when the template has none. `storedLibrary` is the raw `templateLibrary` setting. */
export function headerImageFor(templateName: string, storedLibrary: unknown): string {
  const lib = storedLibrary && typeof storedLibrary === 'object' && !Array.isArray(storedLibrary) ? (storedLibrary as Record<string, unknown>) : {};
  const entry = lib[templateName];
  const saved = entry && typeof entry === 'object' ? (entry as { headerImageUrl?: unknown }).headerImageUrl : undefined;
  if (isImageUrl(saved)) return String(saved).trim();
  return DEFAULT_TEMPLATE_IMAGES[templateName] ?? '';
}
