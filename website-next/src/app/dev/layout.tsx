import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

// Internal tools: never in search results.
export const metadata: Metadata = { robots: NOINDEX };

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return children;
}
