import type { CopyLang } from './copy';

/**
 * Language in the URL, the pure part: no React, no page list (that is lib/localeRoutes.ts).
 *
 * English has no prefix (/, /faqs …) and never will: existing links keep working. Hindi and Telugu
 * are the same path under /hi and /te (/hi, /hi/faqs, /te/personal-loan …).
 */
export type Lang = CopyLang;
export const DEFAULT_LANG: Lang = 'en';

/** The languages that have a URL prefix. */
export const URL_LANGS = ['hi', 'te'] as const;
export type UrlLang = (typeof URL_LANGS)[number];

/** Every language, English first. */
export const ALL_LANGS: readonly Lang[] = [DEFAULT_LANG, ...URL_LANGS];

/** What each language is called in tags: `hreflang` / `<html lang>` and Open Graph's `og:locale`. */
export const LOCALE_TAGS: Record<Lang, { hreflang: string; ogLocale: string }> = {
  en: { hreflang: 'en-IN', ogLocale: 'en_IN' },
  hi: { hreflang: 'hi-IN', ogLocale: 'hi_IN' },
  te: { hreflang: 'te-IN', ogLocale: 'te_IN' },
};

export function isUrlLang(value: unknown): value is UrlLang {
  return typeof value === 'string' && (URL_LANGS as readonly string[]).includes(value);
}

/** '/faqs/' → '/faqs', '' → '/'. */
function tidy(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return p.length > 1 ? p.replace(/\/+$/, '') || '/' : p;
}

/**
 * Split a pathname into its language and the English path behind it.
 * '/hi/faqs' → { lang: 'hi', path: '/faqs' }, '/te' → { lang: 'te', path: '/' },
 * '/faqs' → { lang: 'en', path: '/faqs' }. Only looks at the prefix: whether that page really
 * has a Hindi version is lib/localeRoutes.ts's question.
 */
export function splitLangPath(pathname: string | null | undefined): { lang: Lang; path: string } {
  const path = tidy(pathname || '/');
  const first = path.split('/')[1];
  if (isUrlLang(first)) return { lang: first, path: tidy(path.slice(first.length + 1)) };
  return { lang: DEFAULT_LANG, path };
}

/** The same English path in another language: ('/faqs', 'hi') → '/hi/faqs', ('/', 'te') → '/te', (x, 'en') → x. */
export function withLang(path: string, lang: Lang): string {
  const p = tidy(path);
  if (lang === DEFAULT_LANG) return p;
  return p === '/' ? `/${lang}` : `/${lang}${p}`;
}
