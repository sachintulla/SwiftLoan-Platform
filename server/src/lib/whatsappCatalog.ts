/**
 * The catalogue of every WhatsApp message the system sends, for Admin → Configs → WhatsApp (Vox).
 *
 * The messages live in four different Voxvalley settings (`dropoffMessages`, `installWhatsapp`, `appliedWhatsapp`, `stallTemplates`).
 * This module is the one place that knows where each one is stored, which {tokens} it may use, and how to read, validate and
 * change one without touching the others. Pure (no database), so the rules are unit-tested; the routes call it.
 *
 * A message's category (UTILITY | MARKETING | AUTHENTICATION) is kept PER TEMPLATE, as Meta approved it, and is sent with that
 * template. The card's single `messageCategory` is only the fallback for a template with none.
 */
import { DEFAULT_DROPOFF_MESSAGES, mergeDropoffMessages, type DropoffMessageKind, type DropoffMessages, type TemplateRef } from './dropoffSteps.js';
import { WHATSAPP_CATEGORIES, cleanCategory } from './whatsapp.js';

export type CatalogGroup = 'dropoff' | 'install' | 'applied' | 'stall';
export type CatalogSource = 'saved' | 'default';

export interface TemplateSpec {
  template: string;
  language: string;
  placeholders: string[];
  /** UTILITY | MARKETING | AUTHENTICATION, or '' = use the card's category. */
  category: string;
}

export interface CatalogItem {
  key: string;
  group: CatalogGroup;
  label: string;
  /** Plain-language "when does this go out". */
  when: string;
  /** Does the person get the app download link in this message. */
  link: 'yes' | 'no' | 'n/a';
  /** The {tokens} this message can fill. A token outside this list would be sent blank, so it is refused. */
  tokens: string[];
}

export interface CatalogEntry extends CatalogItem {
  /** What is used right now. `template: ''` = off (nothing is sent for this message). */
  spec: TemplateSpec;
  on: boolean;
  /** `saved` = set in the dashboard, `default` = the shipped default. */
  source: CatalogSource;
  /** The shipped default, if there is one (so the page can offer "reset"). */
  defaultSpec: TemplateSpec | null;
}

/** The "no offers" WhatsApp is NOT here: it is the eligibility notice, configured on Configs → Stage outreach (lib/offersNotice.ts). */
const DROPOFF_ITEMS: Array<CatalogItem & { kind: DropoffMessageKind; variant: 'withLink' | 'noLink' }> = [
  { key: 'dropoff.continue.withLink', group: 'dropoff', kind: 'continue', variant: 'withLink', label: 'Continue your application · with app link', link: 'yes',
    when: 'Stopped at step 2 or 3 and is not in the app yet (a website visitor).', tokens: ['name', 'step', 'link'] },
  { key: 'dropoff.continue.noLink', group: 'dropoff', kind: 'continue', variant: 'noLink', label: 'Continue your application · already in the app', link: 'no',
    when: 'Stopped at step 2 or 3 and already uses the app.', tokens: ['name', 'step'] },
  { key: 'dropoff.apply_offers.withLink', group: 'dropoff', kind: 'apply_offers', variant: 'withLink', label: 'Offers waiting, please apply · with app link', link: 'yes',
    when: 'Has offers but applied to none, and is not in the app yet.', tokens: ['name', 'offerCount', 'ref', 'link'] },
  { key: 'dropoff.apply_offers.noLink', group: 'dropoff', kind: 'apply_offers', variant: 'noLink', label: 'Offers waiting, please apply · already in the app', link: 'no',
    when: 'Has offers but applied to none, and already uses the app.', tokens: ['name', 'offerCount', 'ref'] },
];

const STANDALONE_ITEMS: CatalogItem[] = [
  { key: 'install.reminder', group: 'install', label: 'Website drop-off · install the app', link: 'yes',
    when: 'A website visitor left without installing the app (the install-link reminder sequence).', tokens: ['name', 'step', 'link'] },
  { key: 'applied.nudge', group: 'applied', label: 'You applied with a lender · track it in the app', link: 'yes',
    when: 'After someone taps Apply on a lender offer.', tokens: ['name', 'lender', 'link'] },
];

const STALL_LABELS: Record<string, { label: string; when: string }> = {
  lead_captured: { label: 'Stuck: website lead, never signed in', when: 'Left their number on the website and did nothing more.' },
  otp_verified: { label: 'Stuck: signed in, never started', when: 'Signed in but never started an application.' },
  eligibility_completed: { label: 'Stuck: offers ready, never opened', when: 'The eligibility check finished but they never opened their offers.' },
  offer_viewed: { label: 'Stuck: saw offers, chose none', when: 'Viewed offers and picked none.' },
  kyc_started: { label: 'Stuck: started KYC, stopped', when: 'Started eKYC and stopped.' },
};

const STALL_TOKENS = ['name', 'ref', 'offerCount', 'siteUrl'];

/* ───────────────────────────── keys ───────────────────────────── */

export function isStallKey(key: string): boolean {
  return /^stall\.[a-z][a-z0-9_]{0,60}$/.test(key);
}

/** The catalogue item (metadata only) for a key, or null if it is not one we know. */
export function itemFor(key: string): CatalogItem | null {
  const d = DROPOFF_ITEMS.find((i) => i.key === key);
  if (d) return d;
  const s = STANDALONE_ITEMS.find((i) => i.key === key);
  if (s) return s;
  if (isStallKey(key)) {
    const stage = key.slice('stall.'.length);
    const meta = STALL_LABELS[stage];
    return { key, group: 'stall', label: meta?.label ?? `Stuck at ${stage}`, when: meta?.when ?? `Stuck at the ${stage} step.`, link: 'n/a', tokens: STALL_TOKENS };
  }
  return null;
}

/* ───────────────────────────── reading ───────────────────────────── */

function toSpec(ref: Partial<TemplateRef> | null | undefined): TemplateSpec {
  return {
    template: String(ref?.template ?? '').trim(),
    language: String(ref?.language ?? '').trim() || 'en',
    placeholders: Array.isArray(ref?.placeholders) ? ref!.placeholders!.map(String) : [],
    category: cleanCategory(ref?.category) ?? '',
  };
}

/**
 * Every message with what is in force. `saved` is the settings row exactly as stored (NOT merged with defaults), because
 * "saved or shipped default" is what the page shows; `defaults` is the shipped voxvalley defaults.
 */
export function readCatalog(saved: Record<string, any> | null | undefined, defaults: Record<string, any>): CatalogEntry[] {
  const row = saved ?? {};
  const out: CatalogEntry[] = [];

  const savedDrop = (row.dropoffMessages ?? {}) as DropoffMessages;
  const mergedDrop = mergeDropoffMessages(DEFAULT_DROPOFF_MESSAGES, savedDrop);
  for (const it of DROPOFF_ITEMS) {
    const def = DEFAULT_DROPOFF_MESSAGES[it.kind]?.whatsapp?.[it.variant];
    const sv = savedDrop[it.kind]?.whatsapp?.[it.variant];
    const spec = toSpec(mergedDrop[it.kind]?.whatsapp?.[it.variant]);
    out.push({ ...strip(it), spec, on: !!spec.template, source: sv !== undefined ? 'saved' : 'default', defaultSpec: def ? toSpec(def) : null });
  }

  for (const it of STANDALONE_ITEMS) {
    const settingKey = it.key === 'install.reminder' ? 'installWhatsapp' : 'appliedWhatsapp';
    const spec = toSpec(row[settingKey] !== undefined ? row[settingKey] : defaults[settingKey]);
    out.push({ ...it, spec, on: !!spec.template, source: row[settingKey] !== undefined ? 'saved' : 'default', defaultSpec: defaults[settingKey] ? toSpec(defaults[settingKey]) : null });
  }

  const defStall = (defaults.stallTemplates ?? {}) as Record<string, TemplateRef>;
  const savedStall = (row.stallTemplates ?? {}) as Record<string, TemplateRef>;
  const stages = [...new Set([...Object.keys(STALL_LABELS), ...Object.keys(defStall), ...Object.keys(savedStall)])].filter((s) => isStallKey(`stall.${s}`));
  for (const stage of stages) {
    const it = itemFor(`stall.${stage}`)!;
    const sv = savedStall[stage];
    const spec = toSpec(sv !== undefined ? sv : defStall[stage]);
    out.push({ ...it, spec, on: !!spec.template, source: sv !== undefined ? 'saved' : 'default', defaultSpec: defStall[stage] ? toSpec(defStall[stage]) : null });
  }
  return out;
}

function strip<T extends CatalogItem & { kind?: unknown; variant?: unknown }>(it: T): CatalogItem {
  const { key, group, label, when, link, tokens } = it;
  return { key, group, label, when, link, tokens };
}

/* ───────────────────────────── validating ───────────────────────────── */

export type SpecInput = { template?: unknown; language?: unknown; placeholders?: unknown; category?: unknown };
export type SpecResult = { ok: true; spec: TemplateSpec } | { ok: false; errors: Record<string, string> };

/** Check what an admin typed for one message. Nothing is sent to Meta/Vox from here; this only decides whether it can be saved. */
export function validateSpec(item: CatalogItem, input: SpecInput): SpecResult {
  const errors: Record<string, string> = {};

  const template = String(input.template ?? '').trim();
  if (!template) errors.template = 'Enter the approved template name.';
  else if (!/^[a-z0-9_]{1,200}$/.test(template)) errors.template = 'Template names use lowercase letters, numbers and underscores only.';

  const language = String(input.language ?? '').trim() || 'en';
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) errors.language = 'Use a language code such as en, hi, te or en_US.';

  const rawCat = String(input.category ?? '').trim();
  const category = rawCat === '' ? '' : (cleanCategory(rawCat) ?? null);
  if (category === null) errors.category = `Category must be one of ${WHATSAPP_CATEGORIES.join(', ')} (or blank).`;

  let placeholders: string[] = [];
  if (input.placeholders !== undefined && !Array.isArray(input.placeholders)) errors.placeholders = 'Variables must be a list.';
  else {
    placeholders = ((input.placeholders as unknown[]) ?? []).map((p) => String(p ?? '').trim());
    if (placeholders.length > 10) errors.placeholders = 'A template has at most 10 variables.';
    else {
      const bad = placeholders.findIndex((p) => p === '');
      if (bad >= 0) errors.placeholders = `Variable ${bad + 1} is empty. Remove it or fill it in.`;
      else {
        for (const [i, p] of placeholders.entries()) {
          if (p.length > 200) { errors.placeholders = `Variable ${i + 1} is too long.`; break; }
          const stray = p.replace(/\{(\w+)\}/g, '');
          if (/[{}]/.test(stray)) { errors.placeholders = `Variable ${i + 1} has a stray brace. Write tokens like {name}.`; break; }
          const unknown = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).find((t) => !item.tokens.includes(t));
          if (unknown) { errors.placeholders = `{${unknown}} is not available for this message. Use: ${item.tokens.map((t) => `{${t}}`).join(', ')}.`; break; }
        }
      }
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, spec: { template, language, placeholders, category: category as string } };
}

/* ───────────────────────────── changing ───────────────────────────── */

export type Change =
  | { kind: 'set'; spec: TemplateSpec }
  /** Switch this message off but keep its other fields, so turning it back on is one field. */
  | { kind: 'off'; current: TemplateSpec }
  /** Forget the saved entry: the shipped default (or nothing) applies again. */
  | { kind: 'reset' };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? {}));

/**
 * The settings row after one message changes. Only that message's entry is touched; every other setting, and every other
 * message in the same setting, is carried over exactly as stored. Returns a new object (the input is not changed).
 */
export function settingsAfterChange(saved: Record<string, any> | null | undefined, key: string, change: Change): Record<string, any> {
  const next = clone(saved ?? {}) as Record<string, any>;
  const value = change.kind === 'set' ? change.spec : change.kind === 'off' ? { ...change.current, template: '' } : undefined;

  const dropoff = DROPOFF_ITEMS.find((i) => i.key === key);
  if (dropoff) {
    const root = (next.dropoffMessages ??= {});
    const channel = ((root[dropoff.kind] ??= {}).whatsapp ??= {});
    if (value === undefined) {
      delete channel[dropoff.variant];
      if (!Object.keys(channel).length) delete root[dropoff.kind].whatsapp;
      if (!Object.keys(root[dropoff.kind]).length) delete root[dropoff.kind];
      if (!Object.keys(root).length) delete next.dropoffMessages;
    } else channel[dropoff.variant] = value;
    return next;
  }
  if (key === 'install.reminder' || key === 'applied.nudge') {
    const settingKey = key === 'install.reminder' ? 'installWhatsapp' : 'appliedWhatsapp';
    if (value === undefined) delete next[settingKey];
    else next[settingKey] = value;
    return next;
  }
  if (isStallKey(key)) {
    const stage = key.slice('stall.'.length);
    const map = (next.stallTemplates ??= {});
    if (value === undefined) {
      delete map[stage];
      if (!Object.keys(map).length) delete next.stallTemplates;
    } else map[stage] = value;
    return next;
  }
  throw new Error(`Unknown message key: ${key}`);
}
