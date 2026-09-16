'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Upshot Web SDK loader for the marketing site.
 *
 * Loads the CDN bundle, initialises it once, and reports page views on route
 * changes. Once initialised, Upshot's own machinery drives in-app messages,
 * surveys, activities and mini-games — we only have to identify the visitor and
 * emit events; the campaigns are authored on the Upshot dashboard.
 *
 * Credential-gated in the same way as the Ello widget: with the env vars unset
 * this renders nothing and loads nothing, so a fresh clone is unaffected.
 * A console warning (dev-only, never a visible UI banner) explains why.
 */

const APP_ID = process.env.NEXT_PUBLIC_UPSHOT_APP_ID || '';
const OWNER_ID = process.env.NEXT_PUBLIC_UPSHOT_OWNER_ID || '';
/**
 * Data region. Empty (the default) means USA.
 *
 * Not in Upshot's written docs — found by reading the CDN bundle, which does
 * `setLocalStorage("upshotDataRegion", dataRegion + ".")` and prefixes it onto
 * the API host. Without it the SDK ships this site's data to the US region,
 * which for an Indian lending product is a data-residency problem, not a
 * latency one.
 */
const DATA_REGION = process.env.NEXT_PUBLIC_UPSHOT_DATA_REGION || '';
const SDK_URL =
  process.env.NEXT_PUBLIC_UPSHOT_SDK_URL || 'https://cdn.goupshot.com/UpshotWebSDK/v1.4/upshot.min.js';

declare global {
  interface Window {
    upshot?: {
      init: (params: Record<string, unknown>, cb?: () => void) => void;
      createPageViewEvent?: (screen: string) => void;
      createCustomEvent?: (name: string, payload?: unknown, timed?: boolean) => void;
      setUserProfile?: (profile: Record<string, unknown>) => void;
      userLogout?: () => void;
    };
    __upshotReady?: boolean;
  }
}

/** True once init() has completed — guards every call below. */
function ready(): boolean {
  return typeof window !== 'undefined' && !!window.__upshotReady && !!window.upshot;
}

/** Page view. Safe before init (no-ops). */
export function upshotPageView(screen: string): void {
  if (!ready()) return;
  try {
    window.upshot?.createPageViewEvent?.(screen);
  } catch {
    /* analytics must never break navigation */
  }
}

/** Custom event — used for the lead form, EMI calculator, CTA clicks. */
export function upshotEvent(name: string, attrs: Record<string, unknown> = {}): void {
  if (!ready()) return;
  try {
    window.upshot?.createCustomEvent?.(name, attrs, false);
  } catch {
    /* swallowed on purpose */
  }
}

/**
 * Identify a visitor once they give us a phone number on the lead form.
 *
 * Phone is normalised to E.164 to match what the server sends to Upshot's
 * /userprofile/add and what the mobile SDK sends — if the three disagree,
 * Upshot ends up with several profiles for one person.
 */
export function upshotIdentify(user: {
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  city?: string | null;
}): void {
  if (!ready()) return;
  const digits = (user.phone || '').replace(/\D/g, '');
  const phone = digits ? (user.phone!.startsWith('+') ? user.phone! : `+91${digits.slice(-10)}`) : undefined;
  try {
    window.upshot?.setUserProfile?.({
      appuid: phone || undefined,
      Name: user.name || undefined,
      Email: user.email || undefined,
      Phone: phone,
      City: user.city || undefined,
      Country: 'India',
      Platform: 'Web',
    });
  } catch {
    /* swallowed on purpose */
  }
}

export default function UpshotWeb() {
  const pathname = usePathname();

  // ── load + init once ──
  useEffect(() => {
    if (!APP_ID || !OWNER_ID) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[UpshotWeb] NEXT_PUBLIC_UPSHOT_APP_ID / NEXT_PUBLIC_UPSHOT_OWNER_ID not set — Upshot disabled.',
        );
      }
      return;
    }
    if (window.__upshotReady) return;

    // Reuse an already-injected tag if a re-mount races us (React strict mode).
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement('script');

    const onLoad = () => {
      try {
        window.upshot?.init(
          {
            UpshotApplicationID: APP_ID,
            UpshotApplicationOwnerID: OWNER_ID,
            ...(DATA_REGION ? { dataRegion: DATA_REGION } : {}),
            // Location is an extra browser permission prompt a loan marketing
            // site has no reason to trigger.
            UpshotFetchLocation: false,
            upshotHybridApp: false,
            DispatchTimeInterval: 10000,
            appVersion: '1.0',
            buildVersion: '1',
            deeplinkRedirection: false,
            // Push is opt-in and needs a service worker + VAPID setup; enabling
            // it here would fire a permission prompt on first page load.
            subscribePush: false,
            retainSession: false,
          },
          () => {
            window.__upshotReady = true;
            upshotPageView(window.location.pathname);
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
      script.src = SDK_URL;
      script.async = true;
      script.addEventListener('load', onLoad);
      script.addEventListener('error', () =>
        console.warn('[UpshotWeb] could not load the SDK from', SDK_URL),
      );
      if (!existing) document.head.appendChild(script);
    }
  }, []);

  // ── page view on client-side route changes ──
  useEffect(() => {
    if (pathname) upshotPageView(pathname);
  }, [pathname]);

  return null;
}
