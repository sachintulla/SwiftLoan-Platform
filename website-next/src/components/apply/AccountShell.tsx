'use client';

import Link from 'next/link';
import { useAccount } from '@/lib/accountContext';
import { AccountRail, MobileTopBar } from './AccountRail';

export function AccountShell({
  children,
  backHref,
  backLabel = 'Back',
  title,
}: {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  title?: string;
}) {
  const { user } = useAccount();

  return (
    <div className="bg-background flex min-h-screen w-full">
      <AccountRail user={user} />

      <div className="min-w-0 flex-1">
        <MobileTopBar user={user} />
        {(backHref || title) && (
          <div className="flex items-center justify-between px-6 pt-6 sm:px-10">
            {backHref ? (
              <Link href={backHref} className="border-border text-muted-foreground rounded-full border bg-card px-3.5 py-2 text-sm font-semibold">
                ← {backLabel}
              </Link>
            ) : (
              <span />
            )}
            {title && <span className="bg-accent text-accent-foreground rounded-full px-3 py-1.5 text-xs font-bold">{title}</span>}
          </div>
        )}
        <div className="mx-auto w-full max-w-2xl px-6 py-6 sm:px-10">{children}</div>
      </div>
    </div>
  );
}
