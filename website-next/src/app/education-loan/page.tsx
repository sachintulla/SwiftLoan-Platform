import type { Metadata } from 'next';
import { PurposePageContent } from '@/components/pages/PurposePageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/education-loan');

/** /education-loan — a personal loan used for this purpose, as its own page (SEO phase 2, item 3). */
export default function EducationLoanPage() {
  return <PurposePageContent purpose="education" lang="en" />;
}
