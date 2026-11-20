import { DocsGuide } from '@/components/site/DocsGuide';
import type { ComponentType } from 'react';
import { DOCS_PAGE_KEYS, DOCS_PAGE_PATHS, docsPagesCopy, type DocsPageKey } from '@/i18n/docs-pages';
import { breadcrumbJsonLd, faqPageJsonLd, jsonLdString, pageUrl } from '@/lib/seo';
import type { Lang } from '@/lib/locale';

/** The documents / eligibility pages and their /hi, /te versions: structured data in the page's language, then the page. */
export function DocsPageContent({ page, lang }: { page: DocsPageKey; lang: Lang }) {
  const all = docsPagesCopy[lang];
  const t = all.pages[page];
  const path = DOCS_PAGE_PATHS[page];
  const ld = [
    faqPageJsonLd(t.faqs, lang),
    breadcrumbJsonLd([
      { name: all.home, url: pageUrl('/', lang) },
      { name: t.breadcrumb, url: pageUrl(path, lang) },
    ]),
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <DocsGuide page={page} />
    </>
  );
}

/** English path → body, for the /hi and /te routes (app/[lang]/localizedPages.tsx). */
export const DOCS_LOCALIZED_BODIES: Record<string, ComponentType<{ lang: Lang }>> = Object.fromEntries(
  DOCS_PAGE_KEYS.map((k) => [DOCS_PAGE_PATHS[k], ({ lang }: { lang: Lang }) => <DocsPageContent page={k} lang={lang} />]),
);
