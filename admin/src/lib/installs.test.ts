import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INSTALL_PERIOD, INSTALL_PERIODS, computeInstallRange, rangeError, buildInstallsQuery, hasActiveFilters, EMPTY_INSTALL_FILTERS,
  loanDetailsText, hasLoanDetails, linkSentText, stageWhenSentNote, matchedByText, followUpDisabledReason, listState, emptyNoneText,
  percentOf, barWidth, sentByLabel, platformLabel, channelLabel, type InstallContext, type InstallRow,
} from './installs';

const ctx = (over: Partial<InstallContext> = {}): InstallContext => ({
  name: 'Asha', phone: '9876543210', amountRupees: 500000, product: 'Personal Loan', stageWhenSent: 'app_installed', sentVia: 'whatsapp',
  sentAt: '2026-10-27T05:00:00.000Z', sentBy: { type: 'admin', label: 'Priya' }, origin: 'install_link', ...over,
});

describe('periods', () => {
  it('defaults to the last 7 days', () => {
    expect(DEFAULT_INSTALL_PERIOD).toBe('7d');
    expect(INSTALL_PERIODS.find((p) => p.key === DEFAULT_INSTALL_PERIOD)?.label).toBe('Last 7 days');
  });
  const now = new Date(2026, 9, 27, 15, 30, 0); // local time
  it('computes the last 7 days with no upper bound', () => {
    const r = computeInstallRange('7d', '', '', now);
    expect(r.to).toBeUndefined();
    expect(new Date(r.from!).getTime()).toBe(new Date(2026, 9, 20, 15, 30, 0).getTime());
  });
  it('computes today from local midnight', () => {
    const r = computeInstallRange('today', '', '', now);
    expect(new Date(r.from!).getTime()).toBe(new Date(2026, 9, 27, 0, 0, 0).getTime());
    expect(r.to).toBeUndefined();
  });
  it('computes yesterday as a full local day', () => {
    const r = computeInstallRange('yesterday', '', '', now);
    expect(new Date(r.from!).getTime()).toBe(new Date(2026, 9, 26, 0, 0, 0).getTime());
    expect(new Date(r.to!).getTime()).toBe(new Date(2026, 9, 27, 0, 0, 0).getTime());
  });
  it('has no bounds for all time', () => expect(computeInstallRange('all')).toEqual({}));
  it('uses the whole of the chosen days for a custom range', () => {
    const r = computeInstallRange('custom', '2026-10-01', '2026-10-05', now);
    expect(new Date(r.from!).getTime()).toBe(new Date(2026, 9, 1, 0, 0, 0).getTime());
    expect(new Date(r.to!).getTime()).toBe(new Date(2026, 9, 5, 23, 59, 59, 999).getTime());
    expect(computeInstallRange('custom', '', '', now)).toEqual({});
  });
  it('rejects a From date after the To date', () => {
    expect(rangeError('2026-10-05', '2026-10-01')).toBe('From must be on or before To.');
    expect(rangeError('2026-10-01', '2026-10-01')).toBeNull();
    expect(rangeError('', '2026-10-01')).toBeNull();
  });
});

describe('query building', () => {
  it('sends only what is set', () => {
    expect(buildInstallsQuery(EMPTY_INSTALL_FILTERS, {}, 1)).toBe('page=1&pageSize=20');
  });
  it('sends every filter', () => {
    const q = new URLSearchParams(buildInstallsQuery(
      { search: ' asha ', stage: 'kyc_started', sentBy: 'admin', channel: 'whatsapp', platform: 'ios', followUp: true },
      { from: '2026-10-20T00:00:00.000Z', to: '2026-10-27T00:00:00.000Z' }, 3, 50,
    ));
    expect(Object.fromEntries(q)).toEqual({
      page: '3', pageSize: '50', from: '2026-10-20T00:00:00.000Z', to: '2026-10-27T00:00:00.000Z',
      search: 'asha', stage: 'kyc_started', sentBy: 'admin', channel: 'whatsapp', platform: 'ios', followUp: '1',
    });
  });
  it('knows when a filter is active', () => {
    expect(hasActiveFilters(EMPTY_INSTALL_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_INSTALL_FILTERS, search: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_INSTALL_FILTERS, followUp: true })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_INSTALL_FILTERS, platform: 'ios' })).toBe(true);
  });
});

describe('row wording', () => {
  it('describes the loan details', () => {
    expect(loanDetailsText(ctx())).toBe('Asked for ₹5,00,000 Personal Loan');
    expect(loanDetailsText(ctx({ product: null }))).toBe('Asked for ₹5,00,000');
    expect(loanDetailsText(ctx({ amountRupees: null }))).toBe('Interested in Personal Loan');
    expect(loanDetailsText(ctx({ amountRupees: null, product: null }))).toBe('No details were sent');
    expect(loanDetailsText(null)).toBe('No details were sent');
    expect(hasLoanDetails(ctx())).toBe(true);
    expect(hasLoanDetails(null)).toBe(false);
  });
  it('says who sent the link and how', () => {
    expect(linkSentText(ctx())).toEqual({ text: 'WhatsApp by Priya', recorded: true });
    expect(linkSentText(ctx({ sentVia: null }))).toEqual({ text: 'Sent by Priya', recorded: true });
    expect(linkSentText(ctx({ sentVia: 'sms', sentBy: { type: 'reminder', label: 'Automatic install reminder' } })))
      .toEqual({ text: 'SMS from Automatic install reminder', recorded: true });
    expect(linkSentText(ctx({ sentVia: null, sentBy: { type: 'campaign', label: 'Campaign diwali' } })))
      .toEqual({ text: 'Campaign diwali', recorded: true });
  });
  it('says the source is not recorded when it is not', () => {
    expect(linkSentText(null)).toEqual({ text: 'Link source not recorded', recorded: false });
    expect(linkSentText(ctx({ sentVia: null, sentBy: { type: 'unknown', label: 'x' } }))).toEqual({ text: 'Link source not recorded', recorded: false });
    expect(linkSentText(ctx({ sentBy: { type: 'organic', label: 'x' } })).recorded).toBe(false);
  });
  it('notes the stage when it has moved on, and not otherwise', () => {
    const name = (k: string) => (k === 'app_installed' ? 'App installed' : k);
    expect(stageWhenSentNote(ctx(), 'kyc_started', name)).toBe('Was at App installed when sent');
    expect(stageWhenSentNote(ctx(), 'app_installed', name)).toBeNull();
    expect(stageWhenSentNote(ctx({ stageWhenSent: null }), 'kyc_started', name)).toBeNull();
    expect(stageWhenSentNote(null, 'kyc_started', name)).toBeNull();
    expect(stageWhenSentNote(ctx(), null, name)).toBeNull();
  });
  it('explains the match in plain words', () => {
    expect(matchedByText('play_referrer', true)).toMatch(/Google Play/);
    expect(matchedByText('clipboard', true)).toMatch(/iPhone/);
    expect(matchedByText('ip_window', true)).toMatch(/^Probable match only/);
    expect(matchedByText(null, true)).toMatch(/signed in/);
    expect(matchedByText(null, false)).toBe('Not matched to a link or a customer');
  });
  it('labels senders, platforms and channels', () => {
    expect(sentByLabel('lender_reminder')).toBe('Lender reminder');
    expect(sentByLabel('mystery')).toBe('Not recorded');
    expect(platformLabel('ios')).toBe('iPhone');
    expect(platformLabel('android')).toBe('Android');
    expect(platformLabel('')).toBe('Unknown');
    expect(channelLabel('sms')).toBe('SMS');
    expect(channelLabel(null)).toBe('');
  });
});

describe('followUpDisabledReason', () => {
  const row = (customer: InstallRow['customer'], confidence: InstallRow['confidence'] = 'confirmed') => ({ customer, confidence });
  const c = (over: Partial<NonNullable<InstallRow['customer']>> = {}) => ({ id: 'c1', userId: 'u1', name: 'Asha', phone: '9876543210', stage: 'app_installed', stageLabel: 'App installed', ...over });
  it('is null for a confirmed customer with a phone mid journey', () => expect(followUpDisabledReason(row(c()))).toBeNull());
  it('says when there is no customer', () => expect(followUpDisabledReason(row(null))).toBe('Not matched to a customer'));
  it('refuses a probable match', () => {
    expect(followUpDisabledReason(row(c(), 'probable'))).toBe('Probable match only. Confirm the customer before messaging.');
  });
  it('says when there is no phone number', () => expect(followUpDisabledReason(row(c({ phone: null })))).toBe('No phone number'));
  it('says when the journey is finished', () => {
    for (const stage of ['disbursed', 'rejected', 'lost']) expect(followUpDisabledReason(row(c({ stage })))).toBe('Finished the journey');
  });
  it('checks the customer before the confidence', () => {
    expect(followUpDisabledReason(row(null, 'probable'))).toBe('Not matched to a customer');
  });
});

describe('page state', () => {
  it('shows the error rather than an empty list', () => {
    expect(listState({ loading: false, error: new Error('x'), total: 0, filtersActive: false })).toBe('error');
    expect(listState({ loading: true, error: new Error('x'), total: 0, filtersActive: false })).toBe('error');
  });
  it('covers loading, loaded and both empty cases', () => {
    expect(listState({ loading: true, error: null, total: 0, filtersActive: false })).toBe('loading');
    expect(listState({ loading: false, error: null, total: 4, filtersActive: true })).toBe('loaded');
    expect(listState({ loading: false, error: null, total: 0, filtersActive: true })).toBe('empty_filtered');
    expect(listState({ loading: false, error: null, total: 0, filtersActive: false })).toBe('empty_none');
  });
  it('words the empty text by period', () => {
    expect(emptyNoneText('today')).toBe('No installs today yet. Try Last 30 days.');
    expect(emptyNoneText('7d')).toBe('No installs in this period yet. Try Last 30 days.');
  });
  it('computes percentages and bar widths', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(1, 0)).toBe(0);
    expect(barWidth(10, 10)).toBe(100);
    expect(barWidth(5, 10)).toBe(50);
    expect(barWidth(1, 1000)).toBe(4);
    expect(barWidth(0, 10)).toBe(0);
    expect(barWidth(3, 0)).toBe(0);
  });
});
