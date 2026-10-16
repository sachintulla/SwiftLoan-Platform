/**
 * The last-known signed-in user, kept so the account sidebar can render on the very first paint of a page.
 *
 * Without it every page in the funnel starts with "no user yet" and ApplyShell shows the marketing brand
 * panel until /me answers, then swaps to the account sidebar — a visible flash on each navigation
 * (e.g. Retry on the offers page → the loading page). Two layers: a module variable (client-side
 * navigations, instant) and sessionStorage (hard reloads, restored before paint). It only ever holds the
 * non-sensitive rail fields (name, phone), is replaced by the next /me answer and is cleared on log out.
 */
import type { AccountRailUser } from '@/components/apply/AccountRail';

const KEY = 'sl_account_user';
let memory: AccountRailUser | null = null;

export function readCachedAccountUser(): AccountRailUser | null {
  if (memory) return memory;
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    if (!raw) return null;
    const u = JSON.parse(raw) as AccountRailUser;
    memory = u;
    return u;
  } catch {
    return null;
  }
}

export function cacheAccountUser(user: Record<string, unknown> | null | undefined): void {
  if (!user) return;
  const slim: AccountRailUser = {
    fullName: (user.fullName as string | null) ?? null,
    firstName: (user.firstName as string | null) ?? null,
    phone: (user.phone as string | null) ?? null,
  };
  memory = slim;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    /* storage blocked — the in-memory copy still covers client navigations */
  }
}

export function clearCachedAccountUser(): void {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
