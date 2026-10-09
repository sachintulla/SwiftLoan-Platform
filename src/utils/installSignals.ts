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
