import { describe, expect, it } from 'vitest';
import { ruleBelongsTo, stagesForFlow, type FlowStep } from './stageFlows';

const stage = (key: string, activities: Array<{ channel: string; surface?: string }> = []) => ({
  key, label: key, description: '', surface: 'Website and app', activities, missingChannels: [] as string[],
});

const APP: FlowStep[] = [
  { key: 'otp_verified', label: 'PAN verification', description: 'Signed in, no PAN.' },
  { key: 'eligibility_started', label: 'Basic details', description: 'PAN verified.' },
];

describe('ruleBelongsTo', () => {
  it("'all' belongs to both tabs, a one-sided rule to its own, and an old rule with no side counts as 'all'", () => {
    expect(ruleBelongsTo('all', 'app')).toBe(true);
    expect(ruleBelongsTo('all', 'website')).toBe(true);
    expect(ruleBelongsTo(undefined, 'website')).toBe(true);
    expect(ruleBelongsTo('app', 'app')).toBe(true);
    expect(ruleBelongsTo('app', 'website')).toBe(false);
    expect(ruleBelongsTo('website', 'app')).toBe(false);
  });
});

describe('stagesForFlow', () => {
  const stages = [
    stage('lead_captured'),
    stage('otp_verified', [{ channel: 'sms', surface: 'all' }, { channel: 'whatsapp', surface: 'app' }, { channel: 'push', surface: 'website' }]),
    stage('eligibility_started', [{ channel: 'sms' }]),
  ];

  it("lists the flow's steps in the flow's order with its own names, skipping stages the flow does not have", () => {
    const out = stagesForFlow('app', APP, stages);
    expect(out.map((s) => [s.key, s.label])).toEqual([['otp_verified', 'PAN verification'], ['eligibility_started', 'Basic details']]);
    expect(out.every((s) => s.surface === 'App')).toBe(true);
  });

  it('shows only the follow-ups that apply to that side', () => {
    const app = stagesForFlow('app', APP, stages)[0];
    expect(app.activities.map((a) => a.channel).sort()).toEqual(['sms', 'whatsapp']);
    const web = stagesForFlow('website', APP, stages)[0];
    expect(web.activities.map((a) => a.channel).sort()).toEqual(['push', 'sms']);
  });

  it('a channel can be added where nothing covering that side exists yet, never beside an existing one', () => {
    const app = stagesForFlow('app', APP, stages)[0];
    expect(app.missingChannels).toEqual(['email', 'voice', 'push']);
    const web = stagesForFlow('website', APP, stages)[0];
    expect(web.missingChannels).toEqual(['whatsapp', 'email', 'voice']);
  });

  it('does not change the stages it was given', () => {
    const before = JSON.stringify(stages);
    stagesForFlow('app', APP, stages);
    expect(JSON.stringify(stages)).toBe(before);
  });
});
