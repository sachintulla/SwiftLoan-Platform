import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './integrations.js';
import { readCatalog } from './whatsappCatalog.js';
import {
  STARTER_TEMPLATES, buildTemplateRows, categoryForTemplate, isSeeded, libraryAfterChange, readLibrary, renderTemplateText, starterLibrary, templateVariables, validateEntry, type TemplateEntry,
} from './voxTemplates.js';

const catalog = (saved: Record<string, any> = {}) => readCatalog(saved, DEFAULT_SETTINGS.voxvalley as Record<string, any>);
const entry = (over: Partial<TemplateEntry> = {}): TemplateEntry => ({ name: 'my_template', language: 'en', category: 'UTILITY', status: 'APPROVED', body: '', note: '', ...over });
const row = (rows: ReturnType<typeof buildTemplateRows>, name: string) => rows.find((r) => r.name === name)!;

describe('templateVariables', () => {
  it('counts distinct {{n}} variables', () => {
    expect(templateVariables('Hi {{1}}, your {{2}} is ready. {{1}}')).toBe(2);
    expect(templateVariables('Hi {{ 1 }}')).toBe(1);
    expect(templateVariables('no variables')).toBe(0);
    expect(templateVariables('')).toBe(0);
  });
});

describe('validateEntry', () => {
  it('accepts a good entry and normalises it', () => {
    expect(validateEntry({ name: ' my_template ', language: '', category: 'utility', status: 'approved', body: ' Hi {{1}} ', note: ' x ' })).toEqual({
      ok: true, entry: { name: 'my_template', language: 'en', category: 'UTILITY', status: 'APPROVED', body: 'Hi {{1}}', note: 'x' },
    });
  });
  it('category and status may be left blank (not recorded)', () => {
    const r = validateEntry({ name: 'a' });
    expect(r).toMatchObject({ ok: true, entry: { category: '', status: '' } });
  });
  it('refuses a missing or badly formed name', () => {
    expect(validateEntry({ name: '' }).ok).toBe(false);
    const bad = validateEntry({ name: 'My Template!' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.name).toMatch(/lowercase/);
  });
  it('refuses a bad language, category, status, or over-long text', () => {
    expect(validateEntry({ name: 'a', language: 'English' }).ok).toBe(false);
    expect(validateEntry({ name: 'a', category: 'PROMO' }).ok).toBe(false);
    expect(validateEntry({ name: 'a', status: 'DONE' }).ok).toBe(false);
    expect(validateEntry({ name: 'a', body: 'x'.repeat(1025) }).ok).toBe(false);
    expect(validateEntry({ name: 'a', note: 'x'.repeat(301) }).ok).toBe(false);
  });
});

describe('library storage', () => {
  it('"never saved" is not the same as empty', () => {
    expect(isSeeded(undefined)).toBe(false);
    expect(isSeeded({})).toBe(true);
    expect(isSeeded([])).toBe(false);
  });
  it('the starter list becomes the first stored library', () => {
    const lib = readLibrary(starterLibrary());
    expect(lib.length).toBe(STARTER_TEMPLATES.length);
    expect(lib.find((e) => e.name === 'dropoff_continue_app')).toMatchObject({ category: 'MARKETING', status: 'APPROVED' });
  });
  it('adds, changes and removes one template and leaves the rest', () => {
    let stored: unknown = starterLibrary();
    stored = libraryAfterChange(stored, { kind: 'set', entry: entry({ name: 'brand_new' }) });
    expect(readLibrary(stored).some((e) => e.name === 'brand_new')).toBe(true);
    stored = libraryAfterChange(stored, { kind: 'set', entry: entry({ name: 'brand_new', status: 'REJECTED' }) });
    expect(readLibrary(stored).filter((e) => e.name === 'brand_new')).toHaveLength(1);
    expect(readLibrary(stored).find((e) => e.name === 'brand_new')!.status).toBe('REJECTED');
    stored = libraryAfterChange(stored, { kind: 'remove', name: 'brand_new' });
    expect(readLibrary(stored).some((e) => e.name === 'brand_new')).toBe(false);
    expect(readLibrary(stored).length).toBe(STARTER_TEMPLATES.length);
  });
  it('does not change its input and tolerates junk', () => {
    const before = { a: entry({ name: 'a' }) };
    const copy = JSON.parse(JSON.stringify(before));
    libraryAfterChange(before, { kind: 'remove', name: 'a' });
    expect(before).toEqual(copy);
    expect(readLibrary({ x: null, y: 5, z: { name: 'ok', category: 'WEIRD', status: 'huh' } })).toEqual([{ name: 'ok', language: 'en', category: '', status: '', body: '', note: '' }]);
  });
});

describe('buildTemplateRows', () => {
  const lib = readLibrary(starterLibrary());

  it('lists every library entry, with the variables counted from its text', () => {
    const rows = buildTemplateRows([entry({ name: 'a', body: 'Hi {{1}} {{2}}' })], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'a', variables: 2, inLibrary: true });
  });

  it('lists a template a message uses even if nobody added it yet', () => {
    const rows = buildTemplateRows([], catalog({ installWhatsapp: { template: 'not_in_library', placeholders: [] } }));
    expect(row(rows, 'not_in_library')).toMatchObject({ inLibrary: false, category: '', status: '' });
    expect(row(rows, 'not_in_library').usedBy.map((u) => u.key)).toContain('install.reminder');
  });

  it('flags a message category that differs from the template\'s own', () => {
    const saved = { dropoffMessages: { continue: { whatsapp: { noLink: { template: 'dropoff_continue_app', placeholders: ['{name}', '{step}'], category: 'UTILITY' } } } } };
    expect(row(buildTemplateRows(lib, catalog(saved)), 'dropoff_continue_app').flags).toContain('category_differs');
    // blank category on the message = "card default": nothing to disagree with
    expect(row(buildTemplateRows(lib, catalog()), 'dropoff_continue_app').flags).not.toContain('category_differs');
  });

  it('flags a template in use but not approved, not one that is switched off', () => {
    const saved = { dropoffMessages: { apply_offers: { whatsapp: { noLink: { template: 'dropoff_offers_ready_link', placeholders: ['{name}'] } } } } };
    expect(row(buildTemplateRows(lib, catalog(saved)), 'dropoff_offers_ready_link').flags).toContain('not_approved');
    expect(row(buildTemplateRows(lib, catalog()), 'dropoff_offers_ready_link').flags).not.toContain('not_approved');
  });

  it('an unrecorded status or category never raises a flag', () => {
    const rows = buildTemplateRows(lib, catalog());
    expect(row(rows, 'offers_ready').flags).toEqual([]);
  });

  it('puts templates in use first, then the rest alphabetically', () => {
    const rows = buildTemplateRows(lib, catalog());
    const firstUnused = rows.findIndex((r) => !r.usedBy.some((u) => u.on));
    expect(rows.slice(0, firstUnused).every((r) => r.usedBy.some((u) => u.on))).toBe(true);
    const names = rows.slice(firstUnused).map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('renderTemplateText', () => {
  it('fills the {{n}} variables in order', () => {
    expect(renderTemplateText('Hi {{1}}, you stopped at {{2}}.', ['Priya', 'Basic details'])).toBe('Hi Priya, you stopped at Basic details.');
    expect(renderTemplateText('{{2}} then {{1}} then {{2}}', ['a', 'b'])).toBe('b then a then b');
  });
  it('leaves a variable visible when we have no value for it', () => {
    expect(renderTemplateText('Hi {{1}}, ref {{2}}', ['Priya'])).toBe('Hi Priya, ref {{2}}');
    expect(renderTemplateText('Hi {{1}}', [])).toBe('Hi {{1}}');
    expect(renderTemplateText('no variables', ['x'])).toBe('no variables');
  });
});

describe('categoryForTemplate', () => {
  const lib = [entry({ name: 'recorded', category: 'MARKETING' }), entry({ name: 'unrecorded', category: '' })];
  it('prefers what the team recorded as Meta\'s decision', () => {
    expect(categoryForTemplate('recorded', lib, 'UTILITY')).toBe('MARKETING');
  });
  it('falls back to the catalogue category, then to nothing (the card default)', () => {
    expect(categoryForTemplate('unrecorded', lib, 'UTILITY')).toBe('UTILITY');
    expect(categoryForTemplate('not_in_library', lib, 'UTILITY')).toBe('UTILITY');
    expect(categoryForTemplate('not_in_library', lib, undefined)).toBe('');
    expect(categoryForTemplate('not_in_library', lib, 'WEIRD')).toBe('');
  });
});

describe('catalogue proposals', () => {
  const proposal = { name: 'lead_request_received', language: 'en', category: 'UTILITY', body: 'Hi {{1}}, we received your request: {{2}}', purpose: 'Confirms the request.', replaces: 'marketing_check_rate' };

  it('shows a catalogue template nobody has recorded yet, marked as proposed', () => {
    const rows = buildTemplateRows([], [], [proposal]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'lead_request_received', proposed: true, inLibrary: false, category: '', status: '', variables: 2 });
    expect(rows[0].note).toMatch(/Replaces marketing_check_rate/);
    expect(rows[0].note).toMatch(/Utility/);
  });

  it('a recorded template wins over its proposal, and is no longer proposed', () => {
    const rows = buildTemplateRows([entry({ name: 'lead_request_received', status: 'PENDING' })], [], [proposal]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ proposed: false, inLibrary: true, status: 'PENDING' });
  });

  it('a template a message already uses gets the proposal\'s text, still marked proposed', () => {
    const rows = buildTemplateRows([], catalog({ installWhatsapp: { template: 'lead_request_received', placeholders: ['{name}', '{link}'] } }), [proposal]);
    expect(rows.find((r) => r.name === 'lead_request_received')).toMatchObject({ proposed: true, inLibrary: false, variables: 2 });
  });

  it('a proposal never raises a category or approval flag', () => {
    expect(buildTemplateRows([], [], [proposal])[0].flags).toEqual([]);
  });
});
