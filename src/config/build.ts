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
 * On Android: 'http://localhost:4000/api' + `adb reverse tcp:4000 tcp:4000`
 * (+ `adb reverse tcp:8081 tcp:8081` for Metro) over the USB bridge.
 * On iOS, a physical device has no USB-reverse equivalent — instead point it
 * at the Mac's own LAN IP (`ipconfig getifaddr en0`) and make sure the phone
 * is on the same Wi-Fi network as the Mac running `server/` (npm start).
 * Left empty so a standalone build talks to the real deployed dev API and
 * needs no cable/network match at all.
 */
// Empty = use the DEPLOYED dev API (dev-api.swiftloan.ai) on every platform, so the app, Ello's
// tools and the data all share the one dev database. To use a local server instead, set
// 'http://localhost:4000/api' (Android, with `adb reverse tcp:4000 tcp:4000`) — and never commit it.
const DEV_API_BASE = '';

/**
 * Which deployed backend this build talks to. Flip to 'prod' before a
 * TestFlight/production build; leave 'dev' otherwise. DEV_API_BASE above
 * still wins over either when set (local dev on your own machine).
 *
 * 'prod' is the real production backend (api.swiftloan.ai) — loan
 * applications submitted from a build pointed here trigger real Aurix/KFT
 * bureau pulls against real production data, not mock offers.
 */
const API_ENV: 'dev' | 'prod' = 'dev';

const DEPLOYED_API_BASE: Record<'dev' | 'prod', string> = {
  dev: 'https://dev-api.swiftloan.ai/api',
  prod: 'https://api.swiftloan.ai/api',
};

/**
 * Which Upshot app a build reports to: the Demo app for every build that is NOT
 * pointed at the production backend, the Production app otherwise. A TestFlight/APK
 * build pointed at api.swiftloan.ai therefore reports to Production automatically.
 */
export function isUpshotDemo(apiBase: string): boolean {
  return apiBase !== DEPLOYED_API_BASE.prod;
}

export const BUILD = {
  // Flipped between builds (generic -> false, context -> true).
  CONTEXT_ENABLED: true,
  VARIANT: 'context' as 'context' | 'generic',
  APP_LABEL: 'SwiftLoan',
  // Deployed API (all app API calls + context resolve go here).
  API_BASE: DEV_API_BASE || DEPLOYED_API_BASE[API_ENV],
};

export const UPSHOT_DEMO = isUpshotDemo(BUILD.API_BASE);

// Point the api-client + tracking at the same backend.
//
// TRACK_BASE has to be set explicitly: the tracking client defaults to the
// deployed host independently of API_BASE, so without this a local build would
// send its API calls to the laptop but its journey events to production.
;(globalThis as unknown as { SWIFTLOAN_API_BASE?: string; SWIFTLOAN_TRACK_BASE?: string })
  .SWIFTLOAN_API_BASE = BUILD.API_BASE;
;(globalThis as unknown as { SWIFTLOAN_API_BASE?: string; SWIFTLOAN_TRACK_BASE?: string })
  .SWIFTLOAN_TRACK_BASE = BUILD.API_BASE;
