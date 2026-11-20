import { PURPOSE_PATH, purposePagesCopy, type PurposeKey } from '@/i18n/purpose-pages';
import { breadcrumbJsonLd, faqPageJsonLd, jsonLdString, loanProductJsonLd, pageUrl } from '@/lib/seo';
import type { Lang } from '@/lib/locale';

/** Personal-loan amount range (whole rupees), as on the home page's loan card and /personal-loan's structured data. */
const PERSONAL_MIN = 50000;
const PERSONAL_MAX = 2500000;

/**
 * Structured data for one loan-purpose page, in the page's language: the loan (a personal loan,
 * amounts only), its FAQs and the breadcrumb Home › Personal loan › <purpose>.
 */
export function purposeJsonLd(purpose: PurposeKey, lang: Lang = 'en'): string {
  const all = purposePagesCopy[lang];
  const page = all.pages[purpose];
  const path = PURPOSE_PATH[purpose];
  return jsonLdString([
    loanProductJsonLd({ name: page.linkLabel, path, description: page.intro, minAmount: PERSONAL_MIN, maxAmount: PERSONAL_MAX, lang }),
    faqPageJsonLd(page.faqs, lang),
    breadcrumbJsonLd([
      { name: all.home, url: pageUrl('/', lang) },
      { name: all.personalLoan, url: pageUrl('/personal-loan', lang) },
      { name: page.breadcrumb, url: pageUrl(path, lang) },
    ]),
  ]);
}
