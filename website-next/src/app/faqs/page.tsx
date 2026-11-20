import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { FaqsPageContent } from '@/components/pages/FaqsPageContent';

export const metadata: Metadata = pageMetadata('/faqs');

/** /faqs in English. The same body serves /hi/faqs and /te/faqs (app/[lang]/localizedPages.tsx). */
export default function FaqsPage() {
  return <FaqsPageContent lang="en" />;
}
