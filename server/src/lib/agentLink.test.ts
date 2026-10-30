import { describe, it, expect } from 'vitest';
import { planAgentLink } from './agentLink.js';

describe('planAgentLink: which existing message a "send me the link" request gets', () => {
  it('stopped before PAN (OTP only) → the "continue" message, calling the step PAN verification, with the link', () => {
    expect(planAgentLink({ status: null, inApp: false, hasToken: true })).toEqual({
      ok: true, kind: 'continue', withLink: true, status: null, stepLabel: 'PAN verification',
    });
  });

  it('PAN verified, details not filled → "continue" with the link, step called Basic details', () => {
    expect(planAgentLink({ status: 'pan_verified', inApp: false, hasToken: true })).toMatchObject({
      ok: true, kind: 'continue', withLink: true, stepLabel: 'Basic details',
    });
  });

  it('details filled → "continue", step called Finding offers', () => {
    expect(planAgentLink({ status: 'application_filled', inApp: false, hasToken: true })).toMatchObject({ ok: true, kind: 'continue', stepLabel: 'Finding offers' });
  });

  it('offers came and none picked → the "offers ready" message', () => {
    expect(planAgentLink({ status: 'offers_not_applied', inApp: false, hasToken: true })).toMatchObject({ ok: true, kind: 'apply_offers', withLink: true });
  });

  it('someone already in the app gets the no-link variant (no token needed)', () => {
    expect(planAgentLink({ status: 'pan_verified', inApp: true, hasToken: false })).toMatchObject({ ok: true, kind: 'continue', withLink: false });
  });

  it('not in the app and no website reference to carry → refuses rather than sending a link-less message', () => {
    expect(planAgentLink({ status: 'pan_verified', inApp: false, hasToken: false })).toEqual({ ok: false, reason: 'no_link_to_carry' });
    expect(planAgentLink({ status: null, inApp: false, hasToken: false })).toEqual({ ok: false, reason: 'no_link_to_carry' });
  });

  it('no offers / applied / finished / failed → no link is the next step', () => {
    for (const status of ['rejected', 'applied', 'finished', 'failed'] as const) {
      expect(planAgentLink({ status, inApp: false, hasToken: true })).toEqual({ ok: false, reason: 'no_link_needed' });
    }
  });

  it('an operator-renamed step label is used', () => {
    expect(planAgentLink({ status: 'pan_verified', inApp: false, hasToken: true, labels: { pan_verified: 'Your details' } })).toMatchObject({ stepLabel: 'Your details' });
  });
});

import { outboundView, type UserContext } from './userContext.js';

describe('outboundView: what the reminder agent may see of a customer', () => {
  const full = {
    hasHistory: true,
    profile: { name: 'A B', email: 'a@b.c', phone: '9000000001', dob: '2001-09-15', gender: 'male', city: 'X', pincode: '500001', employment: 'salaried', monthlyIncome: 40000, panOnFile: true },
    applicantDraft: { company: 'Acme', addressLine1: 'HNo 1', residenceType: 'own' },
    applicationStatus: 'pan_pending', applicationStatusLabel: 'PAN verification pending',
    inquiries: [{ product: 'Personal Loan', amount: 1235000 }],
    application: { id: 'i', ref: 'SL-1', status: 'pan_pending', amount: 525000, loanType: 'personal', tenureMonths: 12, offers: [] },
    loan: null,
  } as unknown as UserContext;

  it('keeps where they stand and drops every personal detail', () => {
    const v = outboundView(full);
    expect(v).toEqual({
      hasHistory: true, applicationStatus: 'pan_pending', applicationStatusLabel: 'PAN verification pending',
      panOnFile: true, application: { ref: 'SL-1', status: 'pan_pending', offerCount: 0 }, hasLoan: false,
    });
    const text = JSON.stringify(v);
    for (const secret of ['2001-09-15', 'a@b.c', 'HNo 1', 'Acme', '40000', '500001']) expect(text).not.toContain(secret);
  });

  it('works for someone with no profile at all', () => {
    expect(outboundView({ hasHistory: false, profile: null, applicantDraft: null, applicationStatus: null, applicationStatusLabel: 'No application started', inquiries: [], application: null, loan: null }))
      .toMatchObject({ hasHistory: false, panOnFile: false, application: null, hasLoan: false });
  });
});
