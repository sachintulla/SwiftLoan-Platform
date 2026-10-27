/**
 * The WhatsApp template catalogue: every message SwiftLoan sends on WhatsApp, written
 * to be submitted to Meta (through Vox Digitals CPaaS or directly) in the UTILITY
 * category.
 *
 * Utility means a message about a specific request or transaction the customer is
 * already part of: a confirmation, a status, an update, a document they need to
 * provide. It must not promote anything. Meta reviews the text, not just the label,
 * so these are worded as factual updates tied to the customer's own application
 * (a reference number, a step, a lender), with no urgency, no incentives and no
 * calls to "apply now". A test (whatsappTemplates.test.ts) enforces the formatting
 * rules Meta rejects on: sequential variables, none at the very start or end, no
 * adjacent variables, a sample value for each, and no promotional wording.
 *
 * Honest limit: Meta decides the final category. A reminder to finish an abandoned
 * application can still be re-categorised as marketing whatever it is submitted as.
 * These are worded to give it the best chance; check the category Meta assigns before
 * relying on a template, because a template that Meta treats as marketing is billed
 * differently and cannot be sent outside the marketing rules.
 */

export type TemplateTarget = 'stage' | 'install' | 'applied' | 'summary' | 'noOffers' | 'eligibilityRetry';

export interface WhatsAppTemplate {
  /** Lowercase letters, digits and underscores, as Meta requires. */
  name: string;
  category: 'UTILITY';
  language: 'en';
  /** What this message is for, in plain words. */
  purpose: string;
  /** Where the code sends it. `stage` templates are chosen per stage on Stage outreach. */
  target: TemplateTarget;
  /** Human description of the place that sends it. */
  usedBy: string;
  /** For `stage` templates: the journey stages it is recommended for. */
  recommendedStages: string[];
  /** Body with {{1}}, {{2}}… */
  body: string;
  footer: string;
  /** What each {{n}} holds, in order. */
  variables: string[];
  /** A sample value for each variable. Meta requires them at submission. */
  examples: string[];
  /** The values the code fills in, in order, as {tokens} the sender understands. */
  placeholders: string[];
  /** The older template this replaces, if any. */
  replaces?: string;
}

const FOOTER = 'SwiftLoan';

export const WHATSAPP_TEMPLATES: readonly WhatsAppTemplate[] = [
  {
    name: 'lead_request_received',
    category: 'UTILITY', language: 'en',
    purpose: 'Confirms we received the loan request a visitor made on the website and where to continue it.',
    target: 'stage', usedBy: 'Stage nudge: lead captured', recommendedStages: ['lead_captured'],
    body: 'Hi {{1}}, we have received your loan request on SwiftLoan and your details are saved. To continue your application, open the SwiftLoan app here: {{2}} This message is about the request you made on our website.',
    footer: FOOTER,
    variables: ['First name', 'Link to open the app'],
    examples: ['Priya', 'https://www.swiftloan.ai/applink'],
    placeholders: ['{name}', '{siteUrl}/applink'],
    replaces: 'marketing_check_rate',
  },
  {
    name: 'signin_application_pending',
    category: 'UTILITY', language: 'en',
    purpose: 'Tells a customer who signed in that their loan application is waiting to be started.',
    target: 'stage', usedBy: 'Stage nudge: signed in', recommendedStages: ['otp_verified'],
    body: 'Hi {{1}}, you signed in to SwiftLoan and your loan application has not been started yet. Your account details are saved. You can start it here: {{2}} This message is an update about your SwiftLoan account.',
    footer: FOOTER,
    variables: ['First name', 'Link to open the app'],
    examples: ['Priya', 'https://www.swiftloan.ai/applink'],
    placeholders: ['{name}', '{siteUrl}/applink'],
    replaces: 'marketing_check_rate',
  },
  {
    name: 'application_incomplete_update',
    category: 'UTILITY', language: 'en',
    purpose: 'Update that an application the customer started is incomplete, naming the step it stopped at.',
    target: 'install', usedBy: 'Website drop-off install reminders', recommendedStages: [],
    body: 'Hi {{1}}, your SwiftLoan loan application is incomplete at {{2}}. Your saved details are available when you continue. Open the app to continue: {{3}} This is an update about your application.',
    footer: FOOTER,
    variables: ['First name', 'Step the application stopped at', 'Personal link to continue'],
    examples: ['Priya', 'PAN verification', 'https://api.swiftloan.ai/dl?ref=AB12CD34'],
    placeholders: ['{name}', '{step}', '{link}'],
    replaces: 'install_app_resume_step',
  },
  {
    name: 'offers_available_update',
    category: 'UTILITY', language: 'en',
    purpose: 'Update that the eligibility check is complete and how many offers are waiting to be viewed.',
    target: 'stage', usedBy: 'Stage nudge: eligibility done, offers viewed', recommendedStages: ['eligibility_completed', 'offer_viewed'],
    body: 'Hi {{1}}, your loan eligibility check (Ref {{2}}) is complete and {{3}} offer(s) are available for your profile. You can view them here: {{4}} Please read the terms of each offer before you choose.',
    footer: FOOTER,
    variables: ['First name', 'Application reference', 'Number of offers', 'Link to the offers'],
    examples: ['Priya', 'SL-884021', '3', 'https://www.swiftloan.ai/apply/offers'],
    placeholders: ['{name}', '{ref}', '{offerCount}', '{siteUrl}/apply/offers'],
    replaces: 'offers_ready',
  },
  {
    name: 'document_request_update',
    category: 'UTILITY', language: 'en',
    purpose: 'Asks the customer to complete a verification step needed for their application.',
    target: 'stage', usedBy: 'Stage nudge: KYC started', recommendedStages: ['kyc_started'],
    body: 'Hi {{1}}, to continue your application (Ref {{2}}) we need you to complete: {{3}}. You can do this here: {{4}} Your information is handled securely.',
    footer: FOOTER,
    variables: ['First name', 'Application reference', 'What is needed', 'Link to continue'],
    examples: ['Priya', 'SL-884021', 'your KYC details', 'https://www.swiftloan.ai/apply'],
    placeholders: ['{name}', '{ref}', 'your KYC details (PAN and Aadhaar eKYC)', '{siteUrl}/apply'],
    replaces: 'document_request',
  },
  {
    name: 'application_not_approved_update',
    category: 'UTILITY', language: 'en',
    purpose: 'Update that a lender did not approve the application and where the other options are. It does not give the lender\'s reason.',
    target: 'stage', usedBy: 'Stage nudge: rejected by lender', recommendedStages: ['loan_rejected'],
    body: 'Hi {{1}}, your loan application (Ref {{2}}) was not approved by the lender. This does not affect your other options in the SwiftLoan app, which you can review here: {{3}} If you have questions, reply to this message.',
    footer: FOOTER,
    variables: ['First name', 'Application reference', 'Link to review other options'],
    examples: ['Priya', 'SL-884021', 'https://www.swiftloan.ai/apply/offers'],
    placeholders: ['{name}', '{ref}', '{siteUrl}/apply/offers'],
  },
  {
    name: 'loan_application_submitted',
    category: 'UTILITY', language: 'en',
    purpose: 'Confirms an application was submitted to a lender and where to track it.',
    target: 'applied', usedBy: 'Lender-applied follow-up', recommendedStages: [],
    body: 'Hi {{1}}, your application to {{2}} has been submitted. You can track its status in the SwiftLoan app: {{3}} We will message you here when the status changes.',
    footer: FOOTER,
    variables: ['First name', 'Lender name', 'Link to track the application'],
    examples: ['Priya', 'Example Finance', 'https://api.swiftloan.ai/dl?ref=AB12CD34'],
    placeholders: ['{name}', '{lender}', '{link}'],
    replaces: 'loan_applied_install_app',
  },
  {
    name: 'conversation_summary',
    category: 'UTILITY', language: 'en',
    purpose: 'Recap of what was discussed with a SwiftLoan agent and the agreed next steps.',
    target: 'summary', usedBy: 'After every conversation (call, in-app and website agents)', recommendedStages: [],
    body: 'Hi {{1}}, thank you for speaking with SwiftLoan. Here is a summary of your conversation: {{2}} Next steps: {{3}} If anything above is incorrect, please reply to this message.',
    footer: FOOTER,
    variables: ['First name', 'Summary of what was discussed', 'Next steps'],
    examples: ['Priya', 'We discussed your request for a personal loan of Rs 3 lakh and your eligibility.', 'Open the SwiftLoan app to view your offers.'],
    placeholders: ['{name}', '{summary}', '{actionPlan}'],
  },
  {
    name: 'no_offers_update',
    category: 'UTILITY', language: 'en',
    purpose: 'Update that the eligibility check finished and no offers are available for the profile.',
    target: 'noOffers', usedBy: 'Eligibility check returned no offers', recommendedStages: [],
    body: 'Hi {{1}}, we have completed your loan eligibility check (Ref {{2}}). Based on the details provided, no loan offers are available for your profile right now. {{3}} If you have questions, reply to this message.',
    footer: FOOTER,
    variables: ['First name', 'Application reference', 'What the customer can do next'],
    examples: ['Priya', 'SL-884021', 'You can review or update your details in the SwiftLoan app and check again.'],
    placeholders: ['{name}', '{ref}', '{guidance}'],
  },
  {
    name: 'eligibility_retry_update',
    category: 'UTILITY', language: 'en',
    purpose: 'Update that the eligibility check could not finish because of a technical issue.',
    target: 'eligibilityRetry', usedBy: 'Eligibility check failed with a technical fault', recommendedStages: [],
    body: 'Hi {{1}}, we could not complete your loan eligibility check (Ref {{2}}) because of a technical issue. Your details are saved. Please try again from the app: {{3}} We are sorry for the inconvenience.',
    footer: FOOTER,
    variables: ['First name', 'Application reference', 'Link to try again'],
    examples: ['Priya', 'SL-884021', 'https://www.swiftloan.ai/applink'],
    placeholders: ['{name}', '{ref}', '{link}'],
  },
];

/** Templates the code or older notes refer to that are, or were, submitted as marketing. Replace, don't reuse. */
export const LEGACY_TEMPLATES: ReadonlyArray<{ name: string; issue: string; replacement: string }> = [
  { name: 'marketing_check_rate', issue: 'Named and worded as marketing ("check your rate")', replacement: 'lead_request_received / signin_application_pending' },
  { name: 'install_app_resume', issue: 'Submitted as MARKETING (see docs/JOURNEY_RESUME_TEMPLATES.md)', replacement: 'application_incomplete_update' },
  { name: 'install_app_resume_step', issue: 'Submitted as MARKETING on 22 Oct', replacement: 'application_incomplete_update' },
  { name: 'offers_ready', issue: 'Category not confirmed as utility; wording is promotional', replacement: 'offers_available_update' },
  { name: 'document_request', issue: 'Category not confirmed as utility', replacement: 'document_request_update' },
  { name: 'loan_applied_install_app', issue: 'Listed as "to be approved"; wording asks to install the app', replacement: 'loan_application_submitted' },
];

export function templateByName(name: string): WhatsAppTemplate | undefined {
  return WHATSAPP_TEMPLATES.find((t) => t.name === name);
}

/** Substitute sample values, to show what Meta (and the customer) will see. */
export function previewBody(t: WhatsAppTemplate): string {
  return t.body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => t.examples[Number(n) - 1] ?? '');
}

/** The template in Meta's own submission format (the Graph API message-templates shape). */
export function toMetaPayload(t: WhatsAppTemplate) {
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    components: [
      { type: 'BODY', text: t.body, example: { body_text: [t.examples] } },
      { type: 'FOOTER', text: t.footer },
    ],
  };
}

/** The template recommended for a journey stage, if one is. */
export function recommendedForStage(stage: string): WhatsAppTemplate | undefined {
  return WHATSAPP_TEMPLATES.find((t) => t.target === 'stage' && t.recommendedStages.includes(stage));
}
