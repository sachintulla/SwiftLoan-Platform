import { describe, it, expect } from 'vitest';
import { lenderJourneyEvent, normaliseLenderState, SUBMITTED_STATES } from './lenderJourneyEvent.js';
import { JOURNEY_EVENTS, stageForEvent } from './journey.js';

const push = (mapped: string, state: string, appliedWithLender = false) => lenderJourneyEvent({ mapped, state, appliedWithLender });

describe('lenderJourneyEvent', () => {
  it("the lender's own offers-check steps are a neutral update, not a submission", () => {
    // These are the real pushes that had put 696 of 949 customers at "Application submitted" (2026-11-19).
    expect(push('prequalifying', 'pan_comprehensive')).toBe(JOURNEY_EVENTS.LENDER_UPDATE);
    expect(push('under_review', 'bureau_soft_pull')).toBe(JOURNEY_EVENTS.LENDER_UPDATE);
    expect(push('offers_ready', 'eligibility_check')).toBe(JOURNEY_EVENTS.LENDER_UPDATE);
    expect(push('prequalifying', 'personal_details')).toBe(JOURNEY_EVENTS.LENDER_UPDATE);
  });

  it('a neutral update never moves the customer stage', () => {
    expect(stageForEvent(JOURNEY_EVENTS.LENDER_UPDATE)).toBeNull();
    expect(stageForEvent(JOURNEY_EVENTS.APPLICATION_SUBMITTED)).toBe('application_submitted');
  });

  it('states the lender sends after the customer submitted on its page are a submission', () => {
    for (const state of SUBMITTED_STATES) expect(push('under_review', state)).toBe(JOURNEY_EVENTS.APPLICATION_SUBMITTED);
    expect(push('under_review', 'Application_Submitted')).toBe(JOURNEY_EVENTS.APPLICATION_SUBMITTED);
  });

  it('a lender-scoped step counts only once the customer has applied with a lender', () => {
    expect(push('handoff', 'lender_selection', false)).toBe(JOURNEY_EVENTS.LENDER_UPDATE);
    expect(push('handoff', 'lender_selection', true)).toBe(JOURNEY_EVENTS.APPLICATION_SUBMITTED);
    expect(push('handoff', 'lender_api_journey', true)).toBe(JOURNEY_EVENTS.APPLICATION_SUBMITTED);
    // legacy flat payload: no state at all
    expect(push('under_review', '', false)).toBe(JOURNEY_EVENTS.LENDER_UPDATE);
    expect(push('under_review', '', true)).toBe(JOURNEY_EVENTS.APPLICATION_SUBMITTED);
  });

  it('decisions keep their own events whatever the state', () => {
    expect(push('approved', 'post_lender_redirection_journey')).toBe(JOURNEY_EVENTS.LOAN_APPROVED);
    expect(push('rejected', 'bureau_soft_pull')).toBe(JOURNEY_EVENTS.LOAN_REJECTED);
    expect(push('disbursed', '')).toBe(JOURNEY_EVENTS.LOAN_DISBURSED);
  });

  it('a technical failure is never a submission, even after applying', () => {
    expect(push('failed', 'lender_api_journey', true)).toBe(JOURNEY_EVENTS.LENDER_UPDATE);
    expect(push('failed', 'application_submitted', true)).toBe(JOURNEY_EVENTS.LENDER_UPDATE);
  });

  it('normalises the state the way the webhook matches it', () => {
    expect(normaliseLenderState(' KYC-Completed ')).toBe('kyccompleted');
    expect(normaliseLenderState('Post_Lender_Redirection_Journey')).toBe('post_lender_redirection_journey');
  });
});
