import type { Metadata } from 'next';
import { DocsPageContent } from '@/components/pages/DocsPageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/business-loan-documents');

/** /business-loan-documents — its own page so it can rank for "documents required for business loan" (SEO phase 2). */
export default function BusinessLoanDocumentsPage() {
  return <DocsPageContent page="businessDocs" lang="en" />;
}
