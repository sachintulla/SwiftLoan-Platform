// Build-time configuration. Two APK variants are produced from this one file:
//   • generic build:  CONTEXT_ENABLED = false  (neutral onboarding, ignores links)
//   • context build:  CONTEXT_ENABLED = true   (resumes the website/call journey)
// The build script flips CONTEXT_ENABLED before each gradle build.
//
// The app talks to the DEPLOYED backend so the installed APK works on a real
// phone (localhost is unreachable there). Tracking already uses the same host.

/**
 * Local-development override. Set back to '' for any real build.
 *
 * Currently pointed at the laptop's local server/ backend over the USB bridge,
 * so journey events land in the LOCAL admin dashboard instead of the deployed
 * one. `localhost` works on the device only because of:
 *
 *     adb reverse tcp:4000 tcp:4000     # API
 *     adb reverse tcp:8081 tcp:8081     # Metro
 *
 * Re-run those after replugging the phone or restarting adb — the tunnels do
 * not survive either. A LAN IP would avoid the cable, but only if the phone and
 * laptop share a subnet; here they do not (phone 192.168.0.x, laptop Wi-Fi
 * 172.18.6.x), so the USB bridge is the reliable route.
 */
const DEV_API_BASE = 'http://localhost:4000/api';

export const BUILD = {
  // Flipped between builds (generic -> false, context -> true).
  CONTEXT_ENABLED: true,
  VARIANT: 'context' as 'context' | 'generic',
  APP_LABEL: 'SwiftLoan',
  // Deployed API (all app API calls + context resolve go here).
  API_BASE: DEV_API_BASE || 'https://swiftloan-api.onrender.com/api',
};

// Point the api-client + tracking at the same backend.
//
// TRACK_BASE has to be set explicitly: the tracking client defaults to the
// deployed host independently of API_BASE, so without this a local build would
// send its API calls to the laptop but its journey events to production.
;(globalThis as unknown as { SWIFTLOAN_API_BASE?: string; SWIFTLOAN_TRACK_BASE?: string })
  .SWIFTLOAN_API_BASE = BUILD.API_BASE;
;(globalThis as unknown as { SWIFTLOAN_API_BASE?: string; SWIFTLOAN_TRACK_BASE?: string })
  .SWIFTLOAN_TRACK_BASE = BUILD.API_BASE;
