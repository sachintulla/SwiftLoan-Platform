import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './integrations.js';
import { itemFor, readCatalog, settingsAfterChange, validateSpec, type TemplateSpec } from './whatsappCatalog.js';

const defaults = DEFAULT_SETTINGS.voxvalley as Record<string, any>;
const find = (list: ReturnType<typeof readCatalog>, key: string) => list.find((e) => e.key === key)!;
const spec = (over: Partial<TemplateSpec> = {}): TemplateSpec => ({ template: 'my_template', language: 'en', placeholders: ['{name}'], category: 'UTILITY', ...over });

describe('readCatalog', () => {
  it('lists every message the system sends over WhatsApp', () => {
    const keys = readCatalog({}, defaults).map((e) => e.key);
    for (const k of [
      'dropoff.continue.withLink', 'dropoff.continue.noLink', 'dropoff.apply_offers.withLink', 'dropoff.apply_offers.noLink',
      'install.reminder', 'applied.nudge', 'stall.lead_captured', 'stall.otp_verified', 'stall.eligibility_completed', 'stall.offer_viewed',
    ]) expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('shows the shipped defaults when nothing is saved', () => {
    const list = readCatalog({}, defaults);
    const e = find(list, 'dropoff.continue.withLink');
    expect(e.spec.template).toBe('install_app_resume_step');
    expect(e.source).toBe('default');
    expect(e.on).toBe(true);
    expect(find(list, 'install.reminder').spec.template).toBe('install_app_resume_step');
  });

  it('the "no offers" WhatsApp is not in this list: it is the eligibility notice on Stage outreach', () => {
    expect(readCatalog({}, defaults).some((e) => e.key.includes('no_offers'))).toBe(false);
  });

  it('a saved entry wins over the default, one message at a time', () => {
    const saved = { dropoffMessages: { continue: { whatsapp: { noLink: { template: 'dropoff_pending_step_app', language: 'en', placeholders: ['{name}', '{step}'], category: 'UTILITY' } } } } };
    const list = readCatalog(saved, defaults);
    const changed = find(list, 'dropoff.continue.noLink');
    expect(changed.spec.template).toBe('dropoff_pending_step_app');
    expect(changed.spec.category).toBe('UTILITY');
    expect(changed.source).toBe('saved');
    // the sibling variant was never saved: still the shipped default
    expect(find(list, 'dropoff.continue.withLink').spec.template).toBe('install_app_resume_step');
    expect(find(list, 'dropoff.continue.withLink').source).toBe('default');
  });

  it('a blank saved template means off, not "use the default"', () => {
    const saved = { installWhatsapp: { template: '', language: 'en', placeholders: [] } };
    const e = find(readCatalog(saved, defaults), 'install.reminder');
    expect(e.on).toBe(false);
    expect(e.source).toBe('saved');
  });

  it('stuck-stage templates merge saved over default and surface unknown stages', () => {
    const saved = { stallTemplates: { offer_viewed: { template: 'x_y', placeholders: ['{name}'] }, brand_new_stage: { template: 'z' } } };
    const list = readCatalog(saved, defaults);
    expect(find(list, 'stall.offer_viewed').spec.template).toBe('x_y');
    expect(find(list, 'stall.lead_captured').spec.template).toBe('marketing_check_rate');
    expect(find(list, 'stall.brand_new_stage').spec.template).toBe('z');
  });

  it('an unknown category in old data shows as blank instead of crashing', () => {
    const saved = { appliedWhatsapp: { template: 'a', category: 'WEIRD' } };
    expect(find(readCatalog(saved, defaults), 'applied.nudge').spec.category).toBe('');
  });
});

describe('validateSpec', () => {
  const item = itemFor('dropoff.continue.withLink')!;

  it('accepts a good template and normalises category case', () => {
    const r = validateSpec(item, { template: ' my_template ', language: '', placeholders: [' {name} ', '{step}', '{link}'], category: 'utility' });
    expect(r).toEqual({ ok: true, spec: { template: 'my_template', language: 'en', placeholders: ['{name}', '{step}', '{link}'], category: 'UTILITY' } });
  });

  it('refuses a missing or badly formed template name', () => {
    expect(validateSpec(item, { template: '' }).ok).toBe(false);
    const bad = validateSpec(item, { template: 'My Template!' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.template).toMatch(/lowercase/);
  });

  it('refuses a token this message cannot fill (it would go out blank)', () => {
    const r = validateSpec(item, { template: 'a', placeholders: ['{name}', '{lender}'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.placeholders).toMatch(/\{lender\} is not available/);
  });

  it('the no-link variants cannot use {link}', () => {
    const noLink = itemFor('dropoff.continue.noLink')!;
    expect(validateSpec(noLink, { template: 'a', placeholders: ['{name}', '{link}'] }).ok).toBe(false);
    expect(validateSpec(noLink, { template: 'a', placeholders: ['{name}', '{step}'] }).ok).toBe(true);
  });

  it('refuses stray braces, empty variables, too many variables, bad category, bad language', () => {
    expect(validateSpec(item, { template: 'a', placeholders: ['{name'] }).ok).toBe(false);
    expect(validateSpec(item, { template: 'a', placeholders: ['{name}', ''] }).ok).toBe(false);
    expect(validateSpec(item, { template: 'a', placeholders: Array.from({ length: 11 }, () => 'x') }).ok).toBe(false);
    expect(validateSpec(item, { template: 'a', category: 'PROMO' }).ok).toBe(false);
    expect(validateSpec(item, { template: 'a', language: 'English' }).ok).toBe(false);
  });

  it('allows literal text and a template with no variables', () => {
    expect(validateSpec(item, { template: 'a', placeholders: ['{name}', 'your KYC details'] }).ok).toBe(true);
    expect(validateSpec(item, { template: 'a' }).ok).toBe(true);
  });

  it('stuck-stage messages may use {siteUrl}', () => {
    const stall = itemFor('stall.offer_viewed')!;
    expect(validateSpec(stall, { template: 'a', placeholders: ['{name}', '{siteUrl}/apply/offers'] }).ok).toBe(true);
  });

  it('only known keys have an item', () => {
    expect(itemFor('dropoff.nope.withLink')).toBeNull();
    expect(itemFor('whatever')).toBeNull();
    expect(itemFor('stall.Bad Key')).toBeNull();
  });
});

describe('settingsAfterChange', () => {
  const before = {
    projectId: 'PRJ1', sender: '9190',
    installWhatsapp: { template: 'keep_me', language: 'en', placeholders: [] },
    dropoffMessages: { continue: { whatsapp: { withLink: { template: 'old', language: 'en', placeholders: [] } }, sms: { noLink: { templateId: '1', body: 'x' } } } },
    stallTemplates: { offer_viewed: { template: 'a' }, kyc_started: { template: 'b' } },
  };

  it('changes only the one message and leaves everything else as stored', () => {
    const next = settingsAfterChange(before, 'dropoff.continue.noLink', { kind: 'set', spec: spec() });
    expect(next.dropoffMessages.continue.whatsapp.noLink.template).toBe('my_template');
    expect(next.dropoffMessages.continue.whatsapp.withLink.template).toBe('old');
    expect(next.dropoffMessages.continue.sms.noLink.templateId).toBe('1'); // SMS part untouched
    expect(next.installWhatsapp.template).toBe('keep_me');
    expect(next.projectId).toBe('PRJ1');
    expect(next.stallTemplates).toEqual(before.stallTemplates);
  });

  it('does not change its input', () => {
    const copy = JSON.parse(JSON.stringify(before));
    settingsAfterChange(before, 'stall.offer_viewed', { kind: 'set', spec: spec() });
    expect(before).toEqual(copy);
  });

  it('sets install, applied and stall entries', () => {
    expect(settingsAfterChange({}, 'install.reminder', { kind: 'set', spec: spec() }).installWhatsapp.template).toBe('my_template');
    expect(settingsAfterChange({}, 'applied.nudge', { kind: 'set', spec: spec() }).appliedWhatsapp.category).toBe('UTILITY');
    expect(settingsAfterChange({}, 'stall.kyc_started', { kind: 'set', spec: spec() }).stallTemplates.kyc_started.template).toBe('my_template');
  });

  it('"off" blanks only the template and keeps the rest for turning it back on', () => {
    const next = settingsAfterChange(before, 'stall.kyc_started', { kind: 'off', current: spec({ template: 'b', placeholders: ['{name}'] }) });
    expect(next.stallTemplates.kyc_started).toEqual({ template: '', language: 'en', placeholders: ['{name}'], category: 'UTILITY' });
    expect(next.stallTemplates.offer_viewed.template).toBe('a');
  });

  it('"reset" removes the saved entry and tidies empty parents', () => {
    const next = settingsAfterChange(before, 'dropoff.continue.withLink', { kind: 'reset' });
    expect(next.dropoffMessages.continue.whatsapp).toBeUndefined();
    expect(next.dropoffMessages.continue.sms.noLink.templateId).toBe('1');
    const onlyOne = settingsAfterChange({ installWhatsapp: { template: 'x' } }, 'install.reminder', { kind: 'reset' });
    expect(onlyOne.installWhatsapp).toBeUndefined();
    const last = settingsAfterChange({ stallTemplates: { offer_viewed: { template: 'a' } } }, 'stall.offer_viewed', { kind: 'reset' });
    expect(last.stallTemplates).toBeUndefined();
  });

  it('after a reset the shipped default shows again; after a set the saved one does', () => {
    const saved = settingsAfterChange({}, 'install.reminder', { kind: 'set', spec: spec({ template: 'new_one' }) });
    expect(find(readCatalog(saved, defaults), 'install.reminder').spec.template).toBe('new_one');
    const back = settingsAfterChange(saved, 'install.reminder', { kind: 'reset' });
    expect(find(readCatalog(back, defaults), 'install.reminder')).toMatchObject({ source: 'default' });
  });

  it('refuses a key it does not know', () => {
    expect(() => settingsAfterChange({}, 'nope', { kind: 'reset' })).toThrow();
  });
});
