import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { AccountProvider } from '@/lib/accountContext';
import ActivityPing from '@/components/site/ActivityPing';

// Kept out of search engines: signed-in pages (lib/seo.ts PRIVATE_PATHS).
export const metadata: Metadata = { robots: NOINDEX };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <ActivityPing />
      {children}
    </AccountProvider>
  );
}
