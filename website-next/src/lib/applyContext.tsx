'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { bootstrapSession } from './session';

export interface SelectedOffer {
  id: string;
  lenderName: string | null;
  redirectionUrl: string | null;
  amount: number;
  apr: number;
  emi: number;
  tenureMonths: number;
}

interface ApplyState {
  phone: string;
  applicationId: string | null;
  selectedOffer: SelectedOffer | null;
  sessionReady: boolean;
  loggedIn: boolean;
}

interface ApplyContextValue extends ApplyState {
  setPhone: (phone: string) => void;
  setApplicationId: (id: string | null) => void;
  setSelectedOffer: (offer: SelectedOffer | null) => void;
  setLoggedIn: (v: boolean) => void;
}

const STORAGE_KEY = 'sl_apply_state';

const ApplyContext = createContext<ApplyContextValue | null>(null);

function readStored(): Partial<ApplyState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStored(patch: Partial<ApplyState>) {
  if (typeof window === 'undefined') return;
  try {
    const current = readStored();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    /* sessionStorage unavailable (private mode) — in-memory state still works for this tab */
  }
}

export function ApplyProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializers, not a mount effect: a child page's own guard effect
  // (e.g. "redirect to /apply if no phone") runs BEFORE a parent's effect on
  // mount (React fires effects bottom-up), so hydrating from sessionStorage in
  // an effect here raced every such guard and bounced the user straight back —
  // reading it synchronously during the initial render closes that gap.
  const [phone, setPhoneState] = useState(() => readStored().phone ?? '');
  const [applicationId, setApplicationIdState] = useState<string | null>(() => readStored().applicationId ?? null);
  const [selectedOffer, setSelectedOfferState] = useState<SelectedOffer | null>(() => readStored().selectedOffer ?? null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loggedIn, setLoggedInState] = useState(false);

  useEffect(() => {
    bootstrapSession().then((ok) => {
      setLoggedInState(ok);
      setSessionReady(true);
    });
  }, []);

  const setPhone = useCallback((v: string) => {
    setPhoneState(v);
    writeStored({ phone: v });
  }, []);
  const setApplicationId = useCallback((v: string | null) => {
    setApplicationIdState(v);
    writeStored({ applicationId: v });
  }, []);
  const setSelectedOffer = useCallback((v: SelectedOffer | null) => {
    setSelectedOfferState(v);
    writeStored({ selectedOffer: v });
  }, []);
  const setLoggedIn = useCallback((v: boolean) => setLoggedInState(v), []);

  return (
    <ApplyContext.Provider
      value={{ phone, applicationId, selectedOffer, sessionReady, loggedIn, setPhone, setApplicationId, setSelectedOffer, setLoggedIn }}
    >
      {children}
    </ApplyContext.Provider>
  );
}

export function useApply(): ApplyContextValue {
  const ctx = useContext(ApplyContext);
  if (!ctx) throw new Error('useApply must be used within ApplyProvider');
  return ctx;
}
