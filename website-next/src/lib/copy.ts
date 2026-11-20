/**
 * Copy bundles, without React. Kept out of lib/i18n.tsx (a client module) so text can also be
 * read on the server, e.g. the FAQ structured data in app/faqs/layout.tsx. i18n.tsx re-exports both.
 */
export type CopyLang = 'en' | 'hi' | 'te';

/** A copy bundle: the same shape translated into every supported language. */
export type Copy<T> = Record<CopyLang, T>;

/** Declare a copy bundle; the English entry drives the type of the others. */
export function defineCopy<T>(bundle: { en: T; hi: T; te: T }): Copy<T> {
  return bundle;
}
