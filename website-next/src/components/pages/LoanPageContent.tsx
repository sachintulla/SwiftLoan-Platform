import { LoanGuide, type LoanKind } from '@/components/site/LoanGuide';
import { loanPagesCopy } from '@/i18n/loan-pages';
import { breadcrumbJsonLd, faqPageJsonLd, jsonLdString, loanProductJsonLd, pageUrl } from '@/lib/seo';
import type { Lang } from '@/lib/locale';

/** Where each loan page lives and the amounts the site states for it (whole rupees). */
const LOAN_PAGES: Record<LoanKind, { path: string; minAmount: number; maxAmount: number }> = {
  personal: { path: '/personal-loan', minAmount: 50000, maxAmount: 2500000 },
  business: { path: '/business-loan', minAmount: 100000, maxAmount: 7500000 },
};

/** /personal-loan, /business-loan and their /hi, /te versions: structured data in the page's language, then the page. */
export function LoanPageContent({ kind, lang }: { kind: LoanKind; lang: Lang }) {
  const all = loanPagesCopy[lang];
  const t = all[kind];
  const { path, minAmount, maxAmount } = LOAN_PAGES[kind];
  const ld = [
    loanProductJsonLd({ name: t.breadcrumb, path, description: t.intro, minAmount, maxAmount, lang }),
    faqPageJsonLd(t.faqs, lang),
    breadcrumbJsonLd([
      { name: all.home, url: pageUrl('/', lang) },
      { name: t.breadcrumb, url: pageUrl(path, lang) },
    ]),
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <LoanGuide kind={kind} />
    </>
  );
}
