import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { HomePageContent } from '@/components/pages/HomePageContent';

export const metadata: Metadata = pageMetadata('/');

/** The home page in English. The same body serves /hi and /te (app/[lang]/localizedPages.tsx). */
export default function HomePage() {
  return <HomePageContent lang="en" />;
}
