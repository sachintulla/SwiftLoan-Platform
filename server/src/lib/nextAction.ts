/**
 * WS5 — "what should happen next" for a customer sitting at a given stage.
 *
 * Lives in lib/ rather than in the route module because both the 360 view and
 * the Upshot nudge payload need the same wording, and importing a route from a
 * job would be a cycle.
 */
import type { JourneyStage } from '@prisma/client';

export const NEXT_ACTION_BY_STAGE: Record<JourneyStage, string> = {
  lead_captured: 'Call the lead',
  contacted: 'Send the app download link',
  app_installed: 'Awaiting registration',
  registered: 'Nudge to check eligibility',
  eligibility_checked: 'Nudge to view offers',
  offers_viewed: 'Nudge to select an offer',
  offer_selected: 'Nudge to start KYC',
  kyc_started: 'Nudge to finish KYC',
  kyc_completed: 'Nudge to submit the application',
  application_submitted: 'Awaiting lender decision',
  approved: 'Awaiting disbursal',
  disbursed: 'Journey complete — no action',
  rejected: 'Rejected — offer an alternative product',
  lost: 'Lost — no further action',
};

export function nextActionFor(stage: JourneyStage): string {
  return NEXT_ACTION_BY_STAGE[stage] ?? 'Review the customer record';
}
