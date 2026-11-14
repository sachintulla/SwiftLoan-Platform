/**
 * Install counting rules: one AppDownload row per DEVICE, so the admin install count is unique devices.
 *
 * - Opened 100 times: the app reports only once per install (AsyncStorage flag), so nothing to do here.
 * - The same report sent twice (the reply was lost and the app retried): same `installId` → the existing row.
 * - Uninstall + reinstall on the same phone: new `installId` but the same device key → the existing row,
 *   `reinstallCount + 1`. It is a reinstall, not a new install.
 * - A different phone, or a factory reset: a new device key → a new install (correct).
 *
 * The device key is ANDROID_ID (per phone + per app signing key; survives reinstall) or, on iOS, a random id the
 * app keeps in the Keychain (survives deleting the app). The server stores only a keyed hash of it.
 * Pure, so it is unit-tested without a database.
 */
import { hashClient } from './attribution.js';

export const INSTALL_SOURCES = ['play_store', 'app_store', 'testflight', 'sideload', 'development', 'unknown'] as const;
export type InstallSource = (typeof INSTALL_SOURCES)[number];

/** Installs that come from a public store. Test builds (TestFlight, sideloaded APKs, dev builds) are not users. */
export const STORE_SOURCES: readonly InstallSource[] = ['play_store', 'app_store'];
export const TEST_SOURCES: readonly InstallSource[] = ['testflight', 'sideload', 'development'];

/**
 * Where the app was installed from, from what the phone reports:
 *  - Android: the installer package (`com.android.vending` = Google Play; anything else, or none, = sideloaded APK).
 *  - iOS: 'app_store' | 'testflight' as the app read it from its receipt.
 *  - `debug` (a development build) always wins.
 */
export function classifyInstallSource(platform: string, installer: string | null | undefined, debug?: boolean | null): InstallSource {
  if (debug) return 'development';
  const v = (installer ?? '').trim().toLowerCase();
  if (platform === 'android') {
    if (!v) return 'sideload';
    return v === 'com.android.vending' ? 'play_store' : 'sideload';
  }
  if (platform === 'ios') {
    if (v === 'app_store') return 'app_store';
    if (v === 'testflight') return 'testflight';
    return 'unknown';
  }
  return 'unknown';
}

/** The stored form of a device id: a keyed hash, scoped to the platform. Null when the app sent nothing usable. */
export function deviceKeyFor(platform: string, rawDeviceId: string | null | undefined): string | null {
  const v = (rawDeviceId ?? '').trim();
  // Android's well-known bogus ANDROID_ID on some old emulators/ROMs: treat as "no id", never merge phones on it.
  if (v.length < 6 || v === '9774d56d682e549c') return null;
  return hashClient(`device:${platform}:${v}`);
}

/** A random install id from the app: printable, bounded. Anything else is ignored (old app → no dedup by id). */
export function cleanInstallId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Za-z0-9-]{16,64}$/.test(s) ? s : null;
}

export type ClaimKind = 'retry' | 'reinstall' | 'new';

/**
 * What a first-launch report is, given what the server already has:
 *  - a row already carries this install id (first or latest install) → 'retry' (count nothing)
 *  - a row already has this device → 'reinstall'
 *  - otherwise → 'new'
 */
export function classifyClaim(input: {
  installId: string | null;
  byInstallId: { id: string } | null;
  byDevice: { id: string; installId: string | null; lastInstallId: string | null } | null;
}): ClaimKind {
  if (input.installId && input.byInstallId) return 'retry';
  if (input.byDevice) {
    if (input.installId && (input.byDevice.installId === input.installId || input.byDevice.lastInstallId === input.installId)) return 'retry';
    return 'reinstall';
  }
  return 'new';
}

const clip = (v: unknown, n: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

/** The app/device details stored with an install, bounded. */
export function installDetails(input: { appVersion?: unknown; buildNumber?: unknown; deviceModel?: unknown; osVersion?: unknown }) {
  const version = clip(input.appVersion, 24);
  const build = clip(input.buildNumber, 12);
  return {
    appVersion: version ? (build ? `${version} (${build})` : version) : null,
    deviceModel: clip(input.deviceModel, 64),
    osVersion: clip(input.osVersion, 32),
  };
}
