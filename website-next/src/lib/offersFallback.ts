/**
 * No-offers fallback (same rule as the app's src/utils/offersFallback.ts): when the eligibility check
 * returns no offers, for ANY reason (not eligible, already registered, a technical fault, a failed
 * request), /apply/finding shows a short "we are trying with different lenders" pop-up and then takes
 * the visitor straight into the Yubi (alternative offers) journey. No "Did you proceed?" question is
 * asked on return (owner's decision). When Yubi is off or cannot be reached, the visitor lands on
 * /apply/offers as before.
 */

/**
 * sessionStorage flag set just before the automatic hand-off. When the partner sends the visitor back to
 * /partner/return, that page sees it and goes straight to My Applications instead of asking "Did you proceed?"
 * (that question stays for the manual "Get more offers" button).
 */
export const AUTO_CONTINUE_KEY = 'sl_alt_auto';

/** How long the pop-up stays before continuing on its own (the Continue button goes sooner). */
export const FALLBACK_POPUP_MS = 3000;

/** True when the visitor should be taken on to the Yubi journey instead of the empty offers page. */
export function shouldContinueToAltOffers(args: {
  offerCount: number;
  altOffersEnabled: boolean;
  applicationId: string | null | undefined;
}): boolean {
  return args.offerCount === 0 && args.altOffersEnabled && !!args.applicationId;
}
