'use client';

import { useEffect, useState } from 'react';
import { fetchMe } from '@/lib/applyApi';
import type { AccountRailUser } from '@/components/apply/AccountRail';

/**
 * Fetches the logged-in user's basic info for pages that want to show the
 * account sidebar (ApplyShell's `accountUser` prop) instead of the marketing
 * brand rail — Offers onward, where the visitor is a real applicant, not
 * someone still being pitched the product. Returns null while loading or if
 * there's no session; callers just pass it straight to ApplyShell either way.
 */
export function useAccountUser(): AccountRailUser | null {
  const [user, setUser] = useState<AccountRailUser | null>(null);

  useEffect(() => {
    fetchMe()
      .then((res) => setUser(res?.data?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  return user;
}
