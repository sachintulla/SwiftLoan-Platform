'use client';

import { usePathname } from 'next/navigation';

/**
 * The application funnel (/apply/*) and the returning-applicant account area
 * (/account/*) are their own full-screen app-like flow, not marketing pages —
 * they render their own split-screen shell (ApplyShell/AccountShell) instead
 * of sitting inside the marketing SiteHeader/SiteFooter/Backdrop/QuickCheckModal.
 *
 * The standalone legal pages (/privacy-policy, /compliance) also carry their own
 * top bar, nav and footer, so the marketing chrome is hidden there too —
 * otherwise two headers/footers stack and the page looks nested inside another.
 */
const STANDALONE_PAGES = ['/privacy-policy', '/privacypolicy', '/compliance'];

export function HideOnAppRoutes({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAppRoute =
    pathname?.startsWith('/apply') ||
    pathname?.startsWith('/account') ||
    pathname?.startsWith('/partner') ||
    STANDALONE_PAGES.some(p => pathname === p || pathname?.startsWith(`${p}/`));
  if (isAppRoute) return null;
  return <>{children}</>;
}
