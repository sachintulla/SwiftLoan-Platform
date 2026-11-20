import type { Metadata } from 'next';
import { DocsPageContent } from '@/components/pages/DocsPageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/personal-loan-eligibility');

/** /personal-loan-eligibility — its own page so it can rank for "personal loan eligibility" (SEO phase 2). */
export default function PersonalLoanEligibilityPage() {
  return <DocsPageContent page="eligibility" lang="en" />;
}
