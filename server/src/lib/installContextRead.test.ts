import { describe, it, expect } from 'vitest';
import {
  normaliseRef, refLookupVariants, classifyConfidence, parseInstallLinkPayload, historyToSend, pickContext, productLabel,
  applyInstallFilters, computeInstallStats, reachedNextStep, needsFollowUp, hasCustomerDetails, effectiveSentBy, countBy,
  type ContextSources, type InstallRow,
} from './installContextRead.js';

const base: ContextSources = { ref: 'AB12CD34', source: 'campaign', campaignId: null };

describe('normaliseRef', () => {
  it('trims and upper-cases a token', () => {
    expect(normaliseRef('  ab12cd34 ')).toBe('AB12CD34');
  });
  it('rejects empty, oversized, non-string and unsafe values', () => {
    expect(normaliseRef('')).toBeNull();
    expect(normaliseRef('   ')).toBeNull();
    expect(normaliseRef(null)).toBeNull();
    expect(normaliseRef(42)).toBeNull();
    expect(normaliseRef('a'.repeat(65))).toBeNull();
    expect(normaliseRef('AB 12')).toBeNull();
    expect(normaliseRef("x'; drop")).toBeNull();
  });
  it('offers the stored spelling as well when it differs', () => {
    expect(refLookupVariants('AB12CD34')).toEqual(['AB12CD34']);
    expect(refLookupVariants('diwali-sale')).toEqual(['DIWALI-SALE', 'diwali-sale']);
    expect(refLookupVariants(null)).toEqual([]);
  });
});

describe('classifyConfidence', () => {
  it('treats a click token match as confirmed', () => {
    expect(classifyConfidence('play_referrer')).toBe('confirmed');
    expect(classifyConfidence('clipboard')).toBe('confirmed');
  });
  it('treats an IP window match as probable', () => {
    expect(classifyConfidence('ip_window')).toBe('probable');
  });
  it('treats no match, or an unknown method, as none', () => {
    expect(classifyConfidence(null)).toBe('none');
    expect(classifyConfidence(undefined)).toBe('none');
    expect(classifyConfidence('something_else')).toBe('none');
  });
});

describe('units and labels', () => {
  it('a lead amount is whole rupees, shown as it is (never rescaled)', () => {
    const lead = (amountRupees: number | null) => pickContext({ ...base, lead: { name: 'L', phone: '9000000004', productInterest: 'Home Loan', amountRupees, source: 'website', createdAt: '2026-10-20T00:00:00.000Z' } })!;
    expect(lead(500000).amountRupees).toBe(500000);
    expect(lead(0).amountRupees).toBeNull();
    expect(lead(null).amountRupees).toBeNull();
  });
  it('labels products', () => {
    expect(productLabel('personal')).toBe('Personal Loan');
    expect(productLabel('Personal Loan')).toBe('Personal Loan');
    expect(productLabel('home_loan')).toBe('Home Loan');
    expect(productLabel('credit card')).toBe('Credit Card');
    expect(productLabel('')).toBeNull();
    expect(productLabel(7)).toBeNull();
  });
});

describe('parseInstallLinkPayload', () => {
  it('reads the full shape', () => {
    const p = parseInstallLinkPayload({
      v: 1, token: 'AB12CD34', customerId: 'c1', name: 'Asha', phone: '9876543210', amountRupees: 500000, product: 'personal',
      stage: 'kyc_started', channel: 'whatsapp', sentBy: { type: 'admin', id: 'a1', email: 'ops@x.in' }, sentAt: '2026-10-27T08:00:00.000Z',
    });
    expect(p).toMatchObject({ token: 'AB12CD34', name: 'Asha', amountRupees: 500000, product: 'Personal Loan', stage: 'kyc_started', channel: 'whatsapp', sentById: 'a1', sentByEmail: 'ops@x.in' });
    expect(p.sentAt).toBe('2026-10-27T08:00:00.000Z');
  });
  it('tolerates missing fields and wrong types without throwing', () => {
    expect(() => parseInstallLinkPayload(undefined)).not.toThrow();
    expect(parseInstallLinkPayload(null).name).toBeNull();
    expect(parseInstallLinkPayload('text').token).toBeNull();
    const p = parseInstallLinkPayload({ name: 12, amountRupees: '5000', product: {}, channel: 'carrier pigeon', sentBy: 'ops', sentAt: 'not a date' });
    expect(p).toEqual({
      token: null, customerId: null, name: null, phone: null, amountRupees: null, product: null, stage: null,
      channel: null, sentById: null, sentByEmail: null, sentAt: null,
    });
  });
  it('drops zero or negative amounts', () => {
    expect(parseInstallLinkPayload({ amountRupees: 0 }).amountRupees).toBeNull();
    expect(parseInstallLinkPayload({ amountRupees: -5 }).amountRupees).toBeNull();
  });
});

describe('historyToSend', () => {
  it('picks the last sent or logged step', () => {
    const h = [
      { step: 0, channel: 'sms', at: '2026-10-26T08:00:00.000Z', outcome: 'sent' },
      { step: 1, channel: 'whatsapp', at: '2026-10-26T09:00:00.000Z', outcome: 'logged' },
      { step: 2, channel: 'sms', at: '2026-10-26T10:00:00.000Z', outcome: 'failed' },
      { step: 3, channel: 'sms', at: '2026-10-26T11:00:00.000Z', outcome: 'skipped' },
    ];
    expect(historyToSend(h)).toEqual({ channel: 'whatsapp', at: '2026-10-26T09:00:00.000Z' });
  });
  it('returns null when nothing was sent, or the history is not a list', () => {
    expect(historyToSend([{ channel: 'sms', outcome: 'failed' }])).toBeNull();
    expect(historyToSend([])).toBeNull();
    expect(historyToSend(null)).toBeNull();
    expect(historyToSend({ outcome: 'sent' })).toBeNull();
  });
  it('skips junk entries and unknown channels', () => {
    expect(historyToSend([null, 5, { channel: 'email', at: 'bad', outcome: 'sent' }])).toEqual({ channel: null, at: null });
  });
});

describe('pickContext', () => {
  const all: ContextSources = {
    ...base,
    installLink: { ...parseInstallLinkPayload({ name: 'Link Name', phone: '9000000001', amountRupees: 300000, product: 'personal', stage: 'app_installed', channel: 'whatsapp', sentAt: '2026-10-27T05:00:00.000Z' }), adminLabel: 'Priya' },
    reminder: { firstName: 'Reminder', phone: '9000000002', history: [{ channel: 'sms', at: '2026-10-26T08:00:00.000Z', outcome: 'sent' }] },
    lenderNudge: { firstName: 'Lender', phone: '9000000003', lenderName: 'IDFC FIRST', history: [] },
    lead: { name: 'Lead', phone: '9000000004', productInterest: 'Home Loan', amountRupees: 100000, source: 'website', createdAt: '2026-10-20T00:00:00.000Z' },
    referral: { ownerName: 'Ravi' },
    loan: { amountRupees: 111111, loanType: 'personal' },
  };

  it('prefers an admin install link over everything else', () => {
    const c = pickContext(all)!;
    expect(c.origin).toBe('install_link');
    expect(c.name).toBe('Link Name');
    expect(c.sentBy).toEqual({ type: 'admin', label: 'Priya' });
    expect(c.sentVia).toBe('whatsapp');
    expect(c.stageWhenSent).toBe('app_installed');
    expect(c.amountRupees).toBe(300000);
  });
  it('falls through the order: reminder, lender nudge, lead, referral, campaign', () => {
    const { installLink: _a, ...noLink } = all;
    expect(pickContext(noLink)!.origin).toBe('journey_reminder');
    const { reminder: _b, ...noRem } = noLink;
    expect(pickContext(noRem)!.origin).toBe('lender_nudge');
    const { lenderNudge: _c, ...noNudge } = noRem;
    expect(pickContext(noNudge)!.origin).toBe('lead');
    const { lead: _d, ...noLead } = noNudge;
    expect(pickContext(noLead)!.origin).toBe('referral');
    const { referral: _e, ...noRef } = noLead;
    const c = pickContext(noRef)!;
    expect(c.origin).toBe('campaign');
    expect(c.sentBy.type).toBe('campaign');
  });
  it('reads the channel and time of the last reminder step', () => {
    const c = pickContext({ ...base, reminder: all.reminder })!;
    expect(c.sentBy.type).toBe('reminder');
    expect(c.sentVia).toBe('sms');
    expect(c.sentAt).toBe('2026-10-26T08:00:00.000Z');
    expect(c.name).toBe('Reminder');
  });
  it('names the lender on a lender reminder', () => {
    const c = pickContext({ ...base, lenderNudge: all.lenderNudge })!;
    expect(c.sentBy).toEqual({ type: 'lender_reminder', label: 'Lender reminder (IDFC FIRST)' });
  });
  it('keeps lead and LoanApplication amounts as whole rupees', () => {
    const lead = pickContext({ ...base, lead: all.lead })!;
    expect(lead.amountRupees).toBe(100000);
    expect(lead.product).toBe('Home Loan');
    expect(lead.stageWhenSent).toBe('lead_captured');
    expect(lead.sentBy.type).toBe('website');
    // a reminder has no amount of its own, so the loan application fills it in, in rupees
    const rem = pickContext({ ...base, reminder: all.reminder, loan: { amountRupees: 250000, loanType: 'personal' } })!;
    expect(rem.amountRupees).toBe(250000);
    expect(rem.product).toBe('Personal Loan');
  });
  it('does not let a loan application create a context on its own', () => {
    expect(pickContext({ ref: null, source: 'organic', campaignId: null, loan: { amountRupees: 5000, loanType: 'personal' } })).toBeNull();
  });
  it('labels leads by where they came from', () => {
    const mk = (source: string) => pickContext({ ...base, lead: { ...all.lead!, source } })!;
    expect(mk('call').sentBy.type).toBe('unknown');
    expect(mk('call').sentVia).toBe('call');
    expect(mk('widget').sentBy.type).toBe('website');
    expect(mk('campaign').sentBy.type).toBe('campaign');
    expect(mk('weird').sentBy.label).toBe('Link source not recorded');
  });
  it('uses the email, then a generic label, when an admin name is not known', () => {
    const link = parseInstallLinkPayload({ sentBy: { id: 'a1', email: 'ops@x.in' } });
    expect(pickContext({ ...base, installLink: link })!.sentBy.label).toBe('ops@x.in');
    expect(pickContext({ ...base, installLink: parseInstallLinkPayload({}) })!.sentBy.label).toBe('An admin');
  });
  it('returns null for an organic install with nothing known', () => {
    expect(pickContext({ ref: null, source: 'organic', campaignId: null })).toBeNull();
  });
  it('says campaign for a link with a campaign id', () => {
    expect(pickContext({ ref: null, source: 'campaign', campaignId: 'diwali' })!.sentBy.label).toBe('Campaign diwali');
  });
});

function row(over: Partial<InstallRow> & { id: string }): InstallRow {
  return {
    installedAt: '2026-10-27T00:00:00.000Z', platform: 'android', source: 'organic', campaignId: null, matchMethod: 'play_referrer',
    confidence: 'confirmed', customer: null, context: null, signedIn: false, ...over,
  };
}
const cust = (stage: string, name: string, phone: string) => ({ id: `c-${name}`, userId: `u-${name}`, name, phone, stage, stageLabel: stage });
const ctx = (type: 'admin' | 'reminder' | 'campaign', via: 'whatsapp' | 'sms' | null, name: string | null = null) => ({
  name, phone: null, amountRupees: null, product: null, stageWhenSent: null, sentVia: via, sentAt: null,
  sentBy: { type, label: type }, origin: (type === 'admin' ? 'install_link' : type === 'reminder' ? 'journey_reminder' : 'campaign') as 'install_link' | 'journey_reminder' | 'campaign',
});

describe('applyInstallFilters', () => {
  const rows: InstallRow[] = [
    row({ id: '1', customer: cust('app_installed', 'Asha Verma', '9876543210'), context: ctx('admin', 'whatsapp', 'Asha'), signedIn: true }),
    row({ id: '2', customer: cust('kyc_started', 'Ravi Kumar', '9123456780'), context: ctx('reminder', 'sms', 'Ravi'), signedIn: true, platform: 'ios' }),
    row({ id: '3', customer: cust('lead_captured', 'Meera', '9000011111'), context: ctx('campaign', null), signedIn: true }),
    row({ id: '4' }),
  ];
  const ids = (f: Parameters<typeof applyInstallFilters>[1]) => applyInstallFilters(rows, f).map((r) => r.id);

  it('returns everything with no filters', () => expect(ids({})).toEqual(['1', '2', '3', '4']));
  it('filters by stage', () => expect(ids({ stage: 'kyc_started' })).toEqual(['2']));
  it('filters by sender, treating no context as organic', () => {
    expect(ids({ sentBy: 'admin' })).toEqual(['1']);
    expect(ids({ sentBy: 'reminder' })).toEqual(['2']);
    expect(ids({ sentBy: 'organic' })).toEqual(['4']);
  });
  it('filters by channel', () => {
    expect(ids({ channel: 'whatsapp' })).toEqual(['1']);
    expect(ids({ channel: 'sms' })).toEqual(['2']);
    expect(ids({ channel: 'call' })).toEqual([]);
  });
  it('filters by platform', () => expect(ids({ platform: 'ios' })).toEqual(['2']));
  it('searches by name, case insensitive, in the customer or the context name', () => {
    expect(ids({ search: 'asha' })).toEqual(['1']);
    expect(ids({ search: 'KUMAR' })).toEqual(['2']);
    expect(ids({ search: 'zzz' })).toEqual([]);
  });
  it('searches by mobile, ignoring spaces and the country code', () => {
    expect(ids({ search: '98765' })).toEqual(['1']);
    expect(ids({ search: '+91 98765 43210' })).toEqual(['1']);
    expect(ids({ search: '9123456780' })).toEqual(['2']);
    expect(ids({ search: '98 76' })).toEqual(['1']);
  });
  it('treats a single digit as too short to be a mobile search', () => expect(ids({ search: '9' })).toEqual([]));
  it('keeps installs where the customer is still at install or lead stage for follow up', () => {
    expect(ids({ followUp: true })).toEqual(['1', '3']);
  });
  it('combines filters', () => expect(ids({ followUp: true, sentBy: 'admin', search: 'asha' })).toEqual(['1']));
});

describe('stats and counts', () => {
  const rows: InstallRow[] = [
    row({ id: '1', customer: cust('app_installed', 'A', '1'), context: ctx('admin', 'whatsapp'), signedIn: true }),
    row({ id: '2', customer: cust('kyc_started', 'B', '2'), context: ctx('reminder', 'sms'), signedIn: true }),
    row({ id: '3', customer: cust('rejected', 'C', '3'), context: ctx('campaign', null), signedIn: true }),
    row({ id: '4' }),
  ];
  it('counts installs with details, moves and sign-ins', () => {
    expect(computeInstallStats(rows)).toEqual({ total: 4, withContext: 2, withoutContext: 2, reachedNextStep: 2, notSignedIn: 1 });
  });
  it('knows which stages are past install', () => {
    expect(reachedNextStep('app_installed')).toBe(false);
    expect(reachedNextStep('lead_captured')).toBe(false);
    expect(reachedNextStep('lost')).toBe(false);
    expect(reachedNextStep('registered')).toBe(true);
    expect(reachedNextStep('rejected')).toBe(true);
    expect(reachedNextStep(null)).toBe(false);
  });
  it('flags follow up only when a customer is known', () => {
    expect(needsFollowUp({ customer: null })).toBe(false);
    expect(needsFollowUp(rows[0])).toBe(true);
  });
  it('treats campaign context as not personal', () => {
    expect(hasCustomerDetails(rows[2].context)).toBe(false);
    expect(hasCustomerDetails(null)).toBe(false);
    expect(effectiveSentBy(null)).toBe('organic');
  });
  it('counts by key, largest first', () => {
    expect(countBy(rows, (r) => effectiveSentBy(r.context))).toEqual([
      { key: 'admin', count: 1 }, { key: 'campaign', count: 1 }, { key: 'organic', count: 1 }, { key: 'reminder', count: 1 },
    ]);
    expect(countBy([1, 1, 2], String)[0]).toEqual({ key: '1', count: 2 });
  });
});
