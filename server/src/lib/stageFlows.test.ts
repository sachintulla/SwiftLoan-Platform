import { describe, expect, it } from 'vitest';
import { FLOW_STEPS, OUTREACH_STAGES, flowKeys, ruleBelongsTo, RULE_SURFACES } from './stageOutreach.js';

const stageKeys = new Set(OUTREACH_STAGES.map((s) => s.key));

describe('FLOW_STEPS', () => {
  it('every step stands on a real stage, with no stage twice in one flow', () => {
    for (const flow of ['app', 'website'] as const) {
      const keys = flowKeys(flow);
      for (const k of keys) expect(stageKeys.has(k), `${flow}:${k}`).toBe(true);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('the app starts at the install and the website at the enquiry form; neither lists the other\'s first step', () => {
    expect(flowKeys('app')[0]).toBe('app_installed');
    expect(flowKeys('website')[0]).toBe('lead_captured');
    expect(flowKeys('app')).not.toContain('lead_captured');
    expect(flowKeys('website')).not.toContain('app_installed');
  });

  it('Basic details and More details are ONE step on each side', () => {
    for (const flow of ['app', 'website'] as const) {
      const labels = FLOW_STEPS[flow].map((x) => x.label.toLowerCase());
      expect(labels.filter((l) => l.includes('basic details'))).toHaveLength(1);
      expect(labels.some((l) => l === 'more details')).toBe(false);
    }
  });

  it('both flows go in the order of the journey', () => {
    const order = OUTREACH_STAGES.map((s) => s.key);
    for (const flow of ['app', 'website'] as const) {
      const idx = flowKeys(flow).map((k) => order.indexOf(k));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });

  it('every step has a plain label and a description', () => {
    for (const flow of ['app', 'website'] as const) {
      for (const st of FLOW_STEPS[flow]) {
        expect(st.label.trim().length).toBeGreaterThan(3);
        expect(st.description.trim().length).toBeGreaterThan(10);
      }
    }
  });
});

describe('ruleBelongsTo', () => {
  it('a rule for both sides shows on both tabs; a one-sided rule only on its own', () => {
    expect(ruleBelongsTo('all', 'app')).toBe(true);
    expect(ruleBelongsTo('all', 'website')).toBe(true);
    expect(ruleBelongsTo(undefined, 'app')).toBe(true);
    expect(ruleBelongsTo('app', 'app')).toBe(true);
    expect(ruleBelongsTo('app', 'website')).toBe(false);
    expect(ruleBelongsTo('website', 'app')).toBe(false);
    expect(RULE_SURFACES).toEqual(['all', 'app', 'website']);
  });
});
