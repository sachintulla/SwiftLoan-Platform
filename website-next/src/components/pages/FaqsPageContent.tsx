import { FaqsView } from '@/components/site/FaqsView';
import { faqsCopy } from '@/i18n/faqs';
import { faqPageJsonLd, jsonLdString } from '@/lib/seo';
import type { Lang } from '@/lib/locale';

/**
 * /faqs and /hi/faqs, /te/faqs. The answers sit inside a collapsed accordion, so they are not in
 * the page's text until clicked: this also gives Google every question and answer as FAQ
 * structured data, in the page's language.
 */
export function FaqsPageContent({ lang }: { lang: Lang }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faqPageJsonLd(faqsCopy[lang].faqs, lang)) }} />
      <FaqsView />
    </>
  );
}
