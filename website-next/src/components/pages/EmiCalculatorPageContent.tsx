import { EmiGuide } from '@/components/site/EmiGuide';
import { emiPageCopy } from '@/i18n/emi-page';
import { breadcrumbJsonLd, emiCalculatorAppJsonLd, faqPageJsonLd, jsonLdString, pageUrl } from '@/lib/seo';
import type { Lang } from '@/lib/locale';

/** /emi-calculator and its /hi, /te versions: structured data in the page's language, then the page. */
export function EmiCalculatorPageContent({ lang }: { lang: Lang }) {
  const t = emiPageCopy[lang];
  const ld = [
    // English keeps its established name; the other languages use the page's own heading.
    lang === 'en' ? emiCalculatorAppJsonLd() : emiCalculatorAppJsonLd(lang, `SwiftLoan.ai ${t.breadcrumbHere}`),
    faqPageJsonLd(t.faqs, lang),
    breadcrumbJsonLd([
      { name: t.breadcrumbHome, url: pageUrl('/', lang) },
      { name: t.breadcrumbHere, url: pageUrl('/emi-calculator', lang) },
    ]),
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <EmiGuide />
    </>
  );
}
