import type { Metadata } from 'next';
import { EmiCalculatorPageContent } from '@/components/pages/EmiCalculatorPageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata('/emi-calculator');

/** /emi-calculator — the most-searched loan tool, as its own page (SEO phase 2). Also at /hi and /te (app/[lang]/localizedPages.tsx). */
export default function EmiCalculatorPage() {
  return <EmiCalculatorPageContent lang="en" />;
}
