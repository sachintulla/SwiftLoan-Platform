// WS3 download manifest — where the two APK builds live and how links are formed.
// APKs are hosted as GitHub Release assets on a PUBLIC repo (public release
// assets need no auth and have no practical size limit), overridable via env.

const REL = 'https://github.com/veerendrabhimireddy/swiftloan-apks/releases/download/v3';

export const downloads = {
  version: process.env.APK_VERSION ?? '3.0.0',
  // Public base URL of THIS api (for absolute landing/deep links).
  publicBase: (process.env.PUBLIC_BASE_URL ?? 'https://swiftloan-api.onrender.com').replace(/\/$/, ''),
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
