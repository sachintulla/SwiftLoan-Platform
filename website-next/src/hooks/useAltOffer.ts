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

/** Server flag (GET /config/features) — false until known, so the button never flashes in then out. */
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
 * "Get more offers": takes the visitor to the partner (Yubi / YMPL) journey in
 * THIS tab — a normal top-level navigation, which the partner allows (unlike
 * framing it in an iframe, which it blocks) — and, when they come back, asks
 * whether they proceeded (the website can't see inside the partner page the way
 * the app's WebView does) → POST /alt-offer/applied.
 *
 * The partner sends the applicant back to /partner/return (server YUBI_RETURN_URL);
 * `sl_alt_pending` in sessionStorage survives the round trip, so the question is
 * asked wherever they land (that page, or the offers page via the browser's Back).
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

  // Ask on arrival, and whenever the page becomes visible again (Back / bfcache restore, tab focus).
  useEffect(() => {
    check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', onShow);
    };
  }, [check]);

  const open = useCallback(async () => {
    if (!applicationId || busy.current) return;
    busy.current = true;
    setOpening(true);
    setError(null);
    setAdded(false);
    try {
      const alt = await requestAltOffer(applicationId);
      if (alt?.available && alt.redirectUrl) {
        writePending({ applicationId, openedAt: Date.now() });
        window.location.assign(alt.redirectUrl); // leaves the page — keep the button busy
        return;
      }
      setError(tRef.current.openFailed);
    } catch {
      setError(tRef.current.openFailed);
    }
    setOpening(false);
    busy.current = false;
  }, [applicationId]);

  const answer = useCallback(async (proceeded: boolean) => {
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
  }, []);

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
