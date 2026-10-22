import { describe, it, expect } from 'vitest';
import {
  SCHEDULE_STEPS, nextAction, deriveLastStep, isIdle, stopReason, buildInstallLink, isFinishedApplicationStatus,
  stepDueAt, MAX_LATE_MS, MIN_GAP_MS, IDLE_MS,
} from './reminderSchedule.js';

const H = 3_600_000;
const MIN = 60_000;
const start = new Date('2026-10-19T10:00:00Z');
const at = (ms: number) => new Date(start.getTime() + ms);
const base = { startAt: start, stepsHandled: 0, lastSentAt: null as Date | null, inCallingWindow: true };

describe('schedule shape', () => {
  it('is 20 messages: SMS then WhatsApp 30 minutes later, ten points', () => {
    expect(SCHEDULE_STEPS).toHaveLength(20);
    SCHEDULE_STEPS.forEach((s, i) => {
      expect(s.channel).toBe(i % 2 === 0 ? 'sms' : 'whatsapp');
      if (i % 2 === 1) expect(s.offsetMs - SCHEDULE_STEPS[i - 1].offsetMs).toBe(30 * MIN);
    });
  });
  it('runs start, +4h, +8h, then every day for 7 days', () => {
    const smsOffsets = SCHEDULE_STEPS.filter((s) => s.channel === 'sms').map((s) => s.offsetMs / H);
    expect(smsOffsets).toEqual([0, 4, 8, 24, 48, 72, 96, 120, 144, 168]);
  });
  it('is strictly ordered in time', () => {
    for (let i = 1; i < SCHEDULE_STEPS.length; i++) {
      expect(SCHEDULE_STEPS[i].offsetMs).toBeGreaterThan(SCHEDULE_STEPS[i - 1].offsetMs);
    }
  });
  it('ends one week after the start (plus the last WhatsApp gap)', () => {
    expect(stepDueAt(start, SCHEDULE_STEPS[19]).getTime() - start.getTime()).toBe(7 * 24 * H + 30 * MIN);
  });
});

describe('nextAction', () => {
  it('sends the first SMS straight away', () => {
    const a = nextAction({ ...base, now: at(0) });
    expect(a).toMatchObject({ kind: 'send', step: { index: 0, channel: 'sms' } });
  });
  it('waits for a step that is not due yet', () => {
    const a = nextAction({ ...base, stepsHandled: 1, lastSentAt: at(0), now: at(10 * MIN) });
    expect(a).toMatchObject({ kind: 'wait', reason: 'not_due' });
  });
  it('sends the WhatsApp 30 minutes after the SMS', () => {
    const a = nextAction({ ...base, stepsHandled: 1, lastSentAt: at(0), now: at(30 * MIN) });
    expect(a).toMatchObject({ kind: 'send', step: { index: 1, channel: 'whatsapp' } });
  });
  it('holds a due step during quiet hours', () => {
    const a = nextAction({ ...base, stepsHandled: 2, lastSentAt: at(MIN), now: at(4 * H + MIN), inCallingWindow: false });
    expect(a).toMatchObject({ kind: 'wait', reason: 'quiet_hours' });
  });
  it('never sends two messages closer than the minimum gap', () => {
    // 8h30 WhatsApp is due, but the 8h SMS only went out a moment ago (it waited for the window).
    const now = at(8 * H + 40 * MIN);
    const a = nextAction({ ...base, stepsHandled: 5, lastSentAt: new Date(now.getTime() - (MIN_GAP_MS - MIN)), now });
    expect(a).toMatchObject({ kind: 'wait', reason: 'gap' });
  });
  it('skips a step that is far too late instead of sending it at a stale time', () => {
    const a = nextAction({ ...base, stepsHandled: 2, lastSentAt: at(0), now: at(4 * H + MAX_LATE_MS + MIN) });
    expect(a).toMatchObject({ kind: 'skip', reason: 'too_late', step: { index: 2 } });
  });
  it('still sends a step that waited out a whole night (within the late limit)', () => {
    // due 22:00, window opens 09:00 next day = 11h later
    const a = nextAction({ ...base, stepsHandled: 2, lastSentAt: at(0), now: at(4 * H + 11 * H), inCallingWindow: true });
    expect(a.kind).toBe('send');
  });
  it('is finished after the last step', () => {
    expect(nextAction({ ...base, stepsHandled: 20, now: at(30 * 24 * H) })).toEqual({ kind: 'finished' });
  });
});

describe('deriveLastStep', () => {
  it('maps what the server knows to the step', () => {
    expect(deriveLastStep({ panOnFile: false, hasApplication: false })).toBe('otp_only');
    expect(deriveLastStep({ panOnFile: true, hasApplication: false })).toBe('pan_done');
    expect(deriveLastStep({ panOnFile: true, hasApplication: true })).toBe('application_started');
  });
});

describe('isIdle', () => {
  it('is idle at 5 minutes, not before', () => {
    const seen = new Date('2026-10-19T10:00:00Z');
    expect(isIdle(seen, new Date(seen.getTime() + IDLE_MS - 1))).toBe(false);
    expect(isIdle(seen, new Date(seen.getTime() + IDLE_MS))).toBe(true);
  });
});

describe('stopReason', () => {
  const none = { doNotContact: false, installed: false, appLogin: false, applicationFinished: false, returned: false };
  it('carries on when nothing applies', () => expect(stopReason(none)).toBeNull());
  it('stops for each reason', () => {
    expect(stopReason({ ...none, installed: true })).toBe('installed');
    expect(stopReason({ ...none, appLogin: true })).toBe('app_login');
    expect(stopReason({ ...none, applicationFinished: true })).toBe('application_finished');
    expect(stopReason({ ...none, returned: true })).toBe('returned');
  });
  it('do-not-contact wins over everything', () => {
    expect(stopReason({ ...none, doNotContact: true, installed: true, returned: true })).toBe('do_not_contact');
  });
});

describe('helpers', () => {
  it('builds the link with the reference id', () => {
    expect(buildInstallLink('https://api.swiftloan.ai/', 'AB12CD34')).toBe('https://api.swiftloan.ai/dl?ref=AB12CD34');
  });
  it('knows which application statuses count as finished', () => {
    expect(isFinishedApplicationStatus('handoff')).toBe(true);
    expect(isFinishedApplicationStatus('draft')).toBe(false);
    expect(isFinishedApplicationStatus('offers_ready')).toBe(false);
    expect(isFinishedApplicationStatus(null)).toBe(false);
  });
});

import { nextCheckTime, QUIET_RECHECK_MS } from './reminderSchedule.js';

describe('nextCheckTime', () => {
  const now = new Date('2026-10-20T05:30:00Z');
  const base = { now, startAt: now, stepsHandled: 1, lastSentAt: now, lastSeenAt: now, dropped: false };
  it('is the idle check when it comes before the next step', () => {
    expect(nextCheckTime(base).getTime()).toBe(now.getTime() + 5 * 60_000);
  });
  it('is the next step once the visitor is saved as dropped off', () => {
    expect(nextCheckTime({ ...base, dropped: true }).getTime()).toBe(now.getTime() + 30 * 60_000);
  });
  it('never earlier than the minimum gap after the last message', () => {
    const t = nextCheckTime({ ...base, dropped: true, startAt: new Date(now.getTime() - 3_600_000) });
    expect(t.getTime()).toBe(now.getTime() + MIN_GAP_MS); // the step is overdue, but a message just went out
  });
  it('re-checks a held step after the quiet recheck interval, not every minute', () => {
    const t = nextCheckTime({ ...base, stepsHandled: 2, startAt: new Date(now.getTime() - 5 * 3_600_000), lastSentAt: null, dropped: true });
    expect(t.getTime() - now.getTime()).toBe(QUIET_RECHECK_MS);
  });
  it('moves the idle check out with the visitor\'s last activity', () => {
    const t = nextCheckTime({ ...base, lastSeenAt: new Date(now.getTime() + 4 * 60_000) });
    expect(t.getTime()).toBe(now.getTime() + 9 * 60_000);
  });
  it('always looks again in the future, even when everything is overdue', () => {
    const t = nextCheckTime({ ...base, lastSeenAt: new Date(now.getTime() - 3_600_000) });
    expect(t.getTime()).toBeGreaterThan(now.getTime());
  });
  it('after the last step there is nothing left but an idle check', () => {
    expect(nextCheckTime({ ...base, stepsHandled: 20, dropped: true }).getTime()).toBe(now.getTime() + QUIET_RECHECK_MS);
  });
});

describe('nextCheckTime before the visitor has dropped off', () => {
  const now = new Date('2026-10-20T05:30:00Z');
  const base = { now, startAt: new Date(now.getTime() - 3_600_000), stepsHandled: 0, lastSentAt: null as Date | null, lastSeenAt: now, dropped: false };
  it('ignores an overdue step: only the idle check can happen, so nothing is sent while they are on the site', () => {
    expect(nextCheckTime(base).getTime()).toBe(now.getTime() + 5 * 60_000);
  });
  it('still waits for the idle check when a step would be due earlier', () => {
    const t = nextCheckTime({ ...base, lastSeenAt: new Date(now.getTime() - 4 * 60_000) });
    expect(t.getTime()).toBe(now.getTime() + 60_000);
  });
});

import { renderSmsBody, DEFAULT_STEP_LABELS } from './reminderSchedule.js';

describe('renderSmsBody', () => {
  const body = 'Dear {name} , your SwiftLoan loan application is incomplete at {step}. Please open the SwiftLoan app to continue where you left off :{link}. Team SwiftLoan\n-PurpleTalk IPL';
  const link = 'https://api.swiftloan.ai/dl?ref=AB12CD34';
  it('fills name, step and link into the registered text, exactly', () => {
    expect(renderSmsBody(body, { name: 'Charan', step: 'Pan verification', link })).toBe(
      'Dear Charan , your SwiftLoan loan application is incomplete at Pan verification. Please open the SwiftLoan app to continue where you left off :https://api.swiftloan.ai/dl?ref=AB12CD34. Team SwiftLoan\n-PurpleTalk IPL',
    );
  });
  it('uses the same greeting the registered texts use when the name is unknown', () => {
    expect(renderSmsBody(body, { name: null, step: 'x', link })).toContain('Dear Customer ,');
    expect(renderSmsBody(body, { name: '   ', step: 'x', link })).toContain('Dear Customer ,');
  });
  it('keeps a name that fits a 30-character variable, else only its first word', () => {
    expect(renderSmsBody('{name}', { name: 'Rallabandi Charan', step: '', link })).toBe('Rallabandi Charan');
    expect(renderSmsBody('{name}', { name: 'Venkata Satyanarayana Murthy Rallabandi', step: '', link })).toBe('Venkata');
  });
  it('replaces every occurrence and leaves no token behind', () => {
    const out = renderSmsBody('{name}/{name} {step} {link} {link}', { name: 'Asha', step: 'S', link: 'L' });
    expect(out).toBe('Asha/Asha S L L');
    expect(out).not.toMatch(/[{}]/);
  });
  it('a text with only {link} (the original setting) still works unchanged', () => {
    expect(renderSmsBody('Continue: {link} -X', { name: 'Asha', step: 'S', link: 'L' })).toBe('Continue: L -X');
  });
  it('has a label for every step', () => {
    expect(Object.keys(DEFAULT_STEP_LABELS).sort()).toEqual(['application_started', 'otp_only', 'pan_done']);
    expect(DEFAULT_STEP_LABELS.pan_done).toBe('Pan verification');
  });
});
