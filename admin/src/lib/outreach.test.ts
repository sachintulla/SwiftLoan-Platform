import { describe, it, expect } from 'vitest';
import {
  buttonState, canCallRole, canMessageRole, clockText, confirmCopy, deliveryBadge, failureText, formatPhone, isFinishedStage,
  kindLabel, lastSentText, manualSendLine, maskPhone, parseSendError, repeatNote, sectionLabel, successText, timeAgoText,
  withoutInstallLinks, FINISHED_NOTE, NEEDS_ADMIN, NEEDS_SUPER_ADMIN,
  type ChannelState, type OutreachOptions,
} from './outreach';

const NOW = new Date('2026-10-27T10:00:00Z').getTime();
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const channel = (over: Partial<ChannelState> = {}): ChannelState => ({
  available: true, reason: null, code: null, preview: null, lastSentAt: null, lastSentBy: null, recentlySent: false, sentToday: 0, ...over,
});

const options = (over: Partial<OutreachOptions> = {}, ch: Partial<Record<'whatsapp' | 'sms' | 'push', Partial<ChannelState>>> = {}): OutreachOptions => ({
  customer: { id: 'c1', name: 'Asha Verma', phone: '9876543210', currentStage: 'kyc_started', stageLabel: 'KYC started', stageEnteredAt: minsAgo(2000) },
  outreachStage: 'kyc_started', terminal: false,
  doNotContact: { blocked: false, reason: null },
  onReminderSchedule: false,
  role: { canMessage: true, canCall: true },
  channels: { whatsapp: channel(ch.whatsapp), sms: channel(ch.sms), push: channel(ch.push) },
  recent: [], manualSends: [],
  ...over,
});

const ctx = (over: Record<string, unknown> = {}) => ({
  role: 'super_admin', options: options(), finished: false, hasCallSteps: true, now: NOW, ...over,
}) as Parameters<typeof buttonState>[1];

describe('timeAgoText and lastSentText', () => {
  it('reads in short plain English', () => {
    expect(timeAgoText(minsAgo(0), NOW)).toBe('just now');
    expect(timeAgoText(minsAgo(12), NOW)).toBe('12 min ago');
    expect(timeAgoText(minsAgo(60), NOW)).toBe('1 hour ago');
    expect(timeAgoText(minsAgo(180), NOW)).toBe('3 hours ago');
    expect(timeAgoText(minsAgo(60 * 24 * 4), NOW)).toBe('4 days ago');
    expect(timeAgoText(null, NOW)).toBe('');
    expect(timeAgoText('not a date', NOW)).toBe('');
  });

  it('has a long form for sentences', () => {
    expect(timeAgoText(minsAgo(1), NOW, true)).toBe('1 minute ago');
    expect(timeAgoText(minsAgo(12), NOW, true)).toBe('12 minutes ago');
  });

  it('says Not sent yet, or who sent it and when', () => {
    expect(lastSentText({ lastSentAt: null, lastSentBy: null }, NOW)).toBe('Not sent yet');
    expect(lastSentText({ lastSentAt: minsAgo(12), lastSentBy: 'Priya' }, NOW)).toBe('Last sent 12 min ago by Priya');
    expect(lastSentText({ lastSentAt: minsAgo(12), lastSentBy: null }, NOW)).toBe('Last sent 12 min ago');
  });
});

describe('phone and clock', () => {
  it('formats and masks a mobile number', () => {
    expect(formatPhone('9876543210')).toBe('98765 43210');
    expect(formatPhone('+91 98765 43210')).toBe('98765 43210');
    expect(formatPhone('12345')).toBe('12345');
    expect(maskPhone('9876543210')).toBe('98XXXXXX10');
    expect(maskPhone('919876543210')).toBe('98XXXXXX10');
    expect(maskPhone(null)).toBe('the customer');
  });

  it('writes a 24 hour clock', () => {
    expect(clockText(new Date(2026, 9, 27, 14, 5))).toBe('14:05');
    expect(clockText(new Date(2026, 9, 27, 9, 0))).toBe('09:00');
  });
});

describe('roles and stages', () => {
  it('lets an admin message and only a super admin call', () => {
    expect(canMessageRole('admin')).toBe(true);
    expect(canMessageRole('super_admin')).toBe(true);
    expect(canMessageRole('analyst')).toBe(false);
    expect(canMessageRole(null)).toBe(false);
    expect(canCallRole('super_admin')).toBe(true);
    expect(canCallRole('admin')).toBe(false);
  });

  it('knows the finished stages', () => {
    for (const s of ['disbursed', 'rejected', 'lost']) expect(isFinishedStage(s)).toBe(true);
    for (const s of ['kyc_started', 'approved', null, undefined]) expect(isFinishedStage(s)).toBe(false);
  });

  it('has the section label and the finished note in the agreed words', () => {
    expect(sectionLabel('KYC started')).toBe('Reach out about "KYC started"');
    expect(sectionLabel(null)).toBe('Reach out');
    expect(FINISHED_NOTE).toBe('This customer has finished the journey. There is nothing to follow up on.');
  });
});

describe('buttonState', () => {
  it('shows Not sent yet on an available channel', () => {
    expect(buttonState('whatsapp', ctx())).toEqual({ disabled: false, note: 'Not sent yet', tone: 'muted' });
  });

  it('shows who sent last and when', () => {
    const o = options({}, { sms: { lastSentAt: minsAgo(12), lastSentBy: 'Priya' } });
    expect(buttonState('sms', ctx({ options: o }))).toMatchObject({ disabled: false, note: 'Last sent 12 min ago by Priya' });
  });

  it('shows the server reason as visible text when a channel is unavailable', () => {
    const o = options({}, { whatsapp: { available: false, code: 'not_configured', reason: 'WhatsApp is not connected' } });
    expect(buttonState('whatsapp', ctx({ options: o }))).toEqual({ disabled: true, note: 'WhatsApp is not connected', tone: 'muted' });
  });

  it('warns, without disabling, about the calling hours for a super admin', () => {
    const o = options({}, { push: { code: 'outside_calling_hours', reason: 'It is outside calling hours. As a super admin you can send anyway.' } });
    expect(buttonState('push', ctx({ options: o }))).toMatchObject({ disabled: false, tone: 'warn' });
  });

  it('disables Call with Needs a super admin unless the role is super_admin', () => {
    expect(buttonState('call', ctx({ role: 'admin' }))).toEqual({ disabled: true, note: NEEDS_SUPER_ADMIN, tone: 'muted' });
    expect(buttonState('call', ctx({ role: 'analyst' })).note).toBe('Needs a super admin');
    expect(buttonState('call', ctx({ role: 'super_admin' })).disabled).toBe(false);
  });

  it('disables the message buttons with Needs an admin or super admin for other roles', () => {
    for (const ch of ['whatsapp', 'sms', 'push'] as const) {
      expect(buttonState(ch, ctx({ role: 'analyst' }))).toEqual({ disabled: true, note: NEEDS_ADMIN, tone: 'muted' });
    }
  });

  it('lets an admin message but not call', () => {
    expect(buttonState('whatsapp', ctx({ role: 'admin' })).disabled).toBe(false);
    expect(buttonState('call', ctx({ role: 'admin' })).disabled).toBe(true);
  });

  it('disables everything, with no per-button note, when the journey is finished', () => {
    for (const ch of ['whatsapp', 'sms', 'push', 'call'] as const) {
      expect(buttonState(ch, ctx({ finished: true }))).toEqual({ disabled: true, note: '', tone: 'muted' });
    }
  });

  it('uses the reason the caller gave, for every button', () => {
    for (const ch of ['whatsapp', 'sms', 'push', 'call'] as const) {
      expect(buttonState(ch, ctx({ disabledReason: 'Not matched to a customer' }))).toMatchObject({ disabled: true, note: 'Not matched to a customer' });
    }
  });

  it('says so when there is no call opening for the stage, no phone, or the customer opted out', () => {
    expect(buttonState('call', ctx({ hasCallSteps: false })).note).toBe('No call is set up for this stage');
    expect(buttonState('call', ctx({ options: options({ customer: { ...options().customer, phone: null } }) })).note).toBe('No phone number on file');
    expect(buttonState('call', ctx({ options: options({ doNotContact: { blocked: true, reason: 'do_not_call' } }) })).note).toBe('This customer asked not to be called');
  });

  it('is disabled while the options load, and says so if they fail', () => {
    expect(buttonState('sms', ctx({ options: null }))).toMatchObject({ disabled: true, note: 'Checking' });
    expect(buttonState('sms', ctx({ options: null, optionsError: true }))).toMatchObject({ disabled: true, note: 'Could not check this channel' });
  });
});

describe('confirmCopy', () => {
  const who = { name: 'Asha Verma', phone: '9876543210', stageLabel: 'KYC started' };

  it('words each message channel', () => {
    expect(confirmCopy('whatsapp', who)).toEqual({
      title: 'Send WhatsApp to Asha Verma?', confirmLabel: 'Send WhatsApp', tone: 'brand',
      consequence: 'This sends a real WhatsApp message now. It cannot be recalled.',
    });
    expect(confirmCopy('sms', who)).toMatchObject({ title: 'Send SMS to Asha Verma?', confirmLabel: 'Send SMS', consequence: 'This sends a real SMS now. It cannot be recalled.' });
    expect(confirmCopy('push', who)).toMatchObject({ title: 'Send push notification to Asha Verma?', confirmLabel: 'Send push', consequence: 'Fires the Upshot event for this stage. Upshot decides which channels it uses. It cannot be recalled.' });
  });

  it('words the call, in red', () => {
    expect(confirmCopy('call', who)).toMatchObject({
      confirmLabel: 'Place call', tone: 'red',
      consequence: 'This rings Asha Verma on 98765 43210 within a few seconds. The voice agent will open with the KYC started follow-up.',
    });
  });

  it('falls back to this customer when there is no name', () => {
    expect(confirmCopy('sms', { ...who, name: null }).title).toBe('Send SMS to this customer?');
  });

  it('uses no exclamation marks and no emoji anywhere', () => {
    const text = (['whatsapp', 'sms', 'push', 'call'] as const).map((c) => JSON.stringify(confirmCopy(c, who))).join(' ');
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('repeatNote', () => {
  it('names the channel and the time', () => {
    expect(repeatNote('whatsapp', minsAgo(12), NOW)).toBe('A WhatsApp for this stage was already sent 12 minutes ago.');
    expect(repeatNote('push', minsAgo(90), NOW)).toBe('A push for this stage was already sent 2 hours ago.');
    expect(repeatNote('sms', null, NOW)).toBe('A SMS for this stage was sent recently.');
  });
});

describe('errors', () => {
  it('reads the code and message the API client threw', () => {
    const e = Object.assign(new Error('x'), { status: 409, body: { data: { code: 'recently_sent', lastSentAt: '2026-10-27T09:48:00Z' }, message: 'Sent already', error: 'Sent already' } });
    expect(parseSendError(e)).toEqual({ status: 409, code: 'recently_sent', message: 'Sent already', lastSentAt: '2026-10-27T09:48:00Z' });
  });

  it('copes with an error that has no body', () => {
    expect(parseSendError(new Error('Network down'))).toEqual({ status: 0, code: null, message: 'Network down', lastSentAt: null });
    expect(parseSendError(undefined).message).toBe('Something went wrong');
  });

  it('keeps the server reason in the line shown', () => {
    expect(failureText('whatsapp', { status: 403, code: 'do_not_contact', message: 'This customer asked not to be contacted' }))
      .toBe('WhatsApp not sent. This customer asked not to be contacted.');
    expect(failureText('sms', { status: 502, code: 'send_failed', message: 'SMS failed: Invalid template. Nothing was sent.' }))
      .toBe('SMS failed: Invalid template. Nothing was sent.');
  });

  it('turns the raw role error into plain words', () => {
    const raw = 'This action requires one of: super_admin';
    expect(failureText('call', { status: 403, code: null, message: raw })).toBe('Call not sent. Needs a super admin.');
    expect(failureText('sms', { status: 403, code: null, message: 'This action requires one of: super_admin, admin' })).toBe('SMS not sent. Needs an admin or super admin.');
  });

  it('shows a server reason for a call as it is', () => {
    expect(failureText('call', { status: 409, code: 'do_not_contact', message: 'This customer asked not to be called' })).toBe('This customer asked not to be called.');
  });
});

describe('successText', () => {
  const at = new Date(2026, 9, 27, 14, 32);
  it('names the channel, the masked number and the time', () => {
    expect(successText('whatsapp', '9876543210', at)).toBe('WhatsApp sent to 98XXXXXX10 at 14:32.');
    expect(successText('sms', '9876543210', at)).toBe('SMS sent to 98XXXXXX10 at 14:32.');
  });
  it('says a push is queued', () => {
    expect(successText('push', '9876543210', at, 'queued')).toBe('Push queued for 98XXXXXX10 at 14:32. It is delivered within about a minute.');
  });
  it('points a call at the Calls tab', () => {
    expect(successText('call', '9876543210', at)).toBe('Call placed to 98XXXXXX10. The result appears under the Calls tab.');
  });
});

describe('history wording', () => {
  it('badges delivery statuses', () => {
    expect(deliveryBadge('read')).toEqual({ label: 'Read', tone: 'green' });
    expect(deliveryBadge('delivered').tone).toBe('green');
    expect(deliveryBadge('sent').tone).toBe('blue');
    expect(deliveryBadge('failed').tone).toBe('red');
    expect(deliveryBadge('queued').tone).toBe('grey');
    expect(deliveryBadge('odd')).toEqual({ label: 'Odd', tone: 'grey' });
  });

  it('says why a message went out', () => {
    expect(kindLabel('admin')).toBe('Sent from the dashboard');
    expect(kindLabel('stall')).toBe('Automatic follow-up');
    expect(kindLabel('other')).toBe('');
  });

  it('writes one line per manual send', () => {
    expect(manualSendLine({ channel: 'whatsapp', at: minsAgo(12), by: 'Priya', status: 'sent' }, NOW)).toBe('Priya sent WhatsApp, 12 min ago');
    expect(manualSendLine({ channel: 'sms', at: minsAgo(3), by: null, status: 'failed' }, NOW)).toBe('An admin sent SMS, 3 min ago (failed)');
    expect(manualSendLine({ channel: 'push', at: minsAgo(3), by: 'Ravi', status: 'pending' }, NOW)).toBe('Ravi sent Push, 3 min ago (queued)');
  });
});

describe('withoutInstallLinks', () => {
  const summary = { total: 5, delivered: 4, failed: 1, pending: 0, lastError: null as string | null };

  it('takes app-link rows out of the nudge counts', () => {
    expect(withoutInstallLinks(summary, { total: 2, sent: 2 })).toEqual({ total: 3, delivered: 2, failed: 1, pending: 0, lastError: null });
  });

  it('never goes below zero, and leaves things alone when there is nothing to subtract', () => {
    expect(withoutInstallLinks(summary, { total: 9, sent: 9 })).toMatchObject({ total: 0, delivered: 0 });
    expect(withoutInstallLinks(summary, undefined)).toBe(summary);
    expect(withoutInstallLinks(undefined, { total: 1, sent: 1 })).toBeUndefined();
  });

  it('counts a cancelled link in the total but not in delivered', () => {
    expect(withoutInstallLinks({ ...summary, total: 3, delivered: 2 }, { total: 2, sent: 1 })).toMatchObject({ total: 1, delivered: 1 });
  });
});
