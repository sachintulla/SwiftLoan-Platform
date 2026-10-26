import { describe, it, expect } from 'vitest';
import {
  OUTREACH_STAGES, VARIABLE_INFO, VARIABLE_LIST, MAX_BRIEF_LENGTH,
  isOutreachStage, normalizeStageCalls, renderBrief,
} from './stageOutreach.js';
import { LEAD_CALL_VARIABLES } from './callContext.js';
import { DEFAULT_SETTINGS } from './integrations.js';
import { DEFAULT_STALL_RULES } from './stallRules.js';

describe('outreach stages', () => {
  it('are the same stages the WhatsApp templates are keyed on', () => {
    const whatsappStages = Object.keys(DEFAULT_SETTINGS.voxvalley.stallTemplates);
    expect(OUTREACH_STAGES.map((s) => s.key).sort()).toEqual(whatsappStages.sort());
  });

  it('each have a call rule shipped, so every WhatsApp stage can also ring', () => {
    for (const s of OUTREACH_STAGES) {
      const hasCall = DEFAULT_STALL_RULES.some((r) => r.triggerEvent === s.key && r.channel === 'voice');
      expect(hasCall, s.key).toBe(true);
    }
  });

  it('recognises only known stages', () => {
    expect(isOutreachStage('offer_viewed')).toBe(true);
    expect(isOutreachStage('app_opened')).toBe(false);
  });
});

describe('variable documentation', () => {
  it('describes every variable the agent receives, and nothing else', () => {
    expect(Object.keys(VARIABLE_INFO).sort()).toEqual([...LEAD_CALL_VARIABLES].sort());
    expect(VARIABLE_LIST).toHaveLength(LEAD_CALL_VARIABLES.length);
  });

  it('gives each one a description and an example', () => {
    for (const v of VARIABLE_LIST) {
      expect(v.description.length, v.name).toBeGreaterThan(5);
      expect(v.example.length, v.name).toBeGreaterThan(0);
    }
  });
});

describe('normalizeStageCalls', () => {
  it('keeps valid settings and trims them', () => {
    expect(normalizeStageCalls({ offer_viewed: { agentRole: 'statusUpdate', assistantId: '  abc123 ', brief: '  hi  ' } }))
      .toEqual({ offer_viewed: { agentRole: 'statusUpdate', assistantId: 'abc123', brief: 'hi' } });
  });

  it('drops unknown stages, unknown roles and empty values', () => {
    expect(normalizeStageCalls({
      app_opened: { brief: 'x' },
      kyc_started: { agentRole: 'notARole', assistantId: '   ', brief: '' },
      otp_verified: { agentRole: 'nope', brief: 'keep me' },
    })).toEqual({ otp_verified: { brief: 'keep me' } });
  });

  it('caps the brief length', () => {
    const out = normalizeStageCalls({ offer_viewed: { brief: 'a'.repeat(MAX_BRIEF_LENGTH + 500) } });
    expect(out.offer_viewed.brief).toHaveLength(MAX_BRIEF_LENGTH);
  });

  it('never throws on junk', () => {
    for (const junk of [null, undefined, 5, 'x', [], { offer_viewed: 7 }]) {
      expect(() => normalizeStageCalls(junk)).not.toThrow();
    }
  });
});

describe('renderBrief', () => {
  it('fills the customer values in', () => {
    expect(renderBrief('Greet {lead_first_name} and mention {lead_amount}.', { lead_first_name: 'Rahul', lead_amount: '₹3,00,000' }))
      .toBe('Greet Rahul and mention ₹3,00,000.');
  });

  it('never leaves braces for the agent to read aloud', () => {
    const out = renderBrief('Hi {lead_first_name}, about your {lead_product} loan {unknown_thing}.', { lead_first_name: 'Rahul' });
    expect(out).not.toMatch(/[{}]/);
    expect(out).toBe('Hi Rahul, about your loan.');
  });
});
