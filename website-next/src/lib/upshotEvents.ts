/**
 * The full SwiftLoan event catalogue sent to Upshot, with representative
 * attribute values.
 *
 * Upshot's dashboard can only target an event it has already received, so every
 * event has to be fired at least once before a campaign can be built against
 * it. This list is that catalogue — it doubles as the contract between our code
 * and whoever authors the campaigns.
 *
 * Attribute VALUES here are examples; the types and key names are what matter,
 * because Upshot infers an attribute's type from the first event it sees. Send
 * `amount` as a string once and it is a string forever, so the samples below
 * deliberately use the same types the real events use.
 */

export type UpshotEventDef = {
  name: string;
  /** Which surface emits it in real usage. */
  source: 'website' | 'mobile' | 'both';
  description: string;
  attributes: Record<string, string | number | boolean>;
};

/** Attributes attached to every event, so campaigns can segment consistently. */
export const COMMON_ATTRIBUTES = {
  platform: 'Web' as string,
  appVersion: '1.0',
  source: 'website' as string,
};

export const UPSHOT_EVENTS: UpshotEventDef[] = [
  // ── website journey ──
  {
    name: 'website_visit',
    source: 'website',
    description: 'Visitor landed on the marketing site.',
    attributes: { page: '/', referrer: 'google', utmSource: 'google', utmCampaign: 'diwali' },
  },
  {
    name: 'website_form_started',
    source: 'website',
    description: 'Started filling the "check your rate" form.',
    attributes: { product: 'Personal Loan' },
  },
  {
    name: 'website_lead_submitted',
    source: 'website',
    description: 'Submitted the lead form — the conversion event.',
    attributes: { product: 'Personal Loan', amount: 500000, city: 'Pune', ref: 'SL-1234', utmCampaign: 'diwali' },
  },
  {
    name: 'emi_calculated',
    source: 'website',
    description: 'Used the EMI calculator.',
    attributes: { amount: 500000, rate: 11.5, tenureMonths: 36, emi: 16489 },
  },

  // ── voice / outreach ──
  {
    name: 'call_completed',
    source: 'both',
    description: 'Outreach call finished.',
    attributes: { answered: true, durationSec: 95, outcome: 'interested', campaign: 'diwali' },
  },

  // ── mobile app lifecycle ──
  {
    name: 'app_installed',
    source: 'mobile',
    description: 'App installed on the device.',
    attributes: { platform: 'Android', source: 'organic' },
  },
  {
    name: 'app_opened',
    source: 'mobile',
    description: 'App launched.',
    attributes: { platform: 'Android' },
  },
  {
    name: 'language_selected',
    source: 'mobile',
    description: 'Chose an app language.',
    attributes: { language: 'en', label: 'English' },
  },
  {
    name: 'otp_requested',
    source: 'mobile',
    description: 'Requested a login OTP.',
    attributes: { screen: 'mobile' },
  },
  {
    name: 'otp_verified',
    source: 'mobile',
    description: 'Verified the OTP — the registration event.',
    attributes: { priorInquiryCount: 1 },
  },

  // ── loan funnel ──
  {
    name: 'eligibility_completed',
    source: 'mobile',
    description: 'Eligibility check finished and offers generated.',
    attributes: { offerCount: 4 },
  },
  {
    name: 'offer_viewed',
    source: 'mobile',
    description: 'Viewed matched offers.',
    attributes: { offerCount: 4, bestApr: 10.49 },
  },
  {
    name: 'offer_selected',
    source: 'mobile',
    description: 'Chose a specific offer.',
    attributes: { apr: 10.49, amount: 500000, tenureMonths: 36, partner: 'Aditya Finance' },
  },
  {
    name: 'kyc_started',
    source: 'mobile',
    description: 'Began KYC.',
    attributes: { method: 'aadhaar' },
  },
  {
    name: 'kyc_completed',
    source: 'mobile',
    description: 'Completed every KYC method.',
    attributes: { methods: 'aadhaar,pan,bank,selfie' },
  },
  {
    name: 'application_submitted',
    source: 'mobile',
    description: 'Loan application submitted.',
    attributes: { amount: 500000, product: 'Personal Loan' },
  },
  {
    name: 'loan_approved',
    source: 'mobile',
    description: 'Lender approved the application.',
    attributes: { amount: 500000, apr: 10.49 },
  },
  {
    name: 'loan_rejected',
    source: 'mobile',
    description: 'Lender rejected the application.',
    attributes: { reason: 'credit_policy' },
  },
  {
    name: 'loan_disbursed',
    source: 'mobile',
    description: 'Funds disbursed.',
    attributes: { amount: 500000, partner: 'Aditya Finance' },
  },

  // ── drop-off nudges (fired by the server's stall rules) ──
  // These are the ones campaigns are actually built against, so they must exist
  // in Upshot even though the server cannot send them yet.
  {
    name: 'swiftloan_otp_not_verified',
    source: 'mobile',
    description: 'Requested an OTP but never verified it (15 min).',
    attributes: { stuckAt: 'otp_requested', expected: 'otp_verified', delayMinutes: 15, minutesStuck: 20 },
  },
  {
    name: 'swiftloan_install_not_registered',
    source: 'mobile',
    description: 'Installed the app but never registered (30 min).',
    attributes: { stuckAt: 'app_installed', expected: 'otp_verified', delayMinutes: 30, minutesStuck: 45 },
  },
  {
    name: 'swiftloan_eligibility_incomplete',
    source: 'mobile',
    description: 'Registered but never checked eligibility (15 min).',
    attributes: { stuckAt: 'otp_verified', expected: 'eligibility_completed', delayMinutes: 15, minutesStuck: 22 },
  },
  {
    name: 'swiftloan_offer_not_selected',
    source: 'mobile',
    description: 'Viewed offers but selected none (20 min).',
    attributes: { stuckAt: 'offer_viewed', expected: 'offer_selected', delayMinutes: 20, minutesStuck: 30 },
  },
  {
    name: 'swiftloan_kyc_incomplete',
    source: 'mobile',
    description: 'Started KYC but never finished (15 min).',
    attributes: { stuckAt: 'kyc_started', expected: 'kyc_completed', delayMinutes: 15, minutesStuck: 25 },
  },
  {
    name: 'swiftloan_lead_no_install',
    source: 'website',
    description: 'Website lead never installed the app (60 min).',
    attributes: { stuckAt: 'lead_captured', expected: 'app_installed', delayMinutes: 60, minutesStuck: 90 },
  },
];

export const WEBSITE_EVENTS = UPSHOT_EVENTS.filter((e) => e.source === 'website' || e.source === 'both');
export const MOBILE_EVENTS = UPSHOT_EVENTS.filter((e) => e.source === 'mobile' || e.source === 'both');
