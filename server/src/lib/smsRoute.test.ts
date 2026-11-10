import { describe, it, expect } from 'vitest';
import { LINK_SMS, PAN_PENDING_SMS } from './smsRoute.js';
import { DEFAULT_DROPOFF_MESSAGES, mergeDropoffMessages, pickSms } from './dropoffSteps.js';
import { renderSmsBody } from './reminderSchedule.js';
import { DEFAULT_WELCOME_SMS } from './welcomeMessage.js';

describe('the two registered SMS texts', () => {
  it('every drop-off step (continue / choosing an offer) uses the link text, with or without a personal link', () => {
    for (const kind of ['continue', 'apply_offers'] as const) {
      for (const withLink of [true, false]) expect(pickSms(DEFAULT_DROPOFF_MESSAGES, kind, withLink)?.templateId).toBe(LINK_SMS.templateId);
    }
  });
  it('a saved WhatsApp-only setting keeps the shipped SMS (merged per variant)', () => {
    const merged = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, { continue: { whatsapp: { withLink: { template: 'x' } } } });
    expect(pickSms(merged, 'continue', true)?.templateId).toBe(LINK_SMS.templateId);
  });
  it('the welcome SMS: app → "verify your PAN", website → the link text', () => {
    expect(DEFAULT_WELCOME_SMS.app.templateId).toBe('1277179266527595706');
    expect(DEFAULT_WELCOME_SMS.website.templateId).toBe('1277179300146510723');
  });
  it('fills the registered text exactly: name (or "Customer"), step and link', () => {
    expect(renderSmsBody(LINK_SMS.body, { name: null, step: 'Basic details', link: 'https://api.swiftloan.ai/dl?ref=AB' }))
      .toBe('Dear Customer , your SwiftLoan loan application is incomplete at Basic details. Please open the SwiftLoan app to continue where you left off :https://api.swiftloan.ai/dl?ref=AB. Team SwiftLoan\n-PurpleTalk IPL');
    expect(renderSmsBody(PAN_PENDING_SMS.body, { name: 'Asha', step: '', link: '' }))
      .toBe('Dear Asha , please verify your PAN in the SwiftLoan app to check your loan eligibility and view offers. Team SwiftLoan -PurpleTalk IPL');
  });
});
