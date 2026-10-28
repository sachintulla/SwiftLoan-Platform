import { describe, it, expect } from 'vitest';
import { JOURNEY_ORDER, eventLabel, laterEvents } from './eventLabels';

describe('eventLabel', () => {
  it('has a plain name for every step in the journey', () => {
    for (const code of JOURNEY_ORDER) expect(eventLabel(code), code).not.toMatch(/_/);
  });

  it('turns an unknown code into readable words rather than showing it raw', () => {
    expect(eventLabel('website_form_started')).toBe('Website form started');
  });

  it('uses names that read naturally after "reached"', () => {
    expect(eventLabel('offer_selected')).toBe('Offer chosen');
    expect(eventLabel('loan_rejected')).toBe('Rejected by lender');
  });
});

describe('laterEvents', () => {
  it('lists only the steps after the one the notification fires at, in journey order', () => {
    const values = laterEvents('offer_viewed').map((o) => o.value);
    expect(values[0]).toBe('offer_selected');
    expect(values).not.toContain('offer_viewed');
    expect(values).not.toContain('otp_verified');
    expect(values).toEqual([...values].sort((a, b) => JOURNEY_ORDER.indexOf(a as never) - JOURNEY_ORDER.indexOf(b as never)));
  });

  it('never offers the trigger itself, so a rule cannot wait for the step it fires on', () => {
    for (const code of JOURNEY_ORDER) expect(laterEvents(code).map((o) => o.value), code).not.toContain(code);
  });

  it('keeps the current choice even when it is not a later step, so opening a rule changes nothing', () => {
    const values = laterEvents('offer_viewed', 'otp_verified').map((o) => o.value);
    expect(values[0]).toBe('otp_verified');
  });

  it('offers every step for an event it does not know', () => {
    expect(laterEvents('something_new').length).toBe(JOURNEY_ORDER.length);
  });
});

describe('a rejection', () => {
  it('can wait for the customer to choose another offer, apply again or be approved', () => {
    expect(laterEvents('loan_rejected').map((o) => o.value)).toEqual(['offer_selected', 'application_submitted', 'loan_approved', 'loan_disbursed']);
  });
});
