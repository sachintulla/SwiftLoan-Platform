/**
 * Which journey event a lender (Aurix / KFT) status push becomes. Pure; tested in lenderJourneyEvent.test.ts.
 *
 * The lender pushes an update for EVERY step of its own offers check (PAN check, credit-bureau pull, eligibility), long
 * before the customer has seen an offer. Each of those used to be recorded as "application submitted", which moved the
 * customer to that stage the moment the offers check started; the stage only moves forward, so it never came back, even
 * when the check ended with no offers (2026-11-19: 696 of 949 customers showed "Application submitted", ~105 had applied).
 *
 * Now "application submitted" is recorded only when the customer really applied with a lender. Every other push is kept
 * on the timeline as a neutral `lender_update` (no stage), so the audit trail is unchanged.
 */
import { JOURNEY_EVENTS } from './journey.js';

/** States the lender sends only AFTER the customer submitted on the lender's own page (OTP done there). */
export const SUBMITTED_STATES: ReadonlySet<string> = new Set(['application_submitted', 'kyc_completed', 'post_lender_redirection_journey']);

export const normaliseLenderState = (state: string): string => state.toLowerCase().replace(/[^a-z_]/g, '');

export interface LenderPush {
  /** The application status the push maps to (mapJourney / mapFlatStatus). */
  mapped: string;
  /** `journey.state` as sent ('' for the legacy flat payload). */
  state: string;
  /** True when this application already has a lender application or an applied offer. */
  appliedWithLender: boolean;
}

export function lenderJourneyEvent(p: LenderPush): string {
  if (p.mapped === 'approved') return JOURNEY_EVENTS.LOAN_APPROVED;
  if (p.mapped === 'rejected') return JOURNEY_EVENTS.LOAN_REJECTED;
  if (p.mapped === 'disbursed') return JOURNEY_EVENTS.LOAN_DISBURSED;
  // A technical failure is never "submitted", whatever came before it.
  if (p.mapped === 'failed') return JOURNEY_EVENTS.LENDER_UPDATE;
  if (SUBMITTED_STATES.has(normaliseLenderState(p.state)) || p.appliedWithLender) return JOURNEY_EVENTS.APPLICATION_SUBMITTED;
  return JOURNEY_EVENTS.LENDER_UPDATE;
}
