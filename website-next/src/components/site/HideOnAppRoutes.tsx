'use client';

import { usePathname } from 'next/navigation';

/**
 * The application funnel (/apply/*) and the returning-applicant account area
 * (/account/*) are their own full-screen app-like flow, not marketing pages —
 * they render their own split-screen shell (ApplyShell/AccountShell) instead
 * of sitting inside the marketing SiteHeader/SiteFooter/Backdrop/QuickCheckModal.
 */
export function HideOnAppRoutes({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAppRoute = pathname?.startsWith('/apply') || pathname?.startsWith('/account');
  if (isAppRoute) return null;
  return <>{children}</>;
}
