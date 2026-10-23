'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { pingActivity } from '@/lib/activityPing';
import { subscribeSession } from '@/lib/session';

/**
 * Renders nothing. Mounted once in the /apply and /account layouts so the server knows when a signed-in
 * visitor is active (see lib/activityPing.ts). No page text or behaviour changes.
 */
export default function ActivityPing() {
  const pathname = usePathname();

  // Route change (and first load): the visitor just did something.
  useEffect(() => {
    pingActivity(true);
  }, [pathname]);

  useEffect(() => {
    const onInteract = () => pingActivity(false);
    const onLeave = () => pingActivity(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pingActivity(true);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onInteract, { passive: true }));
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    // The session token arrives a moment after load (cookie → access token): ping once it does.
    const unsubscribe = subscribeSession(() => pingActivity(false));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onInteract));
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    };
  }, []);

  return null;
}
