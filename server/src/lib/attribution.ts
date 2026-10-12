import { createHmac, randomInt } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Install attribution — the pure parts (no DB). See referral.ts for the DB side.
 *
 * Privacy stance (App Store + Play policy): a click is kept only long enough for
 * the app's first launch to claim it, IP and user agent are stored as keyed
 * hashes (never raw), and nothing here builds a persistent device fingerprint.
 * An IP match is a short-window, single-use, single-candidate lookup — if it is
 * ambiguous we attribute nothing rather than guess.
 */

export type Platform = 'android' | 'ios' | 'web';
export type MatchMethod = 'play_referrer' | 'clipboard' | 'ip_window';

/** How long an unclaimed click stays matchable by tokens (Play referrer / clipboard). */
export const CLICK_TTL_HOURS = Number(process.env.ATTRIBUTION_CLICK_TTL_HOURS) || 48;
/** IP-only matching is the weakest signal, so its window is much shorter. */
export const IP_WINDOW_MINUTES = Number(process.env.ATTRIBUTION_WINDOW_MIN) || 30;

/** Prefix that marks a clipboard value as ours, so we never read arbitrary text into the DB. */
export const CLIPBOARD_PREFIX = 'swiftloan-ref:';

const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const pick = (n: number) => Array.from({ length: n }, () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]).join('');

export const newClickToken = () => pick(12);

/** Keyed hash so a leaked table cannot be reversed by brute-forcing the IPv4 space. */
export function hashClient(value: string): string {
  const key = process.env.ATTRIBUTION_SALT || env.jwtRefreshSecret;
  // An IPv4 client can show up as '::ffff:1.2.3.4' on one request and '1.2.3.4' on the next.
  const v = value.trim().toLowerCase().replace(/^::ffff:/, '');
  return createHmac('sha256', key).update(v).digest('hex').slice(0, 32);
}

export function detectPlatform(ua: string): Platform {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'web';
}

/** "17.5" from an iOS UA ("CPU iPhone OS 17_5 like Mac OS X"), "14" from Android. */
export function parseOsVersion(ua: string): string | null {
  const ios = ua.match(/OS (\d+)[_.](\d+)/);
  if (ios) return `${ios[1]}.${ios[2]}`;
  const and = ua.match(/Android (\d+)/i);
  return and ? and[1] : null;
}

/** The `referrer=` value the Play Install Referrer API hands back: "click_id=ABC&ref=XYZ". */
export function parsePlayReferrer(raw: string | null | undefined): { clickId: string | null; ref: string | null } {
  if (!raw) return { clickId: null, ref: null };
  const params = new URLSearchParams(raw);
  const clickId = params.get('click_id');
  return {
    clickId: clickId && /^[A-Z0-9]{8,16}$/i.test(clickId) ? clickId.toUpperCase() : null,
    ref: params.get('ref'),
  };
}

export function formatClipboard(token: string): string {
  return `${CLIPBOARD_PREFIX}${token}`;
}

/** Returns the click token if (and only if) the clipboard holds one of ours. */
export function parseClipboard(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^swiftloan-ref:([A-Z0-9]{8,16})$/i);
  return m ? m[1].toUpperCase() : null;
}

export interface IpCandidate {
  id: string;
  osVersion: string | null;
}

/**
 * Pick the single click an IP-window claim refers to.
 *
 * `candidates` are pending clicks for the same platform + IP hash inside the
 * window. One candidate -> match. Several (an office, a carrier NAT, a family on
 * one Wi-Fi) -> try to break the tie with the OS version the app reports; still
 * not exactly one -> null. Wrong credit is worse than no credit.
 */
export function pickIpMatch(candidates: IpCandidate[], osVersion?: string | null): IpCandidate | null {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0 || !osVersion) return null;
  const major = (v: string) => v.split('.')[0];
  const same = candidates.filter(
    (c) => c.osVersion && (c.osVersion === osVersion || major(c.osVersion) === major(osVersion)),
  );
  const exact = same.filter((c) => c.osVersion === osVersion);
  if (exact.length === 1) return exact[0];
  return same.length === 1 ? same[0] : null;
}

// ── Referral codes ──────────────────────────────────────────────────────────

/** 8 chars, unambiguous alphabet. Collisions are handled by the caller retrying. */
export const newReferralCode = () => pick(8);

export const normalizeCode = (raw: unknown): string | null => {
  const c = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{6,12}$/.test(c) ? c : null;
};

/** "Rahul Sharma" -> "Rahul S." — a referrer sees who joined, not their full identity. */
export function maskName(fullName: string | null | undefined, phone?: string | null): string {
  const n = (fullName ?? '').trim();
  if (n) {
    const [first, ...rest] = n.split(/\s+/);
    return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
  }
  return phone ? `•••• ${phone.slice(-4)}` : 'A friend';
}

// ── Store redirect ──────────────────────────────────────────────────────────

/**
 * Where /dl sends the visitor. On Google Play the click id rides in the
 * `referrer` parameter (read back deterministically by the Install Referrer API).
 * Any other Android URL (a sideloaded APK, for testing) and iOS (App Store /
 * TestFlight) get the plain URL — those installs are matched by clipboard / IP.
 */
export function storeUrl(base: string, click: { token: string; ref: string | null }): string {
  let host = '';
  try { host = new URL(base).hostname; } catch { return base; }
  if (host !== 'play.google.com') return base;
  const referrer = new URLSearchParams({ click_id: click.token, ...(click.ref ? { ref: click.ref } : {}) }).toString();
  const u = new URL(base);
  u.searchParams.set('referrer', referrer); // URLSearchParams encodes the nested value once
  return u.toString();
}
