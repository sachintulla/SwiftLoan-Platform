// WS3 download manifest — where the two APK builds live and how links are formed.
// APKs are hosted as GitHub Release assets on a PUBLIC repo (public release
// assets need no auth and have no practical size limit), overridable via env.

const REL = 'https://github.com/veerendrabhimireddy/swiftloan-apks/releases/download/v3';

export const downloads = {
  version: process.env.APK_VERSION ?? '3.0.0',
  // Public base URL of THIS api (for absolute landing/deep links).
  // Defaults to local dev; real deploys set PUBLIC_BASE_URL to their own host.
  publicBase: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
  deepLinkScheme: 'swiftloan',
  builds: {
    generic: {
      key: 'generic',
      label: 'SwiftLoan',
      description: 'Standard app — neutral onboarding from scratch.',
      applicationId: 'com.swiftloan',
      url: process.env.APK_GENERIC_URL ?? `${REL}/swiftloan-generic.apk`,
    },
    context: {
      key: 'context',
      label: 'SwiftLoan Continue',
      description: 'Context-aware app — resumes the journey the user started on the website/call.',
      applicationId: 'com.swiftloan.ctx',
      url: process.env.APK_CONTEXT_URL ?? `${REL}/swiftloan-context.apk`,
    },
  },
};

// Where /dl sends a visitor. DUMMY defaults until the real listings exist:
//  - android: the hosted test APK (a sideload — no Play Install Referrer, so those
//    installs are matched by IP window; a play.google.com URL here switches /dl
//    to the deterministic referrer automatically).
//  - ios: a placeholder TestFlight public link. Replace with the real
//    https://testflight.apple.com/join/<code> (or the App Store URL) via IOS_STORE_URL.
export const stores = {
  android: process.env.ANDROID_STORE_URL ?? downloads.builds.generic.url,
  ios: process.env.IOS_STORE_URL ?? 'https://testflight.apple.com/join/SWIFTLOAN-DUMMY',
  web: process.env.WEBSITE_URL ?? 'https://swiftloan-website.onrender.com',
};

// Build the links a captured lead needs to continue in-app.
export function contextLinks(token: string) {
  return {
    // Opaque deep link — carries only the token, never PII (RBI/DPDP guardrail).
    deepLink: `${downloads.deepLinkScheme}://onboard?token=${token}`,
    // Human-friendly landing page: download the context app + open with context.
    landingUrl: `${downloads.publicBase}/d/${token}`,
    // Direct APK for the context build.
    contextApkUrl: downloads.builds.context.url,
  };
}
