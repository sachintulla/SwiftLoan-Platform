'use client';
import { useEffect, useState } from 'react';
import { getAdmin, getTotpEnabled, mustChangePassword } from './api';

export interface AdminInfo { name: string; email: string; role: string }

export interface AdminSession {
  admin: AdminInfo | null;
  /** The signed-in admin must rotate their password before doing anything else. */
  locked: boolean;
  /** TOTP is switched on for this admin. */
  totp: boolean;
  /** False until the effect has run — i.e. until localStorage has actually been read. */
  ready: boolean;
}

/**
 * The signed-in admin, resolved AFTER mount.
 *
 * `getAdmin()`, `mustChangePassword()` and `getTotpEnabled()` all read `localStorage`,
 * which does not exist during SSR. Calling them *during render* makes the server and the
 * first client render disagree, and React then throws a hydration error and re-renders the
 * subtree — or, worse, silently accepts a mismatch it happens to tolerate.
 *
 * That bug shipped three times in this codebase:
 *   • `Shell.tsx` — the super-admin-only Audit link was absent server-side and present
 *     client-side, which broke hydration on EVERY page in the dashboard.
 *   • `/account` — "Signed in as <email>" vs "" produced a text-content mismatch.
 *   • `/integrations` — `isSuper` gates whole panels. It did not error only because those
 *     panels sit in a data-dependent subtree that renders identically (loading) on both
 *     sides, and React tolerates a trailing added child. Latent, not safe.
 *
 * So this hook exists to make the safe thing the easy thing. Read session state from here,
 * never by calling the getters inline. Use `ready` when the difference between "no admin"
 * and "not looked yet" matters.
 *
 * @param refreshKey re-read when this changes — pass `pathname` in a persistent shell so a
 *   fresh sign-in is picked up on the next navigation.
 */
export function useAdminSession(refreshKey?: unknown): AdminSession {
  const [session, setSession] = useState<AdminSession>({
    admin: null, locked: false, totp: false, ready: false,
  });

  useEffect(() => {
    setSession({
      admin: getAdmin<AdminInfo>(),
      locked: mustChangePassword(),
      totp: getTotpEnabled(),
      ready: true,
    });
  }, [refreshKey]);

  return session;
}
