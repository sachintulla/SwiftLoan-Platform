import type { Metadata } from 'next';
import { PurposePageContent } from '@/components/pages/PurposePageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/debt-consolidation-loan');

/** /debt-consolidation-loan — a personal loan used for this purpose, as its own page (SEO phase 2, item 3). */
export default function DebtConsolidationLoanPage() {
  return <PurposePageContent purpose="debt" lang="en" />;
}
