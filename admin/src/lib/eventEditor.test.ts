import { describe, it, expect } from 'vitest';
import { splitMinutes, toMinutes, draftProblem, type ChDraft } from './eventEditor';

const base: ChDraft = {
  enabled: false, expectedEvent: 'offer_selected', delayVal: '30', delayUnit: 'min', coolVal: '1', coolUnit: 'day',
  upshotEvent: 'swiftloan_offer_viewed_push', waTemplate: '', waLanguage: 'en', waVars: [],
  smsId: '', smsBody: '', role: '', assistantId: '', brief: '',
};
const draft = (p: Partial<ChDraft>): ChDraft => ({ ...base, ...p });

describe('splitMinutes and toMinutes', () => {
  it('shows a delay in the largest unit that divides it evenly', () => {
    expect(splitMinutes(30)).toEqual({ val: '30', unit: 'min' });
    expect(splitMinutes(90)).toEqual({ val: '90', unit: 'min' });
    expect(splitMinutes(120)).toEqual({ val: '2', unit: 'hr' });
    expect(splitMinutes(1440)).toEqual({ val: '1', unit: 'day' });
    expect(splitMinutes(4320)).toEqual({ val: '3', unit: 'day' });
  });

  it('round-trips, so opening and saving a delay never changes it', () => {
    for (const m of [1, 20, 45, 60, 90, 120, 1440, 2880, 10080, 20160]) {
      const { val, unit } = splitMinutes(m);
      expect(toMinutes(val, unit), String(m)).toBe(m);
    }
  });
});

describe('draftProblem', () => {
  it('says nothing about a channel that was not touched and is off', () => {
    expect(draftProblem('whatsapp', draft({ delayVal: '' }), false)).toBeNull();
  });

  it('rejects a delay outside 1 minute to 14 days', () => {
    expect(draftProblem('sms', draft({ delayVal: '0' }), true)).toMatch(/1 minute and 14 days/);
    expect(draftProblem('sms', draft({ delayVal: '' }), true)).toMatch(/1 minute and 14 days/);
    expect(draftProblem('sms', draft({ delayVal: '15', delayUnit: 'day' }), true)).toMatch(/1 minute and 14 days/);
    expect(draftProblem('sms', draft({ delayVal: '14', delayUnit: 'day' }), true)).toBeNull();
  });

  it('rejects a repeat window outside the same range', () => {
    expect(draftProblem('push', draft({ coolVal: '0' }), true)).toMatch(/before repeating/);
  });

  it('will not switch WhatsApp on without a template, but allows it while off', () => {
    expect(draftProblem('whatsapp', draft({ enabled: true, waTemplate: '  ' }), true)).toMatch(/template name/);
    expect(draftProblem('whatsapp', draft({ enabled: false, waTemplate: '' }), true)).toBeNull();
    expect(draftProblem('whatsapp', draft({ enabled: true, waTemplate: 'offers_available_update' }), true)).toBeNull();
  });

  it('needs both SMS fields or neither', () => {
    expect(draftProblem('sms', draft({ smsId: '123' }), true)).toMatch(/both/);
    expect(draftProblem('sms', draft({ smsBody: 'text' }), true)).toMatch(/both/);
    expect(draftProblem('sms', draft({ smsId: '123', smsBody: 'text' }), true)).toBeNull();
    expect(draftProblem('sms', draft({}), true)).toBeNull();
  });

  it('will not switch email or push on without an Upshot event', () => {
    for (const ch of ['email', 'push'] as const) {
      expect(draftProblem(ch, draft({ enabled: true, upshotEvent: ' ' }), true), ch).toMatch(/Upshot event/);
      expect(draftProblem(ch, draft({ enabled: false, upshotEvent: '' }), true), ch).toBeNull();
    }
  });

  it('checks a channel that is switched on even if nothing was edited', () => {
    expect(draftProblem('whatsapp', draft({ enabled: true, waTemplate: '' }), false)).toMatch(/template name/);
  });
});
