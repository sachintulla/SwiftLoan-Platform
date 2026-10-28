'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  UPSHOT_APP_ID,
  UPSHOT_OWNER_ID,
  UPSHOT_DISABLED,
  UPSHOT_SDK_URL,
  UPSHOT_DATA_REGION,
} from '@/config/upshot';
import { markUpshotReady, upshotEvent, upshotPageView, upshotRouteFunnel } from '@/lib/upshot';

/**
 * Upshot Web SDK loader for the whole website (marketing pages, /apply/* and
 * /account/*). Mounted once in the root layout.
 *
 * Loads the CDN bundle, initialises it once, and reports a page view on every
 * client-side route change. All the event/identity logic lives in `@/lib/upshot`
 * (verified against the SDK's real API) — this component only owns loading and
 * the things that are driven by navigation: page views, the visit event with
 * campaign attribution, and the funnel moments tied to a route.
 *
 * Everything is fire-and-forget; a blocked CDN or an SDK error leaves the site
 * exactly as it was. In-app messages, surveys and mini-games need no code here —
 * once initialised Upshot renders them itself from the dashboard.
 */

// Existing call sites import these from here; the implementation moved to lib/upshot.
export { upshotEvent, upshotIdentify, upshotPageView } from '@/lib/upshot';

/** Module-level, not per-effect: React strict mode (dev) runs the mount effect twice and each run would init the SDK. */
let initStarted = false;

const VISIT_FLAG = 'sl_upshot_visit';
const SUBMITTED_FLAG = 'sl_upshot_submitted';
const APPLY_STATE_KEY = 'sl_apply_state'; // see lib/applyContext.tsx

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* private mode — worst case an event repeats once */
  }
}

/** The offer + application the visitor is on, as the apply flow stored it. */
function storedApply(): { applicationId?: string; selectedOffer?: { id?: string; amount?: number } } {
  try {
    return JSON.parse(readSession(APPLY_STATE_KEY) || '{}');
  } catch {
    return {};
  }
}

/** One `website_visit` per browser session, carrying where the visitor came from. */
function reportVisit(pathname: string): void {
  if (readSession(VISIT_FLAG)) return;
  writeSession(VISIT_FLAG, '1');

  const q = new URLSearchParams(window.location.search);
  let referrer = '';
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    // A visit from our own pages is navigation, not a referral.
    referrer = r && r.host !== window.location.host ? r.host : '';
  } catch {
    referrer = '';
  }
  const utm = {
    utmSource: q.get('utm_source') || undefined,
    utmMedium: q.get('utm_medium') || undefined,
    utmCampaign: q.get('utm_campaign') || undefined,
  };
  upshotEvent('website_visit', { page: pathname, referrer: referrer || undefined, ...utm });

  // Upshot's own attribution event needs all three UTM keys or it rejects the call.
  if (utm.utmSource && utm.utmMedium && utm.utmCampaign) {
    try {
      window.upshot?.createAttributionEvent?.({
        attributionSource: utm.utmSource,
        utm_source: utm.utmSource,
        utm_medium: utm.utmMedium,
        utm_campaign: utm.utmCampaign,
      });
    } catch {
      /* analytics must never break navigation */
    }
  }
}

export default function UpshotWeb() {
  const pathname = usePathname();
  const lastReported = useRef<string | null>(null);

  // ── load + init once ──
  useEffect(() => {
    if (UPSHOT_DISABLED) return;
    if (!UPSHOT_APP_ID || !UPSHOT_OWNER_ID) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[UpshotWeb] Upshot app / owner id missing — Upshot disabled.');
      }
      return;
    }
    if (window.__upshotReady) return;

    // Reuse an already-injected tag if a re-mount races us (React strict mode).
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${UPSHOT_SDK_URL}"]`);
    const script = existing ?? document.createElement('script');

    const onLoad = () => {
      if (initStarted) return;
      initStarted = true;
      try {
        window.upshot?.init(
          {
            UpshotApplicationID: UPSHOT_APP_ID,
            UpshotApplicationOwnerID: UPSHOT_OWNER_ID,
            ...(UPSHOT_DATA_REGION ? { dataRegion: UPSHOT_DATA_REGION } : {}),
            // Location is an extra browser permission prompt a loan site has no
            // reason to trigger.
            UpshotFetchLocation: false,
            upshotHybridApp: false,
            // Short while testing so events reach the dashboard quickly; the SDK
            // clamps this to its own min/max.
            DispatchTimeInterval: process.env.NODE_ENV === 'development' ? 10000 : 30000,
            appVersion: '1.0',
            buildVersion: '1',
            deeplinkRedirection: false,
            // Stays false on purpose: true makes the SDK prompt on first page load. Web push is
            // requested at the OTP steps instead (lib/webPush.ts -> upshot.subscribePush()).
            subscribePush: false,
            retainSession: false,
          },
          () => {
            markUpshotReady();
            if (process.env.NODE_ENV === 'development') console.log('[UpshotWeb] initialised');
          },
        );
      } catch (e) {
        console.warn('[UpshotWeb] init failed', e);
      }
    };

    if (existing && window.upshot) {
      onLoad();
    } else {
      script.src = UPSHOT_SDK_URL;
      script.async = true;
      script.addEventListener('load', onLoad);
      script.addEventListener('error', () =>
        console.warn('[UpshotWeb] could not load the SDK from', UPSHOT_SDK_URL),
      );
      if (!existing) document.head.appendChild(script);
    }
  }, []);

  // ── page view + route-driven funnel moments on every client-side navigation ──
  useEffect(() => {
    if (UPSHOT_DISABLED || !pathname) return;
    // Strict mode re-runs effects on mount; a ref survives that, so one view per navigation.
    if (lastReported.current === pathname) return;
    lastReported.current = pathname;
    upshotPageView(pathname);
    reportVisit(pathname);

    const stored = storedApply();
    if (pathname === '/apply/success') {
      // Once per application: a reload or back/forward must not count it twice.
      const key = stored.applicationId || 'unknown';
      if (readSession(SUBMITTED_FLAG) === key) return;
      writeSession(SUBMITTED_FLAG, key);
    }
    upshotRouteFunnel(pathname, stored.selectedOffer);
  }, [pathname]);

  return null;
}
