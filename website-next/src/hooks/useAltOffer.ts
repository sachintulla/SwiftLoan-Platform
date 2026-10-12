'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAltOffersEnabled, markAltOfferApplied, requestAltOffer } from '@/lib/altOffers';
import {
  PENDING_KEY,
  altOfferAvailable,
  parsePending,
  shouldPromptAfterReturn,
  type PendingAltOffer,
} from '@/lib/altOfferLogic';
import { useCopy } from '@/lib/i18n';
import { altOffersCopy } from '@/i18n/apply-altoffers';

function readPending(): PendingAltOffer | null {
  try {
    return parsePending(sessionStorage.getItem(PENDING_KEY));
  } catch {
    return null;
  }
}
function writePending(p: PendingAltOffer | null) {
  try {
    if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode — the question simply won't be asked */
  }
}

/** Server flag (GET /config/features) — false until known, so the tile never flashes in then out. */
export function useAltOffersEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchAltOffersEnabled().then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);
  return on;
}

/**
 * Opens the partner (Yubi / YMPL) journey for an application and, when the
 * visitor comes back, asks whether they proceeded (the website can't see inside
 * the partner page the way the app's WebView does) → POST /alt-offer/applied.
 *
 * The journey opens in a NEW tab. The tab is opened synchronously inside the
 * click (before the async redirect-URL request) so popup blockers allow it; if
 * it is blocked anyway we continue in this tab. `sl_alt_pending` in
 * sessionStorage survives either path, so the question is asked wherever the
 * visitor lands next (offers page, My Applications, /partner/return).
 */
export function useAltOffer(applicationId: string | null | undefined) {
  const t = useCopy(altOffersCopy);
  const tRef = useRef(t);
  tRef.current = t;
  const enabled = useAltOffersEnabled();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [added, setAdded] = useState(false);
  const busy = useRef(false);

  const check = useCallback(() => {
    if (shouldPromptAfterReturn(readPending(), Date.now(), applicationId)) setAsking(true);
  }, [applicationId]);

  // Ask on arrival (same-tab flow) and whenever the tab becomes visible again (new-tab flow).
  useEffect(() => {
    check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, [check]);

  const open = useCallback(async () => {
    if (!applicationId || busy.current) return;
    busy.current = true;
    setOpening(true);
    setError(null);
    setAdded(false);
    // Must happen synchronously in the click handler or popup blockers refuse it.
    let win: Window | null = null;
    try {
      win = window.open('', '_blank');
      if (win) {
        win.opener = null; // the partner page gets no handle back to us
        win.document.title = 'SwiftLoan';
        win.document.body.style.cssText = 'font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#0A3F41';
        win.document.body.textContent = tRef.current.openingTab;
      }
    } catch {
      win = null;
    }
    try {
      const alt = await requestAltOffer(applicationId);
      if (alt?.available && alt.redirectUrl) {
        writePending({ applicationId, openedAt: Date.now() });
        if (win) win.location.href = alt.redirectUrl;
        else window.location.assign(alt.redirectUrl); // popup blocked → continue here
      } else {
        win?.close();
        setError(tRef.current.openFailed);
      }
    } catch {
      win?.close();
      setError(tRef.current.openFailed);
    } finally {
      setOpening(false);
      busy.current = false;
    }
  }, [applicationId]);

  const answer = useCallback(
    async (proceeded: boolean) => {
      const pending = readPending();
      writePending(null);
      setAsking(false);
      if (!proceeded || !pending) return false;
      try {
        const r = await markAltOfferApplied(pending.applicationId);
        setAdded(!!r.applied);
        return !!r.applied;
      } catch {
        return false; // best-effort, like the app (fire-and-forget)
      }
    },
    [],
  );

  return {
    available: altOfferAvailable(enabled, applicationId),
    opening,
    error,
    asking,
    added,
    open,
    answer,
  };
}
