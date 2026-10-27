import { describe, it, expect } from 'vitest';
import {
  WHATSAPP_TEMPLATES, LEGACY_TEMPLATES, templateByName, previewBody, toMetaPayload, recommendedForStage,
} from './whatsappTemplates.js';
import { OUTREACH_STAGES } from './stageOutreach.js';
import { DEFAULT_SETTINGS } from './integrations.js';

const BANNED = /\b(discount|cashback|limited time|hurry|exclusive|best rate|lowest|apply now|congratulations|guaranteed|instant approval|special offer|free|act now|don't miss|last chance)\b|!/i;

describe('every template is submitted as utility', () => {
  it('uses the UTILITY category only', () => {
    for (const t of WHATSAPP_TEMPLATES) expect(t.category, t.name).toBe('UTILITY');
  });

  it('has a Meta-valid name, once each', () => {
    const names = WHATSAPP_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n, n).toMatch(/^[a-z0-9_]{1,100}$/);
  });

  it('has sequential variables from {{1}}, each with a sample value and a description', () => {
    for (const t of WHATSAPP_TEMPLATES) {
      const nums = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(nums, t.name).toEqual(nums.map((_, i) => i + 1));
      expect(t.examples, t.name).toHaveLength(nums.length);
      expect(t.variables, t.name).toHaveLength(nums.length);
      expect(t.placeholders, t.name).toHaveLength(nums.length);
      for (const e of t.examples) expect(e.trim().length, t.name).toBeGreaterThan(0);
    }
  });

  it('never starts or ends the body with a variable, and never puts two side by side', () => {
    for (const t of WHATSAPP_TEMPLATES) {
      expect(t.body.trim(), t.name).not.toMatch(/^\{\{\d+\}\}/);
      expect(t.body.trim(), t.name).not.toMatch(/\{\{\d+\}\}$/);
      expect(t.body, t.name).not.toMatch(/\}\}\s*\{\{/);
    }
  });

  it('stays inside WhatsApp limits and avoids promotional wording', () => {
    for (const t of WHATSAPP_TEMPLATES) {
      expect(t.body.length, t.name).toBeLessThanOrEqual(1024);
      expect(t.footer.length, t.name).toBeLessThanOrEqual(60);
      expect(t.body, t.name).not.toMatch(BANNED);
      expect(t.body, t.name).not.toMatch(/\n{3,}| {5,}/);
    }
  });

  it('ties the message to the customer own request, not a pitch', () => {
    for (const t of WHATSAPP_TEMPLATES) {
      expect(t.body, t.name).toMatch(/your (loan|application|details|request|conversation|account)|you (signed|started)|your loan/i);
    }
  });
});

describe('the catalogue covers every place WhatsApp is used', () => {
  it('has a template for each sender', () => {
    const targets = new Set(WHATSAPP_TEMPLATES.map((t) => t.target));
    for (const t of ['stage', 'install', 'applied', 'summary', 'noOffers', 'eligibilityRetry'] as const) expect(targets.has(t), t).toBe(true);
  });

  it('recommends a template for every stage that ships with a WhatsApp default', () => {
    for (const stage of Object.keys(DEFAULT_SETTINGS.voxvalley.stallTemplates)) {
      expect(recommendedForStage(stage), stage).toBeDefined();
    }
  });

  it('only recommends real stages', () => {
    const stages = OUTREACH_STAGES.map((s) => s.key);
    for (const t of WHATSAPP_TEMPLATES) for (const s of t.recommendedStages) expect(stages, `${t.name}:${s}`).toContain(s);
  });

  it('flags every legacy template and points to a catalogue replacement', () => {
    for (const l of LEGACY_TEMPLATES) {
      expect(l.replacement.split('/').map((s) => s.trim()).every((n) => templateByName(n)), l.name).toBe(true);
    }
    expect(WHATSAPP_TEMPLATES.some((t) => t.name === 'marketing_check_rate')).toBe(false);
  });
});

describe('helpers', () => {
  it('previews with the sample values', () => {
    const t = templateByName('no_offers_update')!;
    expect(previewBody(t)).toContain('Hi Priya,');
    expect(previewBody(t)).not.toMatch(/\{\{/);
  });

  it('builds a Meta-format submission with examples', () => {
    const p = toMetaPayload(templateByName('offers_available_update')!);
    expect(p.category).toBe('UTILITY');
    expect(p.components[0]).toMatchObject({ type: 'BODY', example: { body_text: [['Priya', 'SL-884021', '3', 'https://www.swiftloan.ai/apply/offers']] } });
  });
});
