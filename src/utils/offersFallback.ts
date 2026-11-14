/**
 * No-offers fallback: when the eligibility check (Aurix / KFT) returns no offers, for ANY reason
 * (not eligible, already registered, a technical fault, no network), the applicant is not left on
 * a "not eligible" message. The loading screen shows a short "we are trying with different
 * lenders" pop-up and then continues straight into the Yubi (alternative offers) journey.
 *
 * Pure so the routing rule is unit-tested. When Yubi is switched off or there is no application to
 * refer, nothing changes: My Offers shows today's empty state (Retry / Update details).
 */

/** Why the eligibility check returned nothing. `network` = the request itself failed. */
export type NoOffersReason = 'not_eligible' | 'duplicate' | 'technical' | 'network' | 'none';

/** How long the pop-up stays before continuing on its own (the Continue button goes sooner). */
export const FALLBACK_POPUP_MS = 3000;

export function noOffersReason(reason: unknown): NoOffersReason {
  return reason === 'not_eligible' || reason === 'duplicate' || reason === 'technical' || reason === 'network' ? reason : 'none';
}

/** True when the applicant should be taken on to the Yubi journey instead of the empty state. */
export function shouldContinueToAltOffers(args: {
  offerCount: number;
  altOffersEnabled: boolean;
  applicationId: string | null | undefined;
}): boolean {
  return args.offerCount === 0 && args.altOffersEnabled && !!args.applicationId;
}
