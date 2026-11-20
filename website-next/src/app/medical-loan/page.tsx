import type { Metadata } from 'next';
import { PurposePageContent } from '@/components/pages/PurposePageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/medical-loan');

/** /medical-loan — a personal loan used for this purpose, as its own page (SEO phase 2, item 3). */
export default function MedicalLoanPage() {
  return <PurposePageContent purpose="medical" lang="en" />;
}
