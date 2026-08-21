/**
 * Human-readable labels for enum-ish values that reach a human.
 *
 * These exist because operator-facing strings were being built straight from database
 * keys: the stale-application detector wrote notification titles like
 * `Application SL-800103 stalled at "pan_pending"` and the onboarding detector wrote
 * `Onboarding abandoned at "aboutyou"`. Those are column values, not English, and they
 * showed up verbatim in the dashboard's notification list and the overview's work queue.
 *
 * Keep this as the single source of truth so a notification and the pipeline census
 * cannot drift into calling the same stage two different things.
 */

/** `LoanApplication.status` → what the dashboard calls that stage. */
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pan_pending: 'PAN pending',
  prequalifying: 'Prequalifying',
  offers_ready: 'Offers ready',
  handoff: 'Lender handoff',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  disbursed: 'Disbursed',
  closed: 'Closed',
};

/**
 * `OnboardingFunnel.stepName` → the screen's name in plain English.
 * Keys are the app's screen ids (see src/screens in the mobile app).
 */
export const ONBOARDING_STEP_LABELS: Record<string, string> = {
  splash: 'Splash',
  language: 'Language choice',
  mobile: 'Mobile number',
  otp: 'OTP verification',
  permissions: 'Permissions',
  aboutyou: 'About you',
  basic: 'Loan basics',
  basicpan: 'PAN details',
  moredetails: 'More details',
  offers: 'Offers',
  kyc: 'KYC',
  handoff: 'Lender handoff',
  home: 'Home',
};

/** Falls back to a de-snake-cased version so an unmapped key still reads as English. */
function humanise(raw: string): string {
  const s = raw.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function applicationStatusLabel(status: string): string {
  return APPLICATION_STATUS_LABELS[status] ?? humanise(status);
}

export function onboardingStepLabel(step: string): string {
  return ONBOARDING_STEP_LABELS[step] ?? humanise(step);
}
