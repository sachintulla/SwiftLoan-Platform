import type { Metadata } from 'next';
import { DocsPageContent } from '@/components/pages/DocsPageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/personal-loan-for-self-employed');

/** /personal-loan-for-self-employed — its own page so it can rank for "personal loan for self employed" (SEO phase 2). */
export default function PersonalLoanSelfEmployedPage() {
  return <DocsPageContent page="selfEmployed" lang="en" />;
}
