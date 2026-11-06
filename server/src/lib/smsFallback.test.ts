import { describe, it, expect } from 'vitest';
import { needsSmsFallback, whatsappStepsDueSms } from './smsFallback.js';

const NOW = new Date('2026-11-06T10:00:00Z');
const WAIT = 10 * 60_000;
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const steps = (h: unknown[]) => whatsappStepsDueSms(h, NOW, WAIT).map((x) => x.step);

describe('whatsappStepsDueSms (the SMS no longer depends on the WhatsApp going out)', () => {
  it('a sent WhatsApp step gets its SMS once the gap has passed, not before', () => {
    expect(steps([{ step: 0, channel: 'whatsapp', at: ago(11), outcome: 'sent' }])).toEqual([0]);
    expect(steps([{ step: 0, channel: 'whatsapp', at: ago(5), outcome: 'sent' }])).toEqual([]);
  });

  it('a WhatsApp that failed or was skipped for a WhatsApp-only reason still gets the SMS', () => {
    expect(steps([
      { step: 0, channel: 'whatsapp', at: ago(30), outcome: 'failed', reason: 'Meta 131049' },
      { step: 1, channel: 'whatsapp', at: ago(30), outcome: 'skipped', reason: 'whatsapp template not configured' },
      { step: 2, channel: 'whatsapp', at: ago(30), outcome: 'skipped', reason: 'whatsapp not configured' },
      { step: 3, channel: 'whatsapp', at: ago(30), outcome: 'skipped', reason: 'no link to carry' },
    ])).toEqual([0, 1, 2, 3]);
  });

  it('a step held back for every channel, or only logged, gets no SMS', () => {
    expect(steps([
      { step: 0, channel: 'whatsapp', at: ago(30), outcome: 'skipped', reason: 'not on the test-number list' },
      { step: 1, channel: 'whatsapp', at: ago(30), outcome: 'skipped', reason: 'daily contact limit reached' },
      { step: 2, channel: 'whatsapp', at: ago(30), outcome: 'logged' },
    ])).toEqual([]);
  });

  it('only WhatsApp steps from the last day; calls, SMS rows and junk are ignored', () => {
    expect(steps([
      { step: 0, channel: 'whatsapp', at: ago(25 * 60), outcome: 'sent' },
      { step: 1, channel: 'call', at: ago(30), outcome: 'sent' },
      { step: 2, channel: 'sms', at: ago(30), outcome: 'sent' },
      { step: -1, channel: 'voice', at: ago(30), outcome: 'sent' },
      null, 'x', { channel: 'whatsapp', at: ago(30), outcome: 'sent' },
    ])).toEqual([]);
    expect(whatsappStepsDueSms('not a list', NOW, WAIT)).toEqual([]);
  });
});

describe('needsSmsFallback', () => {
  it('always, unless narrowed to undelivered WhatsApps', () => {
    expect(needsSmsFallback('delivered')).toBe(true);
    expect(needsSmsFallback('delivered', true)).toBe(false);
    expect(needsSmsFallback('read', true)).toBe(false);
    expect(needsSmsFallback('failed', true)).toBe(true);
    expect(needsSmsFallback(null, true)).toBe(true); // nothing went out
  });
});
