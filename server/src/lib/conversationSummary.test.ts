import { describe, it, expect } from 'vitest';
import {
  normalizeSummaryConfig, shouldSendSummary, defaultActionPlan, forWhatsApp, buildSummaryVars,
  DEFAULT_SUMMARY_CONFIG, SUMMARY_TOKENS,
} from './conversationSummary.js';
import { buildPlaceholders } from './stallWhatsapp.js';
import { DEFAULT_SETTINGS } from './integrations.js';

describe('normalizeSummaryConfig', () => {
  it('is off with no template by default', () => {
    expect(normalizeSummaryConfig(undefined)).toEqual({ ...DEFAULT_SUMMARY_CONFIG });
    expect(DEFAULT_SETTINGS.voxvalley.conversationSummary.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.voxvalley.conversationSummary.template).toBe('');
  });

  it('only switches on when asked to, and keeps a clean template name', () => {
    const c = normalizeSummaryConfig({ enabled: true, template: ' conversation_summary ', language: 'en', placeholders: [' {name} ', '', '{summary}'] });
    expect(c).toEqual({ enabled: true, template: 'conversation_summary', language: 'en', placeholders: ['{name}', '{summary}'] });
    expect(normalizeSummaryConfig({ enabled: 'yes' }).enabled).toBe(false);
  });

  it('drops a bad template name rather than sending to it', () => {
    expect(normalizeSummaryConfig({ enabled: true, template: 'Bad Name!' }).template).toBe('');
  });

  it('caps the number of variables and never throws on junk', () => {
    expect(normalizeSummaryConfig({ placeholders: Array.from({ length: 30 }, (_, i) => `v${i}`) }).placeholders).toHaveLength(10);
    for (const junk of [null, 5, 'x', [], { placeholders: 'nope' }]) expect(() => normalizeSummaryConfig(junk)).not.toThrow();
  });
});

describe('shouldSendSummary', () => {
  it('stays silent when there was no real conversation or the customer refused', () => {
    for (const o of ['do_not_call', 'wrong_number', 'voicemail', 'unreachable', 'not_interested']) {
      expect(shouldSendSummary(o), o).toBe(false);
    }
  });

  it('sends after a real conversation, including an unclassified one', () => {
    for (const o of ['interested', 'callback_requested', 'installed_app', 'other', null, undefined]) {
      expect(shouldSendSummary(o as string | null | undefined), String(o)).toBe(true);
    }
  });
});

describe('defaultActionPlan', () => {
  it('promises a callback only with the time the customer asked for', () => {
    expect(defaultActionPlan('callback_requested', '28 Oct, 4:00 pm')).toContain('28 Oct, 4:00 pm');
    expect(defaultActionPlan('callback_requested', null)).not.toMatch(/undefined|null/);
  });

  it('always gives the customer a next step', () => {
    for (const o of ['interested', 'installed_app', 'other', null]) {
      expect(defaultActionPlan(o, null).length, String(o)).toBeGreaterThan(10);
    }
  });
});

describe('forWhatsApp', () => {
  it('flattens line breaks, tabs and long runs of spaces, which WhatsApp rejects', () => {
    expect(forWhatsApp('Line one\nLine two\t\tend    more')).toBe('Line one Line two end more');
  });

  it('truncates with an ellipsis and tolerates empty input', () => {
    const out = forWhatsApp('word '.repeat(200), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
    expect(forWhatsApp(null)).toBe('');
  });
});

describe('buildSummaryVars', () => {
  const base = { conversationId: 'c1', phone: '9876543210', source: 'call' as const };

  it('fills every token with a non-empty value, since WhatsApp rejects blank parameters', () => {
    const v = buildSummaryVars({ ...base, customerSummary: 'We discussed a 3 lakh personal loan.', outcome: null });
    for (const t of SUMMARY_TOKENS) expect(v[t.replace(/[{}]/g, '')], t).toBeTruthy();
    expect(v.name).toBe('there');
  });

  it('uses the first name, the agent action plan and the callback time', () => {
    const v = buildSummaryVars({
      ...base, customerName: 'Rahul Sharma', customerSummary: 'Recap', actionPlan: 'Open the app tonight.',
      outcome: 'callback_requested', callbackAt: new Date('2026-10-28T10:30:00Z'),
    });
    expect(v.name).toBe('Rahul');
    expect(v.actionPlan).toBe('Open the app tonight.');
    expect(v.callbackTime).toMatch(/28 Oct/);
    expect(v.outcome).toBe('Callback requested');
  });

  it('falls back to a default plan when the agent gave none', () => {
    expect(buildSummaryVars({ ...base, customerSummary: 'Recap', outcome: 'interested' }).actionPlan).toMatch(/SwiftLoan app/);
  });

  it('builds a complete placeholder list for the default template', () => {
    const vars = buildSummaryVars({ ...base, customerName: 'Asha', customerSummary: 'Recap text', outcome: 'other' });
    expect(buildPlaceholders(DEFAULT_SUMMARY_CONFIG.placeholders, vars)).toEqual(['Asha', 'Recap text', 'Our team will follow up with you shortly.']);
  });
});
