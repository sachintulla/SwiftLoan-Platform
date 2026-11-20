import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { ApplyProvider } from '@/lib/applyContext';
import ActivityPing from '@/components/site/ActivityPing';
import { ApplyConfirm } from '@/components/apply/ApplyConfirm';

// Kept out of search engines: the application steps hold personal data and are no use as a search result (lib/seo.ts PRIVATE_PATHS).
export const metadata: Metadata = { robots: NOINDEX };

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApplyProvider>
      <ActivityPing />
      {children}
      <ApplyConfirm />
    </ApplyProvider>
  );
}
