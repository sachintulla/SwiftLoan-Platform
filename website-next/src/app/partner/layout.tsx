import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { ApplyProvider } from '@/lib/applyContext';

// /partner/return is where a partner lender sends the applicant back; it renders in the same shell as /apply.
// Kept out of search engines: where a partner lender sends the applicant back (lib/seo.ts PRIVATE_PATHS).
export const metadata: Metadata = { robots: NOINDEX };

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <ApplyProvider>{children}</ApplyProvider>;
}
