/**
 * Plain names for the journey steps a notification can be triggered on, and the order the
 * journey runs in. A notification fires when a customer has reached one step (the stage you
 * are editing) but has not yet reached a later one; this file turns the codes into names that
 * read naturally after "reached" and lists which later steps make sense to wait for.
 */

/** The journey in order. A step can only wait for a step that comes after it. */
export const JOURNEY_ORDER = [
  'lead_captured', 'app_installed', 'app_opened', 'language_selected',
  'otp_requested', 'otp_verified',
  'eligibility_started', 'eligibility_completed',
  'offer_viewed', 'offer_selected',
  'application_submitted', 'loan_approved', 'loan_rejected', 'loan_disbursed',
] as const;

export const EVENT_LABEL: Record<string, string> = {
  lead_captured: 'Lead captured',
  app_installed: 'App installed',
  app_opened: 'App opened',
  language_selected: 'Language chosen',
  otp_requested: 'OTP requested',
  otp_verified: 'OTP verified',
  eligibility_started: 'Application started',
  eligibility_completed: 'Eligibility done',
  offer_viewed: 'Offers viewed',
  offer_selected: 'Offer chosen',
  kyc_started: 'KYC started',
  kyc_completed: 'KYC completed',
  application_submitted: 'Application submitted',
  loan_approved: 'Approved',
  loan_rejected: 'Rejected by lender',
  loan_disbursed: 'Loan received',
};

/** The plain name for an event code, or a readable version of the code when it has none. */
export function eventLabel(code: string): string {
  return EVENT_LABEL[code] ?? (code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' '));
}

export interface EventOption { value: string; label: string }

/**
 * A rejection is not a point on the main path: what the customer can still do afterwards is
 * choose another offer, apply again, or get approved, none of which come "after" it in the
 * journey order. So it lists its own choices.
 */
const ALTERNATIVES: Record<string, readonly string[]> = {
  loan_rejected: ['offer_selected', 'application_submitted', 'loan_approved', 'loan_disbursed'],
};

/**
 * The steps a notification at `trigger` can wait for: everything later in the journey.
 * `current` is always kept in the list (even if it is not later, for example an older rule)
 * so opening a rule never silently changes it.
 */
export function laterEvents(trigger: string, current?: string): EventOption[] {
  const at = JOURNEY_ORDER.indexOf(trigger as (typeof JOURNEY_ORDER)[number]);
  const steps: readonly string[] = ALTERNATIVES[trigger] ?? JOURNEY_ORDER.filter((_, i) => at < 0 || i > at);
  const later: EventOption[] = steps.map((value) => ({ value, label: eventLabel(value) }));
  if (current && current !== trigger && !later.some((o) => o.value === current)) later.unshift({ value: current, label: eventLabel(current) });
  return later;
}

