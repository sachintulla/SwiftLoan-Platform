/**
 * Why the offers screens are showing "we couldn't get offers", kept in `state.offersError`.
 *
 * It used to hold the finished SENTENCE, already translated at the moment it was stored. So it
 * stayed in whatever language the app was in at that moment: change the app to Hindi afterwards
 * (or have it stored before the saved language was applied) and My Offers showed one English
 * line among Hindi text until Retry stored it again.
 *
 * Our own reasons are now stored as their KEY in i18n/strings.ts and turned into text only when
 * shown, so they always follow the current app language. Any other text (there is none today)
 * is shown as it is.
 *
 * Pure: no React.
 */
export const OFFERS_ERROR_KEYS = ['findingErrNotEligible', 'findingErrDuplicate', 'findingErrTechnical', 'findingErrNetwork'] as const;
export type OffersErrorKey = (typeof OFFERS_ERROR_KEYS)[number];

/** The reason code the server / loader reports → the key to store ('' = no problem to show). */
export function offersErrorKeyFor(reason: string | null | undefined): OffersErrorKey | '' {
  if (reason === 'not_eligible') return 'findingErrNotEligible';
  if (reason === 'duplicate') return 'findingErrDuplicate';
  if (reason === 'technical') return 'findingErrTechnical';
  if (reason === 'network') return 'findingErrNetwork';
  return '';
}

/** What to show for a stored `offersError`, in the language of `t`. */
export function offersErrorText(value: string | null | undefined, t: Record<string, string>): string {
  if (!value) return '';
  return (OFFERS_ERROR_KEYS as readonly string[]).includes(value) ? t[value] ?? value : value;
}
