import { PurposeGuide } from '@/components/site/PurposeGuide';
import type { ComponentType } from 'react';
import { PURPOSE_KEYS, PURPOSE_PATH, type PurposeKey } from '@/i18n/purpose-pages';
import { purposeJsonLd } from '@/lib/purposeSeo';
import type { Lang } from '@/lib/locale';

/**
 * A loan-purpose page (/wedding-loan, /medical-loan, /travel-loan, /education-loan,
 * /debt-consolidation-loan) and its /hi, /te versions: structured data in the page's language,
 * then the page. Same shape as LoanPageContent, so it can be registered in app/[lang]/localizedPages.tsx.
 */
export function PurposePageContent({ purpose, lang }: { purpose: PurposeKey; lang: Lang }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: purposeJsonLd(purpose, lang) }} />
      <PurposeGuide purpose={purpose} />
    </>
  );
}

/** English path → body, for the /hi and /te routes (app/[lang]/localizedPages.tsx). */
export const PURPOSE_LOCALIZED_BODIES: Record<string, ComponentType<{ lang: Lang }>> = Object.fromEntries(
  PURPOSE_KEYS.map((k) => [PURPOSE_PATH[k], ({ lang }: { lang: Lang }) => <PurposePageContent purpose={k} lang={lang} />]),
);
