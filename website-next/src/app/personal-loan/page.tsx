import type { Metadata } from 'next';
import { LoanPageContent } from '@/components/pages/LoanPageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/personal-loan');

/** /personal-loan — its own page so it can rank for "personal loan" (SEO phase 2). Also at /hi and /te (app/[lang]/localizedPages.tsx). */
export default function Page() {
  return <LoanPageContent kind="personal" lang="en" />;
}
