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
  // SSR-safe defaults (never read sessionStorage during render — a lazy
  // useState(() => readStored()...) initializer used to do that, and it ran
  // again during the client's hydration pass with `window` now defined,
  // producing a DIFFERENT first-render tree than the server's and crashing
  // hydration on any page a returning visitor's sessionStorage wasn't empty
  // (e.g. /apply/offers with an applicationId already stored) — React then
  // discards the mismatched server HTML and re-renders from scratch, which
  // can flash a dev error overlay over the page. The real sync now happens
  // below, in an effect (safe: effects only ever run on the client, after
  // hydration has already committed the matching, SSR-safe tree).
  const [phone, setPhoneState] = useState('');
  const [applicationId, setApplicationIdState] = useState<string | null>(null);
  const [selectedOffer, setSelectedOfferState] = useState<SelectedOffer | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loggedIn, setLoggedInState] = useState(false);

  useEffect(() => {
    // Synchronous: runs before the `sessionReady` flip below, so every
    // consumer that gates its own guard effect on `sessionReady` (see the
    // apply/* pages) is guaranteed phone/applicationId/selectedOffer are
    // already the REAL stored values by the time it re-checks them — closing
    // the same race the old lazy-initializer trick was working around,
    // without reading sessionStorage during render.
    const stored = readStored();
    if (stored.phone) setPhoneState(stored.phone);
    if (stored.applicationId) setApplicationIdState(stored.applicationId);
    if (stored.selectedOffer) setSelectedOfferState(stored.selectedOffer);

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
