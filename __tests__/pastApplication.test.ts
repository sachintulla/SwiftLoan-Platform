import { offersViewFor, pickOffersApplication, unappliedOffers } from '../src/utils/pastApplication';

// Applications are given newest first, as GET /applications returns them.
const open = { id: 'o-open', applied: false };
const done = { id: 'o-done', applied: true };

describe('UC-O1 what My Offers shows for an account (same before and after a logout → login)', () => {
  it('never applied: the first-time screen', () => {
    expect(offersViewFor([])).toEqual({ kind: 'first_time' });
  });

  it('an unfinished draft alone is still first time', () => {
    expect(offersViewFor([{ id: 'a1', status: 'draft', offers: [] }]).kind).toBe('first_time');
    expect(offersViewFor([{ id: 'a1', status: 'prequalifying', offers: [] }]).kind).toBe('first_time');
  });

  it('offers not applied to: shows them', () => {
    const app = { id: 'a1', status: 'offers_ready', offers: [open, done] };
    const view = offersViewFor([app]);
    expect(view).toEqual({ kind: 'offers', application: app });
    expect(unappliedOffers(app)).toEqual([open]);
  });

  it('the check found no offers: remembered, with the server reason', () => {
    const rejected = { id: 'a1', status: 'rejected', prequalifyReason: 'not_eligible', offers: [] };
    expect(offersViewFor([rejected])).toEqual({ kind: 'no_offers', application: rejected, reason: 'not_eligible' });
    const dup = { id: 'a2', status: 'failed', prequalifyReason: 'duplicate', offers: [] };
    expect(offersViewFor([dup])).toEqual({ kind: 'no_offers', application: dup, reason: 'duplicate' });
    const tech = { id: 'a3', status: 'failed', prequalifyReason: 'technical', offers: [] };
    expect(offersViewFor([tech])).toEqual({ kind: 'no_offers', application: tech, reason: 'technical' });
  });

  it('no reason stored: falls back to the status', () => {
    expect(offersViewFor([{ id: 'a1', status: 'rejected', offers: [] }])).toMatchObject({ kind: 'no_offers', reason: 'not_eligible' });
    expect(offersViewFor([{ id: 'a1', status: 'failed', prequalifyReason: null, offers: [] }])).toMatchObject({ kind: 'no_offers', reason: 'technical' });
  });

  it('applied to every offer: points to My Loans, not the first-time screen', () => {
    const app = { id: 'a1', status: 'handoff', offers: [done] };
    expect(offersViewFor([app])).toEqual({ kind: 'applied', application: app });
  });

  it('no offers, then went ahead with a partner lender: applied', () => {
    const app = { id: 'a1', status: 'rejected', prequalifyReason: 'not_eligible', offers: [], partnerReferrals: [{ id: 'r1' }] };
    expect(offersViewFor([app]).kind).toBe('applied');
  });

  it('a lender application or a loan counts as applied', () => {
    expect(offersViewFor([{ id: 'a1', status: 'under_review', offers: [], lenderApplications: [{ id: 'l1' }] }]).kind).toBe('applied');
    expect(offersViewFor([{ id: 'a1', status: 'disbursed', offers: [], loan: { id: 'ln1' } }]).kind).toBe('applied');
  });

  it('open offers on an older application win over a newer no-offers result', () => {
    const newer = { id: 'a2', status: 'rejected', prequalifyReason: 'not_eligible', offers: [] };
    const older = { id: 'a1', status: 'offers_ready', offers: [open] };
    expect(offersViewFor([newer, older])).toEqual({ kind: 'offers', application: older });
  });

  it('otherwise the newest finished application decides; drafts are skipped', () => {
    const draft = { id: 'a3', status: 'draft', offers: [] };
    const rejected = { id: 'a2', status: 'rejected', prequalifyReason: 'not_eligible', offers: [] };
    const applied = { id: 'a1', status: 'handoff', offers: [done] };
    expect(offersViewFor([draft, rejected, applied])).toMatchObject({ kind: 'no_offers', application: rejected });
    expect(offersViewFor([draft, applied, rejected])).toMatchObject({ kind: 'applied', application: applied });
  });

  it('a live status is preferred when two applications have open offers', () => {
    const stale = { id: 'a2', status: 'failed', offers: [open] };
    const live = { id: 'a1', status: 'offers_ready', offers: [open] };
    expect(pickOffersApplication([stale, live])).toBe(live);
    expect(pickOffersApplication([stale])).toBe(stale);
    expect(pickOffersApplication([{ id: 'a1', status: 'handoff', offers: [done] }])).toBeUndefined();
  });
});
