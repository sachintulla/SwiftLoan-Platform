import { describe, it, expect } from 'vitest';
import {
  alertError, alertName, callSummaryText, emptyCounts, foldCounts, humanise, isAlertOutcome, isAlertType, outcomeLabel, parseAlertFilters,
  ALERT_OUTCOMES, ALERT_STATUS_OPTIONS, ALERT_TYPES,
} from './alerts.js';

describe('alertName', () => {
  it('names a WhatsApp message by its template', () => {
    expect(alertName('whatsapp', { template: 'continue_application_app', kind: 'app_dropoff' })).toBe('Continue application');
    expect(alertName('whatsapp', { template: 'no_offers_call', kind: 'offers_notice_no_offers' })).toBe('No offers');
    expect(alertName('whatsapp', { template: 'offers_ready_view_link', kind: 'app_dropoff' })).toBe('Offers ready');
    expect(alertName('whatsapp', { template: 'welcome_continue_app', kind: 'welcome' })).toBe('Welcome');
  });

  it('names an SMS by its registered text, never by the DLT number', () => {
    expect(alertName('sms', { template: '1277179300146510723', kind: 'sms_fallback' })).toBe('Continue application');
    expect(alertName('sms', { template: '1277179266527595706', kind: 'welcome_sms' })).toBe('Verify your PAN');
    // an id we do not know: what sent it, not the digits
    expect(alertName('sms', { template: '1433720728184183', kind: 'stall' })).toBe('Stuck-step reminder');
    expect(alertName('sms', { template: '999', kind: null })).toBe('Message');
  });

  it('says when an admin or a test sent it', () => {
    expect(alertName('whatsapp', { template: 'dropoff_continue_app', kind: 'admin' })).toBe('Continue application (by admin)');
    expect(alertName('sms', { template: '1277178738168111452', kind: 'admin' })).toBe('Sent by admin');
    expect(alertName('sms', { template: null, kind: 'test' })).toBe('Test message');
  });

  it('falls back to a readable form of an unknown template or kind', () => {
    expect(alertName('whatsapp', { template: 'emi_reminder_v2', kind: 'something' })).toBe('Emi reminder v2');
    expect(alertName('whatsapp', { template: null, kind: 'some_new_job' })).toBe('Some new job');
    expect(alertName('whatsapp', {})).toBe('Message');
  });

  it('names a call by why it was placed', () => {
    expect(alertName('call', { reason: 'no_offers_followup' })).toBe('No offers call');
    expect(alertName('call', { reason: 'app_dropoff_followup' })).toBe('Why did you stop?');
    expect(alertName('call', { reason: 'inactive_followup' })).toBe('Follow-up call');
    expect(alertName('call', { reason: 'manual_dashboard_call' })).toBe('Call by admin');
    expect(alertName('call', { reason: 'brand_new_reason' })).toBe('Brand new reason');
    expect(alertName('call', {})).toBe('Call');
  });

  it('names a push by its event', () => {
    expect(alertName('push', { template: 'swiftloan_journey_nudge' })).toBe('Journey reminder');
    expect(alertName('push', { template: 'swiftloan_offer_expiring' })).toBe('Offer expiring');
    expect(alertName('push', {})).toBe('Push');
  });
});

describe('outcomeLabel', () => {
  it('a connected call is "Answered", any other success is "Success"', () => {
    expect(outcomeLabel('call', 'success')).toBe('Answered');
    expect(outcomeLabel('whatsapp', 'success')).toBe('Success');
    expect(outcomeLabel('sms', 'sent')).toBe('Sent');
    expect(outcomeLabel('call', 'not_answered')).toBe('Not answered');
    expect(outcomeLabel('push', 'failed')).toBe('Failed');
    expect(outcomeLabel('call', 'pending')).toBe('Waiting');
  });
  it('the filter offers every outcome once', () => {
    expect(ALERT_STATUS_OPTIONS.map((o) => o.key).sort()).toEqual([...ALERT_OUTCOMES].sort());
  });
});

describe('alertError', () => {
  it('only a failed row has an error', () => {
    expect(alertError('sent', 'whatever')).toBeNull();
    expect(alertError('success', 'whatever')).toBeNull();
    expect(alertError('not_answered', 'no terminal webhook within 30m')).toBeNull();
  });
  it('keeps the provider words', () => {
    expect(alertError('failed', 'Insufficient balance')).toBe('Insufficient balance');
    expect(alertError('failed', ' No Credit ')).toBe('No Credit');
  });
  it('turns an HTML error page into its title', () => {
    expect(alertError('failed', '<html>\n<head><title>502 Bad Gateway</title></head>\n<body><center><h1>502 Bad Gateway</h1></center></body></html>')).toBe('502 Bad Gateway');
    expect(alertError('failed', '<b>Bad</b> request')).toBe('Bad request');
  });
  it('explains a bare status code, a network failure and a missing reason', () => {
    expect(alertError('failed', '500')).toBe('Provider error 500');
    expect(alertError('failed', 'fetch failed')).toBe('Could not reach the provider');
    expect(alertError('failed', null)).toBe('No reason was recorded');
    expect(alertError('failed', '   ')).toBe('No reason was recorded');
  });
  it('cuts a very long reason', () => {
    const out = alertError('failed', 'x'.repeat(400))!;
    expect(out.length).toBe(160);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('parseAlertFilters', () => {
  it('reads type, status, dates and the customer', () => {
    const f = parseAlertFilters({ type: 'sms', status: 'failed', from: '2026-11-19T00:00:00.000Z', to: '2026-11-19T12:00:00.000Z', customerId: '5cf5f5b4-c6a4-4378-9d62-41572662a88e' });
    expect(f.type).toBe('sms');
    expect(f.outcome).toBe('failed');
    expect(f.from?.toISOString()).toBe('2026-11-19T00:00:00.000Z');
    expect(f.to?.toISOString()).toBe('2026-11-19T12:00:00.000Z');
    expect(f.customerId).toBe('5cf5f5b4-c6a4-4378-9d62-41572662a88e');
  });
  it('ignores what it does not understand', () => {
    const f = parseAlertFilters({ type: 'fax', status: 'delivered', from: 'yesterday', customerId: "x' OR 1=1" });
    expect(f).toEqual({ type: null, outcome: null, from: null, to: null, phone: null, name: null, customerId: null });
  });
  it('a search of digits is a mobile number, anything else a name', () => {
    expect(parseAlertFilters({ search: '98765 43210' })).toMatchObject({ phone: '9876543210', name: null });
    expect(parseAlertFilters({ search: '+91 9876543210' })).toMatchObject({ phone: '9876543210', name: null });
    expect(parseAlertFilters({ search: '987' })).toMatchObject({ phone: '987', name: null });
    expect(parseAlertFilters({ search: 'Asha Verma' })).toMatchObject({ phone: null, name: 'Asha Verma' });
    expect(parseAlertFilters({ search: 'Asha 2' })).toMatchObject({ phone: null, name: 'Asha 2' });
    expect(parseAlertFilters({ search: '  ' })).toMatchObject({ phone: null, name: null });
  });
});

describe('counts', () => {
  it('folds type × outcome into totals', () => {
    const c = foldCounts([
      { type: 'whatsapp', outcome: 'sent', n: 5n }, { type: 'whatsapp', outcome: 'failed', n: 2 },
      { type: 'call', outcome: 'success', n: 3 }, { type: 'call', outcome: 'not_answered', n: 4 },
      { type: 'fax', outcome: 'sent', n: 9 }, { type: 'sms', outcome: 'delivered', n: 9 },
    ]);
    expect(c.whatsapp).toMatchObject({ total: 7, sent: 5, failed: 2 });
    expect(c.call).toMatchObject({ total: 7, success: 3, not_answered: 4 });
    expect(c.sms.total).toBe(0);
    expect(c.push).toEqual(emptyCounts().push);
  });
});

describe('lists', () => {
  it('knows its own types and outcomes', () => {
    for (const t of ALERT_TYPES) expect(isAlertType(t)).toBe(true);
    expect(isAlertType('email')).toBe(false);
    expect(isAlertOutcome('sent')).toBe(true);
    expect(isAlertOutcome('queued')).toBe(false);
    expect(humanise('swift_loan-thing')).toBe('Swift loan thing');
  });
});

describe('callSummaryText', () => {
  it('keeps a plain summary', () => {
    expect(callSummaryText(' The customer will finish the PAN step today. ')).toBe('The customer will finish the PAN step today.');
  });
  it("lifts the summary out of the provider's JSON report", () => {
    const report = JSON.stringify({ disconnected_by: 'user', hangup_cause: 'PSTN', summary: 'Apologised for no offers; said "we will call back".', call_id: 'abc' });
    expect(callSummaryText(report)).toBe('Apologised for no offers; said "we will call back".');
  });
  it('shows nothing for a report with no summary, or nothing at all', () => {
    expect(callSummaryText('{"disconnected_by":"user"}')).toBeNull();
    expect(callSummaryText('[1,2]')).toBeNull();
    expect(callSummaryText('')).toBeNull();
    expect(callSummaryText(null)).toBeNull();
  });
  it('still finds the summary in a cut-off report', () => {
    expect(callSummaryText('{"a":1,"summary":"Wants a callback tomorrow.","transcript":"Hel')).toBe('Wants a callback tomorrow.');
    expect(callSummaryText('{"a":1,"transcr')).toBeNull();
  });
});
