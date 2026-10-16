/**
 * Meta Pixel + Conversions API for the website.
 *
 * Contract (same as the Upshot wrapper): fire-and-forget, never throws, never blocks
 * or changes a page. It is also CONSENT-GATED — the Pixel script is not even
 * downloaded, and nothing is sent to our Conversions API relay, until the visitor has
 * accepted ad measurement (`sl_meta_consent = granted`). Declining (or never answering)
 * means no Meta code runs at all.
 *
 * Only a few coarse funnel moments are ever reported (see `META_EVENT_FOR`) and they
 * carry NO parameters: no amount, PAN, income, lender or loan detail. Each is sent
 * twice — browser Pixel + server relay — under the same `eventID` so Meta counts it
 * once.
 */
import { META_ENABLED, META_PIXEL_ID, META_SDK_URL } from '@/config/meta';
import { apiBase } from '@/lib/leads';

type Fbq = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export const META_CONSENT_KEY = 'sl_meta_consent';
export type MetaConsent = 'granted' | 'denied' | null;

/** Our (Upshot-shared) funnel event names -> the standard Meta events they count as. */
export type MetaWebEvent =
  | 'Lead'
  | 'CompleteRegistration'
  | 'ViewContent'
  | 'IdentityVerified'
  | 'EligibilityCompleted'
  | 'OffersReceived'
  | 'InitiateCheckout'
  | 'SubmitApplication';

export const META_EVENT_FOR: Record<string, MetaWebEvent> = {
  website_lead_submitted: 'Lead',
  otp_verified: 'CompleteRegistration',
  PAN_Verified: 'IdentityVerified', // custom: identity step passed (the PAN itself is never sent)
  eligibility_completed: 'EligibilityCompleted', // custom: offers lookup finished
  Offers_Got: 'OffersReceived', // custom: at least one offer came back
  offer_viewed: 'ViewContent', // the offers page
  offer_selected: 'InitiateCheckout', // chose an offer to apply (no amounts are sent)
  application_submitted: 'SubmitApplication',
};

/** Steps that can fire repeatedly in one visit (re-fetches, back/forward): reported once per page session. */
const ONCE_PER_SESSION = new Set(['PAN_Verified', 'eligibility_completed', 'Offers_Got', 'offer_viewed']);
const reported = new Set<string>();

/* ───────────────────────── consent ───────────────────────── */

const listeners = new Set<() => void>();

export function getMetaConsent(): MetaConsent {
  try {
    const v = window.localStorage.getItem(META_CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null; // storage blocked: treated as "not answered" -> nothing runs
  }
}

export function setMetaConsent(value: 'granted' | 'denied'): void {
  try {
    window.localStorage.setItem(META_CONSENT_KEY, value);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
  if (value === 'granted') {
    loadPixel();
  } else if (typeof window !== 'undefined' && window.fbq) {
    // Revoke for the current page view; the script is gone on the next load.
    try {
      window.fbq('consent', 'revoke');
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

export function subscribeMetaConsent(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** True only when the integration is configured AND the visitor said yes. */
export function metaAllowed(): boolean {
  return META_ENABLED && typeof window !== 'undefined' && getMetaConsent() === 'granted';
}

/* ───────────────────────── pixel ───────────────────────── */

let pixelStarted = false;

/** Standard Meta bootstrap stub, so `fbq()` calls made before the script arrives are queued. */
function installStub(): Fbq {
  if (window.fbq) return window.fbq;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else (n.queue as unknown[]).push(args);
  } as Fbq;
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  return n;
}

/** Load + init the Pixel (once). No-op unless configured and consented. */
export function loadPixel(): void {
  if (pixelStarted || !metaAllowed()) return;
  pixelStarted = true;
  try {
    const fbq = installStub();
    const s = document.createElement('script');
    s.async = true;
    s.src = META_SDK_URL;
    document.head.appendChild(s);
    // Limit what the Pixel collects on its own: no automatic button-click / form-field scraping.
    fbq('set', 'autoConfig', false, META_PIXEL_ID);
    fbq('init', META_PIXEL_ID);
  } catch {
    pixelStarted = false;
  }
}

export function metaPageView(): void {
  if (!metaAllowed() || !window.fbq) return;
  try {
    window.fbq('track', 'PageView');
  } catch {
    /* analytics must never break navigation */
  }
}

/* ───────────────────────── events ───────────────────────── */

function cookie(name: string): string | undefined {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

/** `_fbc` when the Pixel has set it, else rebuilt from an `fbclid` in the landing URL. */
function fbcValue(): string | undefined {
  const c = cookie('_fbc');
  if (c) return c;
  try {
    const id = new URLSearchParams(window.location.search).get('fbclid');
    return id ? `fb.1.${Date.now()}.${id}` : undefined;
  } catch {
    return undefined;
  }
}

export function newEventId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

async function relayToServer(eventName: string, eventId: string): Promise<void> {
  const base = apiBase();
  if (!base) return;
  // Lazy: session.ts imports the Upshot wrapper, which imports this file.
  const { getAccessToken } = await import('@/lib/session');
  const token = getAccessToken();
  await fetch(`${base}/api/meta/event`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      consent: true,
      eventName,
      eventId,
      eventSourceUrl: window.location.href.split('#')[0],
      fbp: cookie('_fbp'),
      fbc: fbcValue(),
    }),
  });
}

/** Report one of our funnel events to Meta, if it is one of the few that count. */
export function metaTrackFromWebEvent(name: string): void {
  const metaEvent = META_EVENT_FOR[name];
  if (!metaEvent || !metaAllowed()) return;
  if (ONCE_PER_SESSION.has(name)) {
    if (reported.has(name)) return;
    reported.add(name);
  }
  const eventId = newEventId();
  try {
    window.fbq?.('track', metaEvent, {}, { eventID: eventId });
  } catch {
    /* ignore */
  }
  relayToServer(metaEvent, eventId).catch(() => undefined);
}

/** Test seam: forget which once-per-session events were already reported. */
export function __resetMetaForTests(): void {
  reported.clear();
}
