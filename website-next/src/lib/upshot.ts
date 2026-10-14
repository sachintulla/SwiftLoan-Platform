/**
 * Upshot Web SDK wrapper for the website — the counterpart of the mobile app's
 * `src/analytics/upshot.ts`, and kept in step with it (same event names, same
 * attribute names/types, same screen labels where a screen exists on both).
 *
 * Every method name below was verified against the v1.4 bundle's real
 * `window.upshot` keys, not the docs: there is NO `createCustomEvent`,
 * `createPageViewEvent`, `setUserProfile` or `userLogout` on the web SDK. The
 * calls are `createEventByName(name, payload, timed)` (the name `"pageView"` is
 * the page-view event), `updateUserProfile(profile, cb)` and `disableUser()`.
 * Calling a method that does not exist through `?.` fails silently — which is
 * how this site once shipped an integration that sent nothing.
 *
 * Contract (same as mobile): fire-and-forget. Nothing here throws, blocks the UI
 * or changes what a page renders. Calls made before the SDK finishes loading are
 * queued (bounded) and flushed once it is ready, so the first page view and an
 * early lead event are not lost.
 *
 * `disableUser()` is deliberately NOT used for logout: on the web it deletes the
 * user's data and disables Upshot for them (a privacy opt-out, per the GDPR docs).
 * Logout is `updateUserProfile({ appuid: '' })` — see `upshotLogout`.
 */

declare global {
  interface Window {
    upshot?: UpshotWebSdk;
    __upshotReady?: boolean;
  }
}

export interface UpshotWebSdk {
  init: (params: Record<string, unknown>, cb?: () => void) => void;
  createEvent?: (type: string, pageName?: string) => unknown;
  createEventByName?: (name: string, payload?: Record<string, unknown>, timed?: boolean) => unknown;
  updateUserProfile?: (profile: Record<string, unknown>, cb?: (res?: unknown) => void) => unknown;
  createAttributionEvent?: (data: Record<string, string>) => unknown;
  getUserId?: () => string | null;
}

/** Cap on calls held back while the SDK loads, so a blocked CDN cannot grow memory. */
const MAX_QUEUE = 50;

let ready = false;
const queue: Array<() => void> = [];

function sdk(): UpshotWebSdk | null {
  return typeof window === 'undefined' ? null : (window.upshot ?? null);
}

/** Debug-only breadcrumb, greppable in the browser console. Silent in production. */
function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') console.log('[upshot]', ...args);
}

function guarded(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.warn('[upshot]', e);
  }
}

/** Run now if the SDK is up; otherwise hold (bounded) until `markUpshotReady`. */
function run(fn: () => void): void {
  if (ready) {
    guarded(fn);
    return;
  }
  if (queue.length < MAX_QUEUE) queue.push(fn);
}

/** Called by the loader once `upshot.init` has completed. Flushes anything queued. */
export function markUpshotReady(): void {
  if (ready) return;
  ready = true;
  if (typeof window !== 'undefined') window.__upshotReady = true;
  devLog('ready; flushing', queue.length, 'queued call(s)');
  for (const fn of queue.splice(0)) guarded(fn);
}

export function isUpshotReady(): boolean {
  return ready;
}

/** Test seam: forget readiness and anything queued. */
export function __resetUpshotForTests(): void {
  ready = false;
  queue.length = 0;
  offers.clear();
  offerViewPending = false;
  lastIdentified = '';
}

/* ─────────────────────────── screens ─────────────────────────── */

/**
 * Readable names for the routes. Upshot (Live Events, screen-targeted campaigns)
 * sees these labels. The application funnel steps carry the SAME names as the
 * mobile app's screens (`UPSHOT_SCREEN_LABELS` in src/analytics/upshot.ts) so a
 * campaign written against "PAN Verification Step 1" means the same moment on
 * both. Routes not listed are reported under their path.
 */
export const UPSHOT_SCREEN_LABELS: Record<string, string> = {
  '/': 'Website Home',
  '/apply': 'Get Started',
  '/apply/verify': 'Verify OTP',
  '/apply/step-1': 'PAN Verification Step 1',
  '/apply/step-2': 'Basic Details Step 2',
  '/apply/step-3': 'More Details Step 3',
  '/apply/finding': 'Finding Loader',
  '/apply/offers': 'My Offers',
  '/apply/compare': 'Compare Offers',
  '/apply/lender': 'Lender Application',
  '/apply/confirm': 'Confirm Application',
  '/apply/success': 'Application Submitted',
  '/account': 'My Loans',
  '/account/profile': 'Profile',
  '/account/support': 'Support',
  '/account/partners': 'Partner Lenders',
  '/account/privacy': 'Privacy',
  '/account/faqs': 'FAQs',
  '/faqs': 'FAQs',
  '/privacy-policy': 'Privacy Policy',
  '/privacypolicy': 'Privacy Policy',
  '/compliance': 'Compliance',
  '/partner/return': 'Partner Return',
};

/** Route -> label. `/account/<id>` is the loan detail page; everything else falls back to the path. */
export function upshotScreenLabel(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const known = UPSHOT_SCREEN_LABELS[path];
  if (known) return known;
  if (/^\/account\/[^/]+$/.test(path)) return 'Loan Details';
  return path || '/';
}

/** Routes that are never reported (no information, or not part of the product). */
const SKIPPED_ROUTES = [/^\/dev(\/|$)/, /^\/brand(\/|$)/, /^\/logo(\/|$)/];

export function upshotPageView(pathname: string): void {
  if (SKIPPED_ROUTES.some((re) => re.test(pathname))) return;
  const label = upshotScreenLabel(pathname);
  devLog('screen ->', label);
  // Exactly as documented: createEvent('UpshotEventPageView', pageName). The SDK times the
  // view and sends the previous one when the next is created.
  run(() => {
    sdk()?.createEvent?.('UpshotEventPageView', label);
  });
}

/* ─────────────────────────── events ─────────────────────────── */

/**
 * Event NAMES and attribute KEYS: the SDK keeps letters, digits and underscores and
 * silently strips everything else, so "PAN Verified" is stored as "PANVerified". Names
 * here are written the way Upshot will store them (the app's two legacy spaced names
 * become PAN_Verified / Offers_Got on web) so what we send is what the dashboard shows.
 */

/** Attributes on every web event, so a campaign can segment web vs app consistently. */
const COMMON = { platform: 'Web' } as const;

export function upshotEvent(name: string, attrs: Record<string, unknown> = {}): void {
  // Drop undefined values: the SDK would turn them into nulls and Upshot would
  // then infer the attribute's type from a null.
  const clean: Record<string, unknown> = { ...COMMON };
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) clean[k] = v;
  devLog('event ->', name, clean);
  run(() => {
    sdk()?.createEventByName?.(name, clean, false);
  });
}

/* ───────────────────────── identity ───────────────────────── */

/** E.164 for an Indian number, or undefined. The SDK rejects anything but `+<digits>`. */
export function toE164(phone?: string | null): string | undefined {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return undefined;
  if (phone!.trim().startsWith('+')) return `+${digits}`;
  return digits.length >= 10 ? `+91${digits.slice(-10)}` : undefined;
}

export interface UpshotUser {
  /** The server's User id — the same `appuid` the mobile app and the server use. */
  userId?: string | null;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  city?: string | null;
}

/**
 * The profile object handed to `updateUserProfile`.
 *
 * The SDK maps profile fields by EXACT key and silently stores anything else as
 * a custom attribute: `appuid` (lower-case on web), `firstName`, `lastName`,
 * `userName`, `email`, `phone` (must be `+digits`), and `location: { city, country }`. The old `Name` / `Email` / `Phone` / `City` keys left the name and
 * contact fields blank on the dashboard. `Platform` is a custom attribute.
 *
 * Identity: once logged in the key is the server's user id, identical to the
 * mobile app, so one person is one profile across web and app. A visitor who has
 * only given a phone number (the marketing lead form) is keyed by that E.164
 * number until they log in.
 */
export function buildUpshotProfile(user: UpshotUser): Record<string, unknown> {
  const phone = toE164(user.phone);
  const fullName = (user.name || '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const profile: Record<string, unknown> = {
    appuid: user.userId ? String(user.userId) : phone,
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
    userName: fullName || undefined,
    email: user.email || undefined,
    phone,
    // Documented shape: city/country live inside `location`.
    location: { country: 'India', ...(user.city ? { city: user.city } : {}) },
    Platform: 'Web',
  };
  for (const k of Object.keys(profile)) if (profile[k] === undefined) delete profile[k];
  return profile;
}

/** What was last sent, so the many pages that re-fetch the user don't re-send an unchanged profile. */
let lastIdentified = '';

/** Identify (or enrich) the visitor. Safe to call repeatedly with partial data. */
export function upshotIdentify(user: UpshotUser): void {
  const profile = buildUpshotProfile(user);
  if (!profile.appuid) return; // nothing to key the profile on
  const signature = JSON.stringify(profile);
  if (signature === lastIdentified) return;
  lastIdentified = signature;
  devLog('identify ->', { ...profile, phone: profile.phone ? '+**masked**' : undefined, email: undefined });
  run(() => {
    sdk()?.updateUserProfile?.(profile, () => {});
  });
}

/**
 * Sign-out, per the docs: set `appuid` to an empty string, so later events on this
 * browser are no longer attributed to the user who just left. (NOT `disableUser()`:
 * that is a permanent privacy opt-out of the profile.) Verified on the wire — Upshot
 * accepts it and clears the user's external id.
 */
export function upshotLogout(): void {
  lastIdentified = ''; // the same person logging straight back in must be re-identified
  devLog('logout');
  run(() => {
    sdk()?.updateUserProfile?.({ appuid: '' }, () => {});
  });
}

/**
 * Identify from the server's user record (`/api/website/auth/*`, `/api/users/me`).
 * Only id, phone, name and email are shared — the same four the mobile app sends;
 * PAN, DOB, address and city are deliberately not (the privacy policy does not
 * cover them going to Upshot).
 */
export function upshotIdentifyServerUser(u: unknown): void {
  const r = (u ?? {}) as { id?: unknown; phone?: string | null; fullName?: string | null; email?: string | null };
  if (!r.id) return;
  upshotIdentify({ userId: String(r.id), phone: r.phone, name: r.fullName, email: r.email });
}

/* ──────────────── funnel memory: offers the visitor was shown ────────────────
 * Mirrors `knownOffers` in the mobile client: `offer_viewed` / `offer_selected` /
 * `application_submitted` carry real values (rupees, APR, lender) without any page
 * having to pass them in. Replaced wholesale whenever a full offers list arrives. */

export interface UpshotOffer {
  id: string;
  amount?: number;
  apr?: number;
  tenureMonths?: number;
  lenderName?: string | null;
  partner?: { name: string } | null;
  offerType?: string | null;
  offerLikelihood?: string | null;
}

const offers = new Map<string, UpshotOffer>();
let offerViewPending = false;

function partnerOf(o: UpshotOffer): string | undefined {
  return o.lenderName ?? o.partner?.name ?? undefined;
}

function fireOfferViewed(): void {
  const aprs = [...offers.values()].map((o) => o.apr).filter((n): n is number => typeof n === 'number' && n > 0);
  upshotEvent('offer_viewed', { offerCount: offers.size, ...(aprs.length ? { bestApr: Math.min(...aprs) } : {}) });
}

/** The visitor opened an offers page: report it now, or as soon as offers load. */
export function upshotOfferViewed(): void {
  if (offers.size > 0) fireOfferViewed();
  else offerViewPending = true;
}

export function rememberOffers(list: unknown): void {
  if (!Array.isArray(list)) return;
  offers.clear();
  for (const o of list as UpshotOffer[]) if (o?.id) offers.set(o.id, o);
  if (offerViewPending && offers.size > 0) {
    offerViewPending = false;
    fireOfferViewed();
  }
}

/** Amount (rupees) + lender of an offer the visitor has seen, for funnel events. */
export function knownOfferInfo(id: string | null | undefined): { amount?: number; partner?: string } {
  const o = id ? offers.get(id) : undefined;
  return o ? { amount: o.amount, partner: partnerOf(o) } : {};
}

/** Funnel events that come from API results. PAN/DOB/address/bureau data is never sent. */
export function upshotPanVerified(result: { verified?: boolean; source?: string; aadhaarLinked?: boolean | null }): void {
  if (!result?.verified) return;
  upshotEvent('PAN_Verified', {
    source: result.source,
    ...(typeof result.aadhaarLinked === 'boolean' ? { aadhaarLinked: result.aadhaarLinked } : {}),
  });
}

export function upshotOffersFetched(list: unknown): void {
  rememberOffers(list);
  const got = (Array.isArray(list) ? list : []) as UpshotOffer[];
  upshotEvent('eligibility_completed', { offerCount: got.length });
  if (got.length === 0) return;
  const aprs = got.map((o) => o?.apr).filter((n): n is number => typeof n === 'number' && n > 0);
  const amounts = got.map((o) => o?.amount).filter((n): n is number => typeof n === 'number' && n > 0);
  const lenders = [...new Set(got.map(partnerOf).filter((n): n is string => !!n))];
  const best = aprs.length ? got.find((o) => o?.apr === Math.min(...aprs)) : undefined;
  const topLender = best ? partnerOf(best) : undefined;
  upshotEvent('Offers_Got', {
    offerCount: got.length,
    ...(aprs.length ? { bestApr: Math.min(...aprs) } : {}),
    ...(amounts.length ? { maxAmount: Math.max(...amounts) } : {}),
    ...(lenders.length ? { lenders: lenders.slice(0, 8).join(', ') } : {}),
    ...(topLender ? { topLender } : {}),
  });
}

export function upshotOfferSelected(offerId: string, tenureMonths?: number): void {
  const o = offers.get(offerId);
  if (!o) return;
  const partner = partnerOf(o);
  upshotEvent('offer_selected', {
    apr: o.apr,
    amount: o.amount,
    ...(typeof (tenureMonths ?? o.tenureMonths) === 'number' ? { tenureMonths: tenureMonths ?? o.tenureMonths } : {}),
    ...(partner ? { partner } : {}),
    ...(o.offerType ? { offerType: o.offerType } : {}),
    ...(o.offerLikelihood ? { offerLikelihood: o.offerLikelihood } : {}),
  });
}

/**
 * Route-driven funnel moments, the web equivalent of the mobile store's
 * "screen === 'offers'" checks. Called on every client-side navigation.
 */
export function upshotRouteFunnel(pathname: string, selected?: { id?: string | null; amount?: number | null }): void {
  if (pathname === '/apply/offers' || pathname === '/apply/compare') upshotOfferViewed();
  if (pathname === '/apply/success') {
    // The stored selection survives a reload; the in-memory offers do not.
    const amount = typeof selected?.amount === 'number' ? selected.amount : knownOfferInfo(selected?.id).amount;
    upshotEvent('application_submitted', { ...(typeof amount === 'number' ? { amount } : {}), product: 'Personal Loan' });
  }
}
