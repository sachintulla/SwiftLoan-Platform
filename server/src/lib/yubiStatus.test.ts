import { describe, it, expect } from 'vitest';
import { appendYubiHistory, nextYubiHistory, readYubiHistory, yubiAsLenderFact, yubiOutcome, yubiStatusAdvances, yubiStatusLabel } from './yubiStatus.js';

describe('yubi statuses', () => {
  it('says every status Yubi sent on the 26 Nov 2026 disbursal in plain words', () => {
    expect(['NEW_APPLICATION', 'READY_FOR_UNDERWRITING', 'APPLICATION_SANCTIONED', 'SANCTION_GENERATED', 'SIGNING_INITIATED', 'AGREEMENT_SIGNED', 'READY_FOR_DISBURSEMENT', 'DISBURSED'].map(yubiStatusLabel))
      .toEqual(['Application started', 'With the lender for a decision', 'Sanctioned', 'Sanction letter issued', 'Agreement sent for signing', 'Agreement signed', 'Ready for disbursement', 'Disbursed']);
    expect(yubiStatusLabel(null)).toBe('Waiting for Yubi');
    expect(yubiStatusLabel('SOME_NEW_CODE')).toBe('Some new code');
  });

  it('reads what each status means', () => {
    expect(yubiOutcome('DISBURSED')).toBe('disbursed');
    for (const s of ['APPLICATION_SANCTIONED', 'SANCTION_GENERATED', 'SIGNING_INITIATED', 'AGREEMENT_SIGNED', 'READY_FOR_DISBURSEMENT', 'APPROVED']) expect(yubiOutcome(s)).toBe('approved');
    expect(yubiOutcome('NEW_APPLICATION')).toBe('in_progress');
    expect(yubiOutcome('ready_for_underwriting')).toBe('in_progress');
    expect(yubiOutcome('APPLICATION_REJECTED')).toBe('rejected');
    expect(yubiOutcome('LEAD_REJECTED')).toBe('no_offers'); // the lead was not taken: not a rejected application
    expect(yubiOutcome('NO_OFFERS')).toBe('no_offers');
    expect(yubiOutcome('NEW_LEAD')).toBe('lead');
    expect(yubiOutcome('SOMETHING_ELSE')).toBeNull();
    expect(yubiOutcome(null)).toBeNull();
  });

  it('a status only moves forward, and a disbursed referral stays disbursed', () => {
    expect(yubiStatusAdvances(null, 'NEW_LEAD')).toBe(true);
    expect(yubiStatusAdvances('NEW_APPLICATION', 'APPLICATION_SANCTIONED')).toBe(true);
    expect(yubiStatusAdvances('SIGNING_INITIATED', 'AGREEMENT_SIGNED')).toBe(true); // same meaning, later step
    expect(yubiStatusAdvances('AGREEMENT_SIGNED', 'DISBURSED')).toBe(true);
    // The poll answering an old step after the webhook said disbursed (seen on prod) must not undo it.
    expect(yubiStatusAdvances('DISBURSED', 'NEW_APPLICATION')).toBe(false);
    expect(yubiStatusAdvances('APPLICATION_SANCTIONED', 'NEW_APPLICATION')).toBe(false);
    expect(yubiStatusAdvances('NEW_APPLICATION', 'NEW_APPLICATION')).toBe(false);
    expect(yubiStatusAdvances('NEW_APPLICATION', '')).toBe(false);
    // A code we do not know cannot be ranked: accept it.
    expect(yubiStatusAdvances('NEW_APPLICATION', 'SOME_NEW_CODE')).toBe(true);
  });

  it('keeps each step once, with when it came and from where', () => {
    const t1 = new Date('2026-11-26T15:00:02Z'); const t2 = new Date('2026-11-26T17:15:43Z');
    let h = appendYubiHistory(null, 'NEW_APPLICATION', t1, 'webhook');
    h = appendYubiHistory(h, 'NEW_APPLICATION', t2, 'poll'); // the same step again
    h = appendYubiHistory(h, 'DISBURSED', t2, 'webhook');
    h = appendYubiHistory(h, '', t2, 'webhook');
    expect(h).toEqual([
      { status: 'NEW_APPLICATION', at: '2026-11-26T15:00:02.000Z', source: 'webhook' },
      { status: 'DISBURSED', at: '2026-11-26T17:15:43.000Z', source: 'webhook' },
    ]);
    expect(readYubiHistory('rubbish')).toEqual([]);
    expect(readYubiHistory([{ status: 'X' }, null, { status: 'Y', at: 'z', source: 'other' }])).toEqual([{ status: 'Y', at: 'z', source: 'webhook' }]);
  });

  it('is a lender application for the customer status only once there is an application', () => {
    expect(yubiAsLenderFact('DISBURSED', null)).toEqual({ status: 'disbursed', lenderName: 'Yubi' });
    expect(yubiAsLenderFact('AGREEMENT_SIGNED', 'Acme Finance')).toEqual({ status: 'approved', lenderName: 'Acme Finance (Yubi)' });
    expect(yubiAsLenderFact('NEW_APPLICATION', null)).toEqual({ status: 'under_review', lenderName: 'Yubi' });
    expect(yubiAsLenderFact('APPLICATION_REJECTED', null)).toEqual({ status: 'rejected', lenderName: 'Yubi' });
    for (const s of ['NEW_LEAD', 'OFFER_GENERATED', 'NO_OFFERS', 'LEAD_REJECTED', null, 'SOME_NEW_CODE']) expect(yubiAsLenderFact(s, null)).toBeNull();
  });

  it('a referral from before the history starts with the status it already had; a late older step adds nothing', () => {
    const was = new Date('2026-11-26T15:00:02Z'); const now = new Date('2026-11-26T17:15:43Z');
    const ref = { statusHistory: null, lastStatus: 'NEW_APPLICATION', updatedAt: was };
    const h = nextYubiHistory(ref, 'DISBURSED', now, 'webhook');
    expect(h.map((e) => e.status)).toEqual(['NEW_APPLICATION', 'DISBURSED']);
    expect(h[0].at).toBe('2026-11-26T15:00:02.000Z');
    // The poll answers an older step afterwards: nothing is added.
    const after = { statusHistory: h, lastStatus: 'DISBURSED', updatedAt: now };
    expect(nextYubiHistory(after, 'NEW_APPLICATION', now, 'poll')).toEqual(h);
    // The very first status of a new referral.
    expect(nextYubiHistory({ statusHistory: null, lastStatus: null, updatedAt: was }, 'NEW_LEAD', now, 'webhook').map((e) => e.status)).toEqual(['NEW_LEAD']);
  });
});
