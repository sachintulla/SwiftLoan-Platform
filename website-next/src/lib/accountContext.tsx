'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bootstrapSession, logout as logoutSession } from './session';
import { fetchMe } from './applyApi';

interface AccountUser {
  id: string;
  fullName?: string;
  firstName?: string;
  phone: string;
  [key: string]: unknown;
}

interface AccountContextValue {
  user: AccountUser | null;
  loading: boolean;
  hasApplication: boolean;
  applicationId: string | null;
  refresh: () => void;
  logout: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [hasApplication, setHasApplication] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const ok = await bootstrapSession();
    if (!ok) {
      router.replace('/apply');
      return;
    }
    try {
      const body = await fetchMe();
      setUser(body.data.user);
      setHasApplication(body.data.hasApplication);
      setApplicationId(body.data.applicationId);
    } catch {
      router.replace('/apply');
      return;
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    await logoutSession();
    router.replace('/apply');
  }, [router]);

  return (
    <AccountContext.Provider value={{ user, loading, hasApplication, applicationId, refresh: load, logout }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within AccountProvider');
  return ctx;
}
