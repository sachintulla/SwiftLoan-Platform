// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitLead, updateLeadAmount } from './leads';

// Amounts are whole rupees end to end: what the visitor picks is exactly what is sent, stored and shown.
describe('lead amount is sent in whole rupees', () => {
  const sent: Array<{ url: string; body: any }> = [];

  beforeEach(() => {
    sent.length = 0;
    (window as unknown as { SWIFTLOAN_API_BASE?: string }).SWIFTLOAN_API_BASE = 'https://api.test';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ data: { token: 'T', deepLink: '', landingUrl: '', contextApkUrl: '', context: {} } }) };
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { SWIFTLOAN_API_BASE?: string }).SWIFTLOAN_API_BASE;
  });

  it('₹10,40,000 is sent as 1040000, not 104000000', async () => {
    await submitLead({ name: 'A', phone: '9000000000', product: 'Personal Loan', amountRupees: 1040000 }, 'SL-1');
    expect(sent[0].url).toBe('https://api.test/api/context/create');
    expect(sent[0].body.amount).toBe(1040000);
    expect(sent[0].body.summary).toContain('₹10,40,000');
  });

  it('the corrected amount (Hero slider) is also whole rupees', async () => {
    await updateLeadAmount('9000000000', 750000);
    expect(sent[0].url).toBe('https://api.test/api/website/lead/amount');
    expect(sent[0].body.amount).toBe(750000);
  });
});
