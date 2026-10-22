import { describe, expect, it } from 'vitest';
import { FALLBACK_LENDER, crossLenderWait, isLenderFinished, lenderNudgeStopReason, renderAppliedSms, tidyLender } from './lenderNudgeRules.js';
import { TIMINGS } from './timings.js';

const MIN = 60_000;
const T0 = new Date('2026-10-20T05:30:00Z'); // 11:00 IST

describe('lender nudge: which lender applications are over', () => {
  it('rejected, disbursed and closed are over; everything the lender may still be working on is not', () => {
    for (const s of ['rejected', 'disbursed', 'closed']) expect(isLenderFinished(s)).toBe(true);
    for (const s of ['offers_ready', 'handoff', 'under_review', 'approved']) expect(isLenderFinished(s)).toBe(false);
  });
  it('an application that no longer exists counts as over', () => {
    expect(isLenderFinished(undefined)).toBe(true);
    expect(isLenderFinished(null)).toBe(true);
  });
});

describe('lender nudge: stop reasons', () => {
  const none = { doNotContact: false, installed: false, appLogin: false, lenderFinished: false };
  it('carries on when nothing applies', () => expect(lenderNudgeStopReason(none)).toBeNull());
  it('each reason on its own', () => {
    expect(lenderNudgeStopReason({ ...none, doNotContact: true })).toBe('do_not_contact');
    expect(lenderNudgeStopReason({ ...none, installed: true })).toBe('installed');
    expect(lenderNudgeStopReason({ ...none, appLogin: true })).toBe('app_login');
    expect(lenderNudgeStopReason({ ...none, lenderFinished: true })).toBe('lender_finished');
  });
  it('do-not-contact wins over everything, then install, then login, then the lender ending', () => {
    expect(lenderNudgeStopReason({ doNotContact: true, installed: true, appLogin: true, lenderFinished: true })).toBe('do_not_contact');
    expect(lenderNudgeStopReason({ ...none, installed: true, appLogin: true, lenderFinished: true })).toBe('installed');
    expect(lenderNudgeStopReason({ ...none, appLogin: true, lenderFinished: true })).toBe('app_login');
  });
});

describe('lender nudge: the lender name in the message', () => {
  it('keeps a normal name, tidies spacing', () => {
    expect(tidyLender('IDFC FIRST Bank')).toBe('IDFC FIRST Bank');
    expect(tidyLender('  Hero   FinCorp ')).toBe('Hero FinCorp');
  });
  it('falls back when there is no name', () => {
    for (const v of [null, undefined, '', '   ']) expect(tidyLender(v)).toBe(FALLBACK_LENDER);
  });
  it('caps a very long name at 30 characters (the usual DLT variable limit)', () => {
    const out = tidyLender('The Extraordinarily Long Named Finance Company Private Limited');
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.startsWith('The Extraordinarily')).toBe(true);
  });
});

describe('lender nudge: SMS text', () => {
  const body = 'Dear {name} , you applied with {lender}. Track it in the app :{link}. Team SwiftLoan';
  it('fills name, lender and link', () => {
    expect(renderAppliedSms(body, { name: 'Priya', lender: 'IDFC FIRST Bank', link: 'https://x/dl?ref=AB12CD34' }))
      .toBe('Dear Priya , you applied with IDFC FIRST Bank. Track it in the app :https://x/dl?ref=AB12CD34. Team SwiftLoan');
  });
  it('greets "Customer" when the name is unknown and names a fallback lender when it is missing', () => {
    expect(renderAppliedSms(body, { name: null, lender: null, link: 'L' })).toBe(`Dear Customer , you applied with ${FALLBACK_LENDER}. Track it in the app :L. Team SwiftLoan`);
  });
  it('uses only the first word of an over-long name, and replaces every occurrence', () => {
    const out = renderAppliedSms('{name} {name} {lender} {link} {link}', { name: 'Venkata Satyanarayana Raghavendra', lender: 'Hero', link: 'L' });
    expect(out).toBe('Venkata Venkata Hero L L');
  });
});

describe('lender nudge: several lenders, one person', () => {
  const GAP = 60 * MIN;
  it('a message right after another lender\'s waits until the gap has passed', () => {
    const otherSent = new Date(T0.getTime() + 10 * MIN);
    const wait = crossLenderWait(new Date(T0.getTime() + 13 * MIN), otherSent, GAP);
    expect(wait).toEqual(new Date(otherSent.getTime() + GAP));
  });
  it('goes straight away once the gap has passed (exactly at the boundary too)', () => {
    const otherSent = new Date(T0.getTime() + 10 * MIN);
    expect(crossLenderWait(new Date(otherSent.getTime() + GAP), otherSent, GAP)).toBeNull();
    expect(crossLenderWait(new Date(otherSent.getTime() + GAP + MIN), otherSent, GAP)).toBeNull();
  });
  it('no other lender has been messaged, or the gap is switched off: no wait', () => {
    expect(crossLenderWait(T0, null, GAP)).toBeNull();
    expect(crossLenderWait(T0, undefined, GAP)).toBeNull();
    expect(crossLenderWait(T0, new Date(T0.getTime() - MIN), 0)).toBeNull();
  });
});

describe('lender nudge: settings in the registry', () => {
  const byKey = (k: string) => TIMINGS.find((t) => t.key === k)!;
  it('defaults: off, WhatsApp at 10 min, SMS at 40 min, WhatsApp next day, 60 min between messages', () => {
    expect(byKey('applied.sendEnabled').def).toBe(false);
    expect(byKey('applied.schedule').def).toEqual([{ channel: 'whatsapp', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 40 }, { channel: 'whatsapp', afterMinutes: 1440 }]);
    expect(byKey('applied.minGapMinutes').def).toBe(60);
    expect(byKey('applied.maxLateHours').def).toBe(12);
    expect(byKey('applied.maxAgeHours').def).toBe(24);
  });
});
