import type { Metadata } from 'next';
import { DocsPageContent } from '@/components/pages/DocsPageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/personal-loan-documents');

/** /personal-loan-documents — its own page so it can rank for "documents required for personal loan" (SEO phase 2). */
export default function PersonalLoanDocumentsPage() {
  return <DocsPageContent page="personalDocs" lang="en" />;
}
