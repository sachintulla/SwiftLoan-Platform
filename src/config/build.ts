// Build-time configuration. Two APK variants are produced from this one file:
//   • generic build:  CONTEXT_ENABLED = false  (neutral onboarding, ignores links)
//   • context build:  CONTEXT_ENABLED = true   (resumes the website/call journey)
// The build script flips CONTEXT_ENABLED before each gradle build.
//
// The app talks to the DEPLOYED backend so the installed APK works on a real
// phone (localhost is unreachable there). Tracking already uses the same host.

export const BUILD = {
  // Flipped between builds (generic -> false, context -> true).
  CONTEXT_ENABLED: true,
  VARIANT: 'context' as 'context' | 'generic',
  APP_LABEL: 'SwiftLoan',
  // Deployed API (all app API calls + context resolve go here).
  API_BASE: 'https://swiftloan-api.onrender.com/api',
};

// Point the api-client + tracking at the deployed backend by default. Screens
// still degrade gracefully to demo data when offline (existing behaviour).
;(globalThis as unknown as { SWIFTLOAN_API_BASE?: string; SWIFTLOAN_TRACK_BASE?: string })
  .SWIFTLOAN_API_BASE = BUILD.API_BASE;
