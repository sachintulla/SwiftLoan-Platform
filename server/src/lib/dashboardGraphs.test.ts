import { describe, it, expect } from 'vitest';
import { funnelRows, outcomeOfStatus, outcomeRows, amountBandOf, amountRows, clampDays } from './dashboardGraphs.js';

describe('funnelRows', () => {
  it('gives each step its share of sign-ups, of the step before, and the people lost (production, 23 Nov 2026)', () => {
    const r = funnelRows({ signedUp: 1727, verified: 1591, checked: 1344, gotOffers: 254, applied: 208 });
    expect(r.map((x) => x.count)).toEqual([1727, 1591, 1344, 254, 208]);
    expect(r.map((x) => x.pctOfFirst)).toEqual([100, 92, 78, 15, 12]);
    expect(r.map((x) => x.pctOfPrev)).toEqual([null, 92, 84, 19, 82]);
    expect(r.map((x) => x.dropped)).toEqual([null, 136, 247, 1090, 46]);
  });
  it('never shows a later step bigger than the one before, and survives zeros', () => {
    expect(funnelRows({ signedUp: 10, verified: 12, checked: 3, gotOffers: 5, applied: 1 }).map((x) => x.count)).toEqual([10, 10, 3, 3, 1]);
    const z = funnelRows({ signedUp: 0, verified: 0, checked: 0, gotOffers: 0, applied: 0 });
    expect(z.every((x) => x.count === 0 && x.pctOfFirst === 0)).toBe(true);
  });
});

describe('outcomes', () => {
  it('puts each application status in one plain-words outcome', () => {
    expect(outcomeOfStatus('rejected')).toBe('noOffers');
    expect(outcomeOfStatus('offers_ready')).toBe('offersWaiting');
    for (const s of ['handoff', 'under_review', 'approved', 'disbursed', 'closed']) expect(outcomeOfStatus(s)).toBe('withLender');
    expect(outcomeOfStatus('failed')).toBe('failed');
    for (const s of ['draft', 'pan_pending', 'prequalifying', 'something_new']) expect(outcomeOfStatus(s)).toBe('unfinished');
  });
  it('adds up to the total', () => {
    const o = outcomeRows([{ status: 'rejected', count: 1122 }, { status: 'offers_ready', count: 111 }, { status: 'handoff', count: 44 },
      { status: 'under_review', count: 43 }, { status: 'pan_pending', count: 21 }, { status: 'failed', count: 9 }, { status: 'draft', count: 1 }]);
    expect(o.total).toBe(1351);
    expect(o.rows.map((r) => r.count)).toEqual([1122, 111, 87, 22, 9]);
    expect(o.rows[0].pct).toBe(83);
  });
});

describe('amounts', () => {
  it('bands by whole rupees, upper limit exclusive', () => {
    expect(amountBandOf(49_999)).toBe('under50k');
    expect(amountBandOf(50_000)).toBe('50kTo2L');
    expect(amountBandOf(199_999)).toBe('50kTo2L');
    expect(amountBandOf(200_000)).toBe('2LTo5L');
    expect(amountBandOf(500_000)).toBe('5LPlus');
    expect(amountBandOf(10_000_000)).toBe('5LPlus');
  });
  it('lists every band, even an empty one', () => {
    const a = amountRows([{ band: 'under50k', count: 3 }, { band: '5LPlus', count: 1 }]);
    expect(a.total).toBe(4);
    expect(a.rows.map((r) => r.count)).toEqual([3, 0, 0, 1]);
    expect(a.rows[0].pct).toBe(75);
  });
});

describe('clampDays', () => {
  it('keeps the window between 7 and 90 days, 14 by default', () => {
    expect(clampDays(undefined)).toBe(14); expect(clampDays('x')).toBe(14);
    expect(clampDays('3')).toBe(7); expect(clampDays('30')).toBe(30); expect(clampDays('400')).toBe(90);
  });
});

import { dailyWindow, peopleTotals, DAILY_MAX_DAYS } from './dashboardGraphs.js';

describe('dailyWindow', () => {
  const today = '2026-11-23';
  it('a preset is that many days ending today', () => {
    expect(dailyWindow({ days: '7' }, today)).toEqual({ from: '2026-11-17', to: '2026-11-23', days: 7 });
    expect(dailyWindow({ days: 30 }, today)).toEqual({ from: '2026-10-25', to: '2026-11-23', days: 30 });
    expect(dailyWindow({ days: '90' }, today).days).toBe(90);
  });
  it('falls back to 7 days when nothing readable is given', () => {
    expect(dailyWindow({}, today).days).toBe(7);
    expect(dailyWindow({ days: 'abc', from: 'yesterday' }, today).days).toBe(7);
  });
  it('custom dates include both ends, and a reversed pair is swapped', () => {
    expect(dailyWindow({ from: '2026-11-01', to: '2026-11-10' }, today)).toEqual({ from: '2026-11-01', to: '2026-11-10', days: 10 });
    expect(dailyWindow({ from: '2026-11-10', to: '2026-11-01' }, today)).toEqual({ from: '2026-11-01', to: '2026-11-10', days: 10 });
    expect(dailyWindow({ from: '2026-11-05', to: '2026-11-05' }, today).days).toBe(1);
  });
  it('never runs past today and never covers more than a year', () => {
    expect(dailyWindow({ from: '2026-11-20', to: '2027-01-01' }, today)).toEqual({ from: '2026-11-20', to: '2026-11-23', days: 4 });
    expect(dailyWindow({ from: '2026-12-01', to: '2026-12-05' }, today)).toEqual({ from: '2026-11-23', to: '2026-11-23', days: 1 });
    const long = dailyWindow({ from: '2020-01-01', to: '2026-11-23' }, today);
    expect(long.days).toBe(DAILY_MAX_DAYS); expect(long.to).toBe(today);
  });
});

describe('peopleTotals', () => {
  it('adds the days up and gives offers / rejected as a share of people who applied', () => {
    const t = peopleTotals([
      { day: '2026-11-22', registered: 168, applied: 150, gotOffers: 30, rejected: 110 },
      { day: '2026-11-23', registered: 57, applied: 50, gotOffers: 10, rejected: 40 },
    ]);
    expect(t).toEqual({ registered: 225, applied: 200, gotOffers: 40, rejected: 150, gotOffersPct: 20, rejectedPct: 75 });
    expect(peopleTotals([]).gotOffersPct).toBe(0);
  });
});

import { peopleRangeTotals } from './dashboardGraphs.js';

describe('peopleRangeTotals', () => {
  it('counts people once over the range, with offers / no offers as a share of those who checked', () => {
    expect(peopleRangeTotals(931, { applied: 841, gotOffers: 150, rejected: 680 })).toEqual({ registered: 931, applied: 841, gotOffers: 150, rejected: 680, gotOffersPct: 18, rejectedPct: 81 });
  });
  it('got offers and no offers together never pass the people who checked', () => {
    const t = peopleRangeTotals(0, { applied: 10, gotOffers: 8, rejected: 9 });
    expect([t.gotOffers, t.rejected]).toEqual([8, 2]);
    expect(peopleRangeTotals(0, { applied: 0, gotOffers: 0, rejected: 0 }).gotOffersPct).toBe(0);
  });
});

import { revasureSlices, yubiSliceOf, yubiSlices } from './dashboardGraphs.js';

describe('partner pies', () => {
  it('Revasure: plain words, biggest first, shares of the whole (production, 23 Nov 2026)', () => {
    const r = revasureSlices([{ status: 'ineligible', count: 31 }, { status: 'success', count: 1307 }, { status: 'failed', count: 16 }, { status: 'duplicate', count: 1 }]);
    expect(r.total).toBe(1355);
    expect(r.slices.map((s) => [s.label, s.count])).toEqual([['Accepted', 1307], ['Not eligible', 31], ['Could not send', 16], ['Already registered', 1]]);
    expect(r.slices[0].pct).toBe(96.5);
  });
  it('Yubi: our own failure wins, no word from Yubi is "sent", unknown codes are shown readable', () => {
    expect(yubiSliceOf('failed', 'NEW_LEAD').label).toBe('Could not send');
    expect(yubiSliceOf('token_issued', null).label).toBe('Waiting for Yubi');
    expect(yubiSliceOf('token_issued', 'NEW_LEAD').label).toBe('New lead');
    expect(yubiSliceOf('token_issued', 'SOME_NEW_CODE').label).toBe('Some new code');
  });
  it('Yubi: rows with the same meaning are added together and empty ones dropped', () => {
    const y = yubiSlices([
      { status: 'token_issued', lastStatus: null, count: 1556 }, { status: 'token_issued', lastStatus: 'NEW_LEAD', count: 892 },
      { status: 'failed', lastStatus: null, count: 19 }, { status: 'token_issued', lastStatus: 'OFFER_GENERATED', count: 6 },
      { status: 'token_issued', lastStatus: 'OFFER_GENERATED', count: 1 }, { status: 'token_issued', lastStatus: 'APPROVED', count: 0 },
    ]);
    expect(y.total).toBe(2474);
    expect(y.slices.map((s) => [s.key, s.count])).toEqual([['sent', 1556], ['new_lead', 892], ['failed', 19], ['offer_generated', 7]]);
  });
});

import { aurixPeopleSlices } from './dashboardGraphs.js';

// People in each customer status (lib/customerStatus.ts), live prod on 27 Nov 2026.
const PEOPLE = { no_offers: 1540, otp_verified: 288, applied: 162, under_review: 97, offers_ready: 70, filling_details: 43, pan_verified: 36, lender_rejected: 8, lender_failed: 6, offers_failed: 2, checking_offers: 1 };

describe('aurixPeopleSlices', () => {
  it('counts people who asked for offers, once each, in the shared words, biggest first', () => {
    const a = aurixPeopleSlices(PEOPLE);
    // 1,886 people checked eligibility; the 367 who never asked (verified only, PAN only, filling details) are left out.
    expect(a.total).toBe(1886);
    expect(a.slices.map((s) => [s.label, s.count])).toEqual([
      ['No offers', 1540], ['Tapped Apply, not confirmed', 168], ['In review with the lender', 97], ['Offers ready, not applied', 70],
      ['Rejected by the lender', 8], ['Offers check failed', 2], ['Checking now', 1],
    ]);
    expect(a.slices[0].pct).toBe(81.7);
  });
});

import { lenderStatusRows, lenderStatusOf, LENDER_STATUSES } from './dashboardGraphs.js';

const YUBI = yubiSlices([{ status: 'token_issued', lastStatus: null, count: 10 }, { status: 'token_issued', lastStatus: 'NEW_LEAD', count: 12 }, { status: 'token_issued', lastStatus: 'LEAD_REJECTED', count: 3 },
  { status: 'failed', lastStatus: null, count: 1 }, { status: 'token_issued', lastStatus: 'NEW_APPLICATION', count: 4 }, { status: 'token_issued', lastStatus: 'OFFER_GENERATED', count: 2 },
  { status: 'token_issued', lastStatus: 'NO_OFFERS', count: 1 }, { status: 'token_issued', lastStatus: 'APPLICATION_REJECTED', count: 1 }]);
const REVASURE = revasureSlices([{ status: 'success', count: 1869 }, { status: 'ineligible', count: 35 }, { status: 'failed', count: 26 }, { status: 'duplicate', count: 1 }]);

describe('one chart for the three lenders', () => {
  it('reads each lender status as one of the shared statuses, or as only "sent"', () => {
    expect(lenderStatusOf('aurix', 'no_offers')).toBe('noOffers');
    expect(lenderStatusOf('aurix', 'lender_rejected')).toBe('rejected');
    expect(lenderStatusOf('aurix', 'offers_ready')).toBe('offers');
    expect(lenderStatusOf('aurix', 'tapped')).toBe('tapped');
    expect(lenderStatusOf('aurix', 'under_review')).toBe('progress');
    expect(lenderStatusOf('aurix', 'approved')).toBe('approved');
    expect(lenderStatusOf('aurix', 'checking')).toBeNull();
    expect(lenderStatusOf('yubi', 'sent')).toBeNull();
    expect(lenderStatusOf('yubi', 'some_new_code')).toBeNull();
  });
  it('"rejected" is only a lender turning down an application; everything else that ended with nothing is "no offers"', () => {
    expect(lenderStatusOf('yubi', 'application_rejected')).toBe('rejected');
    expect(lenderStatusOf('yubi', 'lead_rejected')).toBe('noOffers');
    expect(lenderStatusOf('yubi', 'no_offers')).toBe('noOffers');
    expect(lenderStatusOf('revasure', 'ineligible')).toBe('noOffers');
    expect(lenderStatusOf('revasure', 'low_income')).toBe('noOffers');
    expect(lenderStatusOf('revasure', 'duplicate')).toBe('noOffers');
  });
  it('an accepted lead is "lead accepted", never "applied"', () => {
    expect(lenderStatusOf('revasure', 'success')).toBe('accepted');
    expect(lenderStatusOf('yubi', 'new_lead')).toBe('accepted');
    expect(lenderStatusOf('yubi', 'new_application')).toBe('progress');
  });
  it('gives a row per status with each lender\'s count (live prod, 27 Nov 2026)', () => {
    const rows = lenderStatusRows({ aurix: aurixPeopleSlices(PEOPLE), yubi: YUBI, revasure: REVASURE });
    expect(rows.map((r) => r.key)).toEqual(LENDER_STATUSES.map((s) => s.key));
    const by = Object.fromEntries(rows.map((r) => [r.key, [r.aurix, r.yubi, r.revasure]]));
    expect(by).toEqual({
      sent: [1886, 34, 1931], accepted: [0, 12, 1869], offers: [70, 2, 0], tapped: [168, 0, 0], progress: [97, 4, 0], approved: [0, 0, 0], disbursed: [0, 0, 0],
      noOffers: [1540, 4, 36], rejected: [8, 1, 0], failed: [2, 1, 26],
    });
    // What is still waiting is named under Sent.
    expect(rows[0].detail.yubi).toEqual([{ label: 'Waiting for Yubi', count: 10 }]);
    expect(rows.find((r) => r.key === 'noOffers')!.detail.revasure.map((d) => d.label)).toEqual(['Not eligible', 'Already registered']);
  });
});

import { overallOutcomes, overallOutcomeOf } from './dashboardGraphs.js';
import { peopleMetrics } from './peopleMetrics.js';

describe('overall outcome pie', () => {
  it('reads each lender status as got offers, no offers, rejected, or neither', () => {
    expect(overallOutcomeOf('aurix', 'offers_ready')).toBe('gotOffers');
    expect(overallOutcomeOf('aurix', 'tapped')).toBe('gotOffers');
    expect(overallOutcomeOf('aurix', 'under_review')).toBe('gotOffers');
    expect(overallOutcomeOf('aurix', 'no_offers')).toBe('noOffers');
    expect(overallOutcomeOf('aurix', 'lender_rejected')).toBe('rejected');
    expect(overallOutcomeOf('aurix', 'failed')).toBeNull();
    expect(overallOutcomeOf('yubi', 'no_offers')).toBe('noOffers');
    expect(overallOutcomeOf('yubi', 'lead_rejected')).toBe('noOffers');
    expect(overallOutcomeOf('yubi', 'application_rejected')).toBe('rejected');
    expect(overallOutcomeOf('yubi', 'sent')).toBeNull();
    expect(overallOutcomeOf('revasure', 'success')).toBeNull();
    expect(overallOutcomeOf('revasure', 'ineligible')).toBe('noOffers');
    expect(overallOutcomeOf('revasure', 'low_income')).toBe('noOffers');
    expect(revasureSlices([{ status: 'low_income', count: 8 }]).slices[0].label).toBe('Not eligible: low income');
  });
  it('adds the three lenders up, and the Aurix part is the same people the cards count', () => {
    const o = overallOutcomes({ aurix: aurixPeopleSlices(PEOPLE), yubi: YUBI, revasure: REVASURE });
    const m = peopleMetrics(PEOPLE);
    const [got, none, rejected] = o.slices;
    // Aurix: got offers minus the people a lender rejected (each person is in one slice only).
    expect(got.byLender.aurix).toBe(m.gotOffers - m.rejected);
    expect(none.byLender.aurix).toBe(m.noOffers);
    expect(rejected.byLender.aurix).toBe(m.rejected);
    expect(o.slices.map((s) => [s.key, s.count])).toEqual([['gotOffers', 341], ['noOffers', 1580], ['rejected', 9]]);
    expect(o.total).toBe(1930);
  });
});
