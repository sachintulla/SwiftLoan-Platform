import { NativeModules, Platform } from 'react-native';

/**
 * What the OS can tell us about the link that led to this install, read once on
 * first launch:
 *  - Android: the Google Play Install Referrer string (only set when the install
 *    came through Play after a /dl link; null for sideloaded APKs).
 *  - iOS: the click token our /dl page copied to the clipboard (only a value with
 *    our own prefix is ever returned, and it is cleared after reading).
 * Both resolve null when there is nothing to report or the native module is absent
 * (Jest, a stale build) — the server then falls back to its IP-window match.
 */
export interface InstallSignals {
  installReferrer: string | null;
  clipboard: string | null;
  osVersion: string;
}

// iOS reports "17.5"; Android's Platform.Version is the API level, so use the release ("14").
const osVersion = () => String(Platform.OS === 'android' ? (Platform.constants as any)?.Release ?? '' : Platform.Version);

export async function readInstallSignals(): Promise<InstallSignals> {
  const out: InstallSignals = { installReferrer: null, clipboard: null, osVersion: osVersion() };
  try {
    if (Platform.OS === 'android') {
      out.installReferrer = (await NativeModules.InstallReferrer?.getInstallReferrer?.()) ?? null;
    } else if (Platform.OS === 'ios') {
      out.clipboard = (await NativeModules.Attribution?.readClipboardToken?.()) ?? null;
    }
  } catch {
    // Never let attribution break app start.
  }
  return out;
}

/**
 * What the server needs to count this install once per phone (server/src/lib/installDedup.ts): a device id that
 * survives a reinstall (Android ANDROID_ID / an iOS Keychain id; the server keeps only a hash), where the app was
 * installed from, and the app/phone details. Every field is null when the native module is absent (Jest, a stale
 * build); the server then counts the install the old way.
 */
export interface InstallInfo {
  deviceId: string | null;
  installer: string | null;
  debug: boolean;
  appVersion: string | null;
  buildNumber: string | null;
  model: string | null;
}

let installInfo: Promise<InstallInfo> | null = null;

/** Read once per process (it never changes while the app runs). */
export function readInstallInfo(): Promise<InstallInfo> {
  if (!installInfo) {
    installInfo = (async () => {
      const empty: InstallInfo = { deviceId: null, installer: null, debug: false, appVersion: null, buildNumber: null, model: null };
      try {
        const mod = Platform.OS === 'android' ? NativeModules.InstallReferrer : NativeModules.Attribution;
        const raw = await mod?.getInstallInfo?.();
        if (!raw) return empty;
        const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
        return {
          deviceId: str(raw.deviceId), installer: str(raw.installer), debug: raw.debug === true,
          appVersion: str(raw.appVersion), buildNumber: str(raw.buildNumber), model: str(raw.model),
        };
      } catch {
        return empty;
      }
    })();
  }
  return installInfo;
}
