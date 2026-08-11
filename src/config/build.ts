// Build-time configuration. Two APK variants are produced from this one file:
//   • generic build:  CONTEXT_ENABLED = false  (neutral onboarding, ignores links)
//   • context build:  CONTEXT_ENABLED = true   (resumes the website/call journey)
// The build script flips CONTEXT_ENABLED before each gradle build.
//
// The app talks to the DEPLOYED backend so the installed APK works on a real
// phone (localhost is unreachable there). Tracking already uses the same host.

/**
 * Local-development override. Set back to '' to fall back to the deployed
 * dev API below.
 *
 * Set this to 'http://localhost:4000/api' + `adb reverse tcp:4000 tcp:4000`
 * (+ `adb reverse tcp:8081 tcp:8081` for Metro) when iterating against a
 * local server/ over the USB bridge. Left empty so a standalone build talks
 * to the real deployed dev API and needs no cable/tunnel at all.
 */
const DEV_API_BASE = 'http://localhost:4000/api';

export const BUILD = {
  // Flipped between builds (generic -> false, context -> true).
  CONTEXT_ENABLED: true,
  VARIANT: 'context' as 'context' | 'generic',
  APP_LABEL: 'SwiftLoan',
  // Deployed API (all app API calls + context resolve go here).
  API_BASE: DEV_API_BASE || 'http://dev-api.swiftloan.ai/api',
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
