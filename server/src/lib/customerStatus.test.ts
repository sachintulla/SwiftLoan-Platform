import { describe, it, expect } from 'vitest';
import { CUSTOMER_STATUSES, deriveCustomerStatus, isCustomerStatusKey, noOffersReasonLabel, type CustomerFacts } from './customerStatus.js';

type Account = NonNullable<CustomerFacts['account']>;
const account = (over: Partial<Account> = {}): Account => ({ phoneVerified: true, panOnFile: false, application: null, lenderApplications: [], ...over });
const app = (status: string, prequalifyReason: string | null = null, offerCount = 0) => ({ status, prequalifyReason, offerCount });
const status = (f: Partial<CustomerFacts>) => deriveCustomerStatus({ stage: 'registered', account: null, ...f });

describe('deriveCustomerStatus', () => {
  it('the wrong stage does not decide anything for someone with an account', () => {
    // The 2026-11-19 case: stage says "application submitted", the stored data says the offers check found nothing.
    const s = status({ stage: 'application_submitted', account: account({ panOnFile: true, application: app('rejected', 'not_eligible') }) });
    expect(s).toMatchObject({ key: 'no_offers', label: 'No offers found', detail: 'Not eligible', tone: 'red' });
  });

  it('account only: number verified, then PAN on file', () => {
    expect(status({ account: account() }).key).toBe('otp_verified');
    expect(status({ account: account({ panOnFile: true }) }).key).toBe('pan_verified');
    expect(status({ stage: 'lead_captured', account: account({ phoneVerified: false }) }).key).toBe('otp_pending');
  });

  it('the most recent application: details, checking, offers, no offers, failed', () => {
    expect(status({ account: account({ application: app('draft') }) }).key).toBe('filling_details');
    expect(status({ account: account({ application: app('pan_pending') }) }).key).toBe('filling_details');
    expect(status({ account: account({ application: app('prequalifying') }) }).key).toBe('checking_offers');
    expect(status({ account: account({ application: app('offers_ready', null, 3) }) })).toMatchObject({ key: 'offers_ready', detail: '3 offers' });
    expect(status({ account: account({ application: app('offers_ready', null, 1) }) }).detail).toBe('1 offer');
    expect(status({ account: account({ application: app('rejected', 'not_eligible') }) }).key).toBe('no_offers');
    expect(status({ account: account({ application: app('failed', 'technical') }) })).toMatchObject({ key: 'offers_failed', detail: 'Technical error' });
  });

  it('"already registered with the lender" is no offers, not a failure', () => {
    expect(status({ account: account({ application: app('failed', 'duplicate') }) }))
      .toMatchObject({ key: 'no_offers', detail: 'Already registered with the lender' });
  });

  it('a lender push that changed only the state does not hide the result of the offers check', () => {
    // Stored on prod: under_review (set by the bureau push) with the reason "not_eligible" and no lender application.
    expect(status({ account: account({ application: app('under_review', 'not_eligible') }) }).key).toBe('no_offers');
    expect(status({ account: account({ application: app('under_review') }) }).key).toBe('checking_offers');
    expect(status({ account: account({ application: app('handoff') }) }).key).toBe('checking_offers');
  });

  it('"offers ready" with no offers claims nothing: falls back to the account', () => {
    expect(status({ account: account({ panOnFile: true, application: app('offers_ready', null, 0) }) }).key).toBe('pan_verified');
  });

  it('a lender application wins over the application, and names the lender', () => {
    const s = status({ account: account({ application: app('rejected', 'not_eligible'), lenderApplications: [{ status: 'handoff', lenderName: 'Acme Finance' }] }) });
    expect(s).toMatchObject({ key: 'applied', label: 'Applied with a lender', detail: 'Acme Finance' });
    // "offers_ready" on a lender application = tapped Apply, the lender has said nothing yet.
    expect(status({ account: account({ lenderApplications: [{ status: 'offers_ready', lenderName: null }] }) })).toMatchObject({ key: 'applied', detail: null });
  });

  it('several lenders: the furthest one decides', () => {
    const many = (...s: string[]) => s.map((st, i) => ({ status: st, lenderName: `Lender ${i + 1}` }));
    expect(status({ account: account({ lenderApplications: many('handoff', 'under_review') }) })).toMatchObject({ key: 'under_review', detail: 'Lender 2 +1 more' });
    expect(status({ account: account({ lenderApplications: many('rejected', 'approved', 'under_review') }) }).key).toBe('approved');
    expect(status({ account: account({ lenderApplications: many('approved', 'disbursed') }) }).key).toBe('disbursed');
    expect(status({ account: account({ lenderApplications: many('closed') }) }).key).toBe('disbursed');
    // a rejection or failure shows only when nothing better exists
    expect(status({ account: account({ lenderApplications: many('rejected', 'handoff') }) }).key).toBe('applied');
    expect(status({ account: account({ lenderApplications: many('rejected', 'failed') }) }).key).toBe('lender_rejected');
    expect(status({ account: account({ lenderApplications: many('failed') }) }).key).toBe('lender_failed');
  });

  it('the same lender applied to twice is not "+1 more"', () => {
    const s = status({ account: account({ lenderApplications: [{ status: 'handoff', lenderName: 'Acme' }, { status: 'handoff', lenderName: 'Acme' }] }) });
    expect(s.detail).toBe('Acme');
  });

  it('old application states with no lender application still read sensibly', () => {
    expect(status({ account: account({ application: app('approved') }) }).key).toBe('approved');
    expect(status({ account: account({ application: app('disbursed') }) }).key).toBe('disbursed');
    expect(status({ account: account({ application: app('closed') }) }).key).toBe('disbursed');
  });

  it('no account: the journey stage, limited to the stages that need no account', () => {
    expect(status({ stage: 'lead_captured' }).key).toBe('lead_captured');
    expect(status({ stage: 'contacted' }).key).toBe('contacted');
    expect(status({ stage: 'app_installed' }).key).toBe('app_installed');
    expect(status({ stage: 'application_submitted' }).key).toBe('lead_captured');
  });

  it('linked to an account that no longer exists: account deleted', () => {
    expect(status({ stage: 'application_submitted', accountDeleted: true })).toMatchObject({ key: 'account_deleted', label: 'Account deleted' });
  });

  it('do-not-contact always shows, whatever else is stored', () => {
    expect(status({ stage: 'lost', account: account({ lenderApplications: [{ status: 'approved', lenderName: 'Acme' }] }) }).key).toBe('lost');
    expect(status({ stage: 'lost' }).key).toBe('lost');
  });
});

describe('the status list', () => {
  it('has one entry per key, each with a label and a colour', () => {
    const keys = CUSTOMER_STATUSES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of CUSTOMER_STATUSES) {
      expect(s.label.trim()).not.toBe('');
      expect(['green', 'blue', 'amber', 'red', 'grey', 'teal']).toContain(s.tone);
    }
  });
  it('recognises its own keys only', () => {
    expect(isCustomerStatusKey('no_offers')).toBe(true);
    expect(isCustomerStatusKey('application_submitted')).toBe(false);
    expect(isCustomerStatusKey(undefined)).toBe(false);
  });
  it('words the reason', () => {
    expect(noOffersReasonLabel('not_eligible')).toBe('Not eligible');
    expect(noOffersReasonLabel('some_new_reason')).toBe('Some new reason');
    expect(noOffersReasonLabel(null)).toBeNull();
  });
});
