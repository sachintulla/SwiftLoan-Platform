'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { META_ENABLED } from '@/config/meta';
import { useCopy } from '@/lib/i18n';
import { metaConsentCopy } from '@/i18n/meta-consent';
import {
  getMetaConsent,
  loadPixel,
  metaPageView,
  setMetaConsent,
  subscribeMetaConsent,
  type MetaConsent,
} from '@/lib/meta';

/**
 * Meta Pixel loader + consent banner. Mounted once in the root layout next to UpshotWeb.
 *
 * Renders nothing and loads nothing unless NEXT_PUBLIC_META_PIXEL_ID is configured. Once
 * it is, the Pixel script is only fetched AFTER the visitor accepts; until they answer, a
 * small banner asks (and is remembered either way). All event logic lives in `@/lib/meta`.
 */

const SKIPPED_ROUTES = [/^\/dev(\/|$)/, /^\/brand(\/|$)/, /^\/logo(\/|$)/];

type ConsentState = NonNullable<MetaConsent> | 'none' | 'unknown';

function useConsent(): ConsentState {
  // Server render and first client render agree ('unknown'); the real value is read after hydration.
  return useSyncExternalStore<ConsentState>(
    subscribeMetaConsent,
    () => getMetaConsent() ?? 'none',
    () => 'unknown',
  );
}

export default function MetaPixel() {
  const pathname = usePathname();
  const consent = useConsent();
  const t = useCopy(metaConsentCopy);
  const [dismissed, setDismissed] = useState(false);

  // Returning visitor who already said yes: load the Pixel straight away.
  useEffect(() => {
    if (META_ENABLED && consent === 'granted') loadPixel();
  }, [consent]);

  // One PageView per route (client-side navigations included).
  useEffect(() => {
    if (!META_ENABLED || consent !== 'granted') return;
    if (SKIPPED_ROUTES.some((re) => re.test(pathname))) return;
    metaPageView();
  }, [pathname, consent]);

  if (!META_ENABLED || dismissed) return null;
  // 'none' = not answered yet; hide while hydrating ('unknown') and once answered.
  if (consent !== 'none') return null;
  if (SKIPPED_ROUTES.some((re) => re.test(pathname))) return null;

  const answer = (v: 'granted' | 'denied') => {
    setMetaConsent(v);
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-label={t.label}
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 2147483000,
        margin: '0 auto',
        maxWidth: 560,
        padding: '14px 16px',
        borderRadius: 14,
        background: '#0A3F41',
        color: '#fff',
        boxShadow: '0 8px 30px rgba(0,0,0,.25)',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.title}</div>
      <div style={{ opacity: 0.9 }}>
        {t.body}{' '}
        <Link href="/privacy-policy" style={{ color: '#7FE0D0', textDecoration: 'underline' }}>
          {t.more}
        </Link>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => answer('denied')}
          style={{
            padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.35)',
            background: 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t.decline}
        </button>
        <button
          type="button"
          onClick={() => answer('granted')}
          style={{
            padding: '8px 14px', borderRadius: 10, border: 0,
            background: '#2FB183', color: '#fff', fontWeight: 700, cursor: 'pointer',
          }}
        >
          {t.accept}
        </button>
      </div>
    </div>
  );
}
