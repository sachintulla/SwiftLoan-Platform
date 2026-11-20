import { PUBLIC_PAGES } from './seo';
import type { PublicPage } from './seoTypes';
import { ALL_LANGS, DEFAULT_LANG, URL_LANGS, isUrlLang, splitLangPath, withLang, type Lang, type UrlLang } from './locale';

/**
 * Which pages have a Hindi and a Telugu URL, and how links move between the versions.
 * The one source is PUBLIC_PAGES (lib/seo.ts): a page with `i18n` on its entry has /hi and /te
 * versions; every other path (legal pages, /apply, /account …) has only its one URL.
 * Pure (no React), so the server, the client chrome and the tests share it.
 */

/** English paths of the pages that have language versions, e.g. ['/', '/personal-loan', …]. */
export function localizedPaths(): string[] {
  return PUBLIC_PAGES.filter((p) => p.i18n).map((p) => p.path);
}

/** Does this English path ('/faqs') have /hi and /te versions? */
export function isLocalizedPath(path: string): boolean {
  return PUBLIC_PAGES.some((p) => p.path === path && !!p.i18n);
}

/**
 * The route params of app/[lang]/… → the page they stand for, or null (= 404) when the language is
 * unknown ('en' and 'fr' are both unknown here: English lives at the bare path) or the page has
 * no language versions.
 */
export function resolveLocalizedRoute(lang: string, slug?: string[]): { lang: UrlLang; path: string; page: PublicPage } | null {
  if (!isUrlLang(lang)) return null;
  const path = slug && slug.length ? `/${slug.join('/')}` : '/';
  const page = PUBLIC_PAGES.find((p) => p.path === path && !!p.i18n);
  return page ? { lang, path, page } : null;
}

/** The language a pathname is written in when it is a real language URL ('/hi/faqs' → 'hi'), else null. */
export function urlLangOf(pathname: string | null | undefined): UrlLang | null {
  const { lang, path } = splitLangPath(pathname);
  return isUrlLang(lang) && isLocalizedPath(path) ? lang : null;
}

/** Every language URL that exists, as English path + language (for generateStaticParams and the sitemap). */
export function localizedRoutes(): { lang: UrlLang; path: string }[] {
  return localizedPaths().flatMap((path) => URL_LANGS.map((lang) => ({ lang, path })));
}

/**
 * Keep an internal link in the reader's language: ('/faqs', 'hi') → '/hi/faqs',
 * ('/#lead-form', 'te') → '/te#lead-form', ('/hi/faqs', 'en') → '/faqs'.
 * Left exactly as given: links to pages with no language version ('/apply', '/privacy-policy'),
 * external links, and anything that is not a site path ('#top', 'mailto:…').
 */
export function localizedHref(href: string, lang: Lang): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const cut = href.search(/[?#]/);
  const rawPath = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? '' : href.slice(cut);
  const { path } = splitLangPath(rawPath);
  if (!isLocalizedPath(path)) return href;
  return withLang(path, lang) + rest;
}

/**
 * For the language menus: where each language's version of the page being viewed lives, or null
 * when that page has no language versions (the menu then switches in place, as it always did).
 */
export function languageLinks(pathname: string | null | undefined): Record<Lang, string> | null {
  const { path } = splitLangPath(pathname);
  if (!isLocalizedPath(path)) return null;
  const out = {} as Record<Lang, string>;
  for (const l of ALL_LANGS) out[l] = withLang(path, l);
  return out;
}

export { DEFAULT_LANG };
