import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/seo';
import { localizedRoutes, resolveLocalizedRoute } from '@/lib/localeRoutes';
import { LOCALIZED_PAGES } from './localizedPages';

/**
 * Shared by the two language routes (app/[lang]/page.tsx and app/[lang]/[...slug]/page.tsx).
 * Everything here is known at build time, so the language pages are plain static HTML: the routes
 * list their URLs with generateStaticParams and set `dynamicParams = false`, which makes any other
 * /xx/... address (unknown language, a page with no language version, a typo) a 404.
 */
export interface LangRouteParams {
  lang: string;
  slug?: string[];
}

/** Every language URL that can be rendered: has `i18n` in PUBLIC_PAGES and a body in LOCALIZED_PAGES. */
export function localizedStaticParams(): { lang: string; slug: string[] }[] {
  return localizedRoutes()
    .filter((r) => r.path in LOCALIZED_PAGES)
    .map((r) => ({ lang: r.lang, slug: r.path === '/' ? [] : r.path.slice(1).split('/') }));
}

export function localizedMetadata(params: LangRouteParams): Metadata {
  const route = resolveLocalizedRoute(params.lang, params.slug);
  return route ? pageMetadata(route.path, route.lang) : {};
}

export function LocalizedPage({ params }: { params: LangRouteParams }) {
  const route = resolveLocalizedRoute(params.lang, params.slug);
  const Body = route ? LOCALIZED_PAGES[route.path] : undefined;
  if (!route || !Body) notFound();
  // <html lang> is set once by the root layout ("en") and cannot follow this route without making
  // every page dynamic, so the language is declared here, on the page's own wrapper. (The browser's
  // <html lang> is corrected after load by LanguageProvider; header and footer carry their own.)
  return (
    <div lang={route.lang}>
      <Body lang={route.lang} />
    </div>
  );
}
