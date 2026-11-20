import type { ComponentType } from 'react';
import type { Lang } from '@/lib/locale';
import { HomePageContent } from '@/components/pages/HomePageContent';
import { FaqsPageContent } from '@/components/pages/FaqsPageContent';
import { EmiCalculatorPageContent } from '@/components/pages/EmiCalculatorPageContent';
import { LoanPageContent } from '@/components/pages/LoanPageContent';
import { DOCS_LOCALIZED_BODIES } from '@/components/pages/DocsPageContent';
import { PURPOSE_LOCALIZED_BODIES } from '@/components/pages/PurposePageContent';

/**
 * LANGUAGE VERSIONS OF A PAGE (/hi/<path> and /te/<path>) — how they work and how to add one.
 *
 * English stays at its own URL (/personal-loan). The Hindi and Telugu versions are NOT copies of
 * the page file: the two routes in this folder (app/[lang]/page.tsx for /hi and /te themselves,
 * app/[lang]/[...slug]/page.tsx for everything under them) render the body registered below, with
 * the language taken from the URL. LanguageProvider (lib/i18n.tsx) reads the same URL, so every
 * `useCopy(...)` in the body is already Hindi / Telugu in the server's HTML.
 *
 * TO GIVE A PAGE LANGUAGE VERSIONS — two steps, both needed:
 *
 *  1. In its PUBLIC_PAGES entry (lib/seo.ts, or lib/seoPages.*.ts) add the translated title and
 *     description:
 *
 *       i18n: {
 *         hi: { title: '…', description: '…' },
 *         te: { title: '…', description: '…' },
 *       },
 *
 *     That alone turns on: hreflang tags on all three versions (pageMetadata), the /hi and /te lines
 *     in sitemap.xml, the language menus becoming links, and localizedHref() keeping links to this
 *     page inside the reader's language.
 *
 *  2. Register the page's body in LOCALIZED_PAGES below, keyed by its English path:
 *
 *       '/documents-required': DocumentsPageContent,
 *
 *     The body gets `{ lang }`. A client component that reads its text with useCopy() can be
 *     registered as it is (it may ignore the prop). If the page has structured data (JSON-LD), put
 *     the <script> and the body in one small server component that takes `lang` (see
 *     components/pages/LoanPageContent.tsx: copy[lang], pageUrl(path, lang), faqPageJsonLd(faqs,
 *     lang)) and use that same component from the English page.tsx with lang="en", so the two
 *     cannot drift.
 *
 * Step 1 without step 2 would advertise /hi and /te URLs that answer 404; the test
 * lib/localeRoutes.test.ts ("every page with language versions has a registered body") fails then.
 * In the body, links to other pages go through `useLocalizedHref()` (lib/i18n.tsx).
 *
 * Not for: legal pages (English on purpose) and private routes (/apply, /account …).
 */
export type LocalizedBody = ComponentType<{ lang: Lang }>;

export const LOCALIZED_PAGES: Record<string, LocalizedBody> = {
  '/': HomePageContent,
  '/faqs': FaqsPageContent,
  '/emi-calculator': EmiCalculatorPageContent,
  '/personal-loan': ({ lang }) => <LoanPageContent kind="personal" lang={lang} />,
  '/business-loan': ({ lang }) => <LoanPageContent kind="business" lang={lang} />,
  // Documents and eligibility pages (i18n/docs-pages.ts)
  ...DOCS_LOCALIZED_BODIES,  // Loan-purpose pages (i18n/purpose-pages.ts)
  ...PURPOSE_LOCALIZED_BODIES,
};
