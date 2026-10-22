'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { fetchMe } from '@/lib/applyApi';
import { cacheAccountUser, clearCachedAccountUser, readCachedAccountUser } from '@/lib/accountUserCache';
import type { AccountRailUser } from '@/components/apply/AccountRail';

// useLayoutEffect warns during SSR; on the server there is nothing to restore anyway.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Fetches the logged-in user's basic info for pages that want to show the
 * account sidebar (ApplyShell's `accountUser` prop) instead of the marketing
 * brand rail — Offers onward, where the visitor is a real applicant, not
 * someone still being pitched the product. Returns null while loading or if
 * there's no session; callers just pass it straight to ApplyShell either way.
 *
 * The last known user is restored before the first paint (see lib/accountUserCache.ts) so moving between
 * funnel pages never flashes the brand panel while /me is in flight.
 */
export function useAccountUser(): AccountRailUser | null {
  // Client-side navigations start with the cached user; the server and a hard reload's first render start
  // empty so hydration matches, and the layout effect below fills it in before anything is painted.
  const [user, setUser] = useState<AccountRailUser | null>(() => readCachedAccountUser());

  useIsoLayoutEffect(() => {
    if (!user) {
      const cached = readCachedAccountUser();
      if (cached) setUser(cached);
    }
  }, []);

  useEffect(() => {
    fetchMe()
      .then((res) => {
        const u = res?.data?.user ?? null;
        if (u) cacheAccountUser(u);
        setUser(u);
      })
      .catch((e: { status?: number }) => {
        // Only a real "not signed in" answer drops the cached user; a network blip keeps the rail up.
        if (e?.status === 401 || e?.status === 404) {
          clearCachedAccountUser();
          setUser(null);
        }
      });
  }, []);

  return user;
}
