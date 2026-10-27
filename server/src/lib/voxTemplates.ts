/**
 * The WhatsApp template library, for Admin → Configs → WhatsApp (Vox) → Templates.
 *
 * It is the admin's OWN record of the templates that exist in Vox / Meta: name, language, category, approval status, text and a note.
 * Adding a template here does NOT create it in Vox; it only records it so the team can see everything in one place, pick it when setting up
 * a message, and be warned when a message's category disagrees with the template's or the template is not approved yet.
 * (Vox's Templates API rejects the token that sends, so nothing is pulled from Vox.)
 *
 * Stored in the Voxvalley settings as `templateLibrary` (name → entry). The first time it is read it is filled from `STARTER_TEMPLATES`,
 * our notes of 27 Oct 2026, so nobody starts from an empty page; after that it is only what the dashboard saved. Pure (no database), so it is unit-tested.
 */
import { cleanCategory, WHATSAPP_CATEGORIES } from './whatsapp.js';
import type { CatalogEntry } from './whatsappCatalog.js';

const cap = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);

export const TEMPLATE_STATUSES = ['APPROVED', 'PENDING', 'REJECTED'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export interface TemplateEntry {
  name: string;
  language: string;
  /** '' = not recorded. */
  category: string;
  /** '' = not recorded. */
  status: string;
  /** The message text, with {{1}}, {{2}}… (optional). */
  body: string;
  note: string;
}

export const STARTER_AS_OF = '2026-10-27';

const t = (name: string, category: string, status: string, note = '', body = ''): TemplateEntry => ({ name, language: 'en', category, status, body, note });

/** What we last saw in the Vox portal and Meta's review (docs/JOURNEY_RESUME_TEMPLATES.md §6). A starting point, to be corrected in the dashboard. */
export const STARTER_TEMPLATES: readonly TemplateEntry[] = Object.freeze([
  t('dropoff_no_offers_callback', 'UTILITY', 'APPROVED', 'No offers: "we will call you".'),
  t('dropoff_applied_app', 'UTILITY', 'APPROVED', 'You applied: check the status in the app.'),
  t('dropoff_applied_link', 'UTILITY', 'PENDING', 'You applied: check the status with the link.'),
  t('dropoff_offers_ready_link', 'UTILITY', 'PENDING', 'Offers ready: review and apply with the link.'),
  t('dropoff_pending_step_app', 'UTILITY', 'PENDING', 'Continue the pending step in the app.'),
  t('dropoff_apply_offers_app', 'MARKETING', 'APPROVED', 'Submitted as Utility; Meta changed it to Marketing.'),
  t('dropoff_continue_app', 'MARKETING', 'APPROVED', 'Submitted as Utility; Meta changed it to Marketing. Two "_copy" entries exist in the portal.'),
  t('install_app_resume_step', 'MARKETING', 'APPROVED', 'Continue with the app link.',
    'Hi {{1}}, your SwiftLoan loan application is incomplete at {{2}}. Please open the SwiftLoan app to continue where you left off: {{3}}\n\nIt takes about 3 minutes.'),
  t('application_pending_reminder', 'UTILITY', 'APPROVED', 'Names the application reference and the pending step.'),
  t('loan_applied_install_app', '', 'PENDING', 'You applied: install the app to track it. Waiting for Meta.',
    'Hi {{1}}, you applied for a loan with {{2}} through SwiftLoan. Install the SwiftLoan app to track your application and get updates in one place: {{3}}\n\nIt takes less than a minute.'),
  t('marketing_check_rate', '', ''),
  t('offers_ready', '', ''),
  t('document_request', '', ''),
  t('application_received', '', ''),
  t('emi_reminder', '', ''),
  t('kyc_completed', '', ''),
  t('loan_disbursed', '', ''),
  t('otp_verification', '', ''),
]);

/** How many distinct {{n}} variables the text has. */
export function templateVariables(body: string): number {
  return new Set([...String(body ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;
}

/** The template text with the {{1}}, {{2}}… filled in. A value we do not have leaves its {{n}} visible, so a gap is never hidden. */
export function renderTemplateText(body: string, values: readonly string[]): string {
  return String(body ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n: string) => values[Number(n) - 1] ?? m);
}

/* ───────────────────────────── validating ───────────────────────────── */

export type EntryInput = { name?: unknown; language?: unknown; category?: unknown; status?: unknown; body?: unknown; note?: unknown };
export type EntryResult = { ok: true; entry: TemplateEntry } | { ok: false; errors: Record<string, string> };

/** Check what an admin typed for one template. Nothing is sent to Vox or Meta. */
export function validateEntry(input: EntryInput): EntryResult {
  const errors: Record<string, string> = {};

  const name = String(input.name ?? '').trim();
  if (!name) errors.name = 'Enter the template name.';
  else if (!/^[a-z0-9_]{1,200}$/.test(name)) errors.name = 'Template names use lowercase letters, numbers and underscores only.';

  const language = String(input.language ?? '').trim() || 'en';
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) errors.language = 'Use a language code such as en, hi, te or en_US.';

  const rawCat = String(input.category ?? '').trim();
  const category = rawCat === '' ? '' : (cleanCategory(rawCat) ?? null);
  if (category === null) errors.category = `Category must be one of ${WHATSAPP_CATEGORIES.join(', ')} (or blank if unknown).`;

  const rawStatus = String(input.status ?? '').trim().toUpperCase();
  if (rawStatus !== '' && !(TEMPLATE_STATUSES as readonly string[]).includes(rawStatus)) errors.status = `Status must be one of ${TEMPLATE_STATUSES.join(', ')} (or blank if unknown).`;

  const body = String(input.body ?? '').trim();
  if (body.length > 1024) errors.body = 'WhatsApp allows at most 1024 characters in a template text.';
  const note = String(input.note ?? '').trim();
  if (note.length > 300) errors.note = 'Keep the note under 300 characters.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, entry: { name, language, category: category as string, status: rawStatus, body, note } };
}

/* ───────────────────────────── storing ───────────────────────────── */

type Library = Record<string, TemplateEntry>;

/** The library as stored. `undefined` (never saved) is NOT the same as empty: it means "fill from the starter list". */
export function starterLibrary(): Library {
  return Object.fromEntries(STARTER_TEMPLATES.map((e) => [e.name, { ...e }]));
}

export function isSeeded(stored: unknown): boolean {
  return !!stored && typeof stored === 'object' && !Array.isArray(stored);
}

/** Entries in the stored map, tolerant of old or hand-edited data. */
export function readLibrary(stored: unknown): TemplateEntry[] {
  if (!isSeeded(stored)) return [];
  const out: TemplateEntry[] = [];
  for (const [key, raw] of Object.entries(stored as Record<string, Partial<TemplateEntry>>)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(raw.name ?? key).trim();
    if (!name) continue;
    out.push({
      name,
      language: String(raw.language ?? '').trim() || 'en',
      category: cleanCategory(raw.category) ?? '',
      status: (TEMPLATE_STATUSES as readonly string[]).includes(String(raw.status ?? '').toUpperCase()) ? String(raw.status).toUpperCase() : '',
      body: String(raw.body ?? ''),
      note: String(raw.note ?? ''),
    });
  }
  return out;
}

/** The stored map after one template is added, changed or removed. Returns a new object. */
export function libraryAfterChange(stored: unknown, change: { kind: 'set'; entry: TemplateEntry } | { kind: 'remove'; name: string }): Library {
  const next: Library = {};
  for (const e of readLibrary(stored)) next[e.name] = e;
  if (change.kind === 'set') next[change.entry.name] = change.entry;
  else delete next[change.name];
  return next;
}

/**
 * The category to send with a template: what the team recorded as Meta's decision for it in the Templates tab, else the category the template
 * catalogue (lib/whatsappTemplates.ts) was written for, else none (the card's category is the fallback). Used by Stage outreach so a Utility
 * template chosen there actually goes out as Utility instead of the card's single default.
 */
export function categoryForTemplate(name: string, library: readonly TemplateEntry[], catalogueCategory?: string | null): string {
  const recorded = library.find((t) => t.name === name)?.category;
  return cleanCategory(recorded) ?? cleanCategory(catalogueCategory) ?? '';
}

/* ───────────────────────────── merged view ───────────────────────────── */

export type TemplateFlag = 'category_differs' | 'not_approved';

export interface TemplateUse { key: string; label: string; on: boolean; category: string }

/** A template the catalogue (lib/whatsappTemplates.ts) says we should have, shown even when nobody has added it yet. */
export interface TemplateProposal { name: string; language: string; category: string; body: string; purpose: string; replaces?: string }

export interface TemplateRow extends TemplateEntry {
  variables: number;
  /** true = from the template catalogue, not submitted or recorded yet. */
  proposed: boolean;
  /** false = a message uses this name but nobody has added it to the library yet. */
  inLibrary: boolean;
  usedBy: TemplateUse[];
  flags: TemplateFlag[];
}

/**
 * One row per template: everything in the library, plus any template a message uses that is not in it yet (so the list is complete).
 * Flags only compare things that are recorded: a message's own category that differs from the template's, and a template that is in
 * use but recorded as not approved.
 */
export function buildTemplateRows(library: readonly TemplateEntry[], catalog: readonly CatalogEntry[], proposals: readonly TemplateProposal[] = []): TemplateRow[] {
  const uses = new Map<string, TemplateUse[]>();
  for (const e of catalog) {
    if (!e.spec.template) continue;
    const list = uses.get(e.spec.template) ?? [];
    list.push({ key: e.key, label: e.label, on: e.on, category: e.spec.category });
    uses.set(e.spec.template, list);
  }

  const rows = new Map<string, TemplateRow>();
  const proposal = new Map(proposals.map((p) => [p.name, p]));
  const proposedNote = (p: TemplateProposal) => `Proposed in the template catalogue, not recorded yet: ${p.purpose}${p.replaces ? ` Replaces ${p.replaces}.` : ''} Category it was written for: ${cap(p.category)}.`;
  for (const e of library) rows.set(e.name, { ...e, variables: templateVariables(e.body), proposed: false, inLibrary: true, usedBy: uses.get(e.name) ?? [], flags: [] });
  for (const [name, usedBy] of uses) {
    if (rows.has(name)) continue;
    const spec = catalog.find((c) => c.spec.template === name)!.spec;
    const p = proposal.get(name);
    rows.set(name, { name, language: spec.language || 'en', category: '', status: '', body: p?.body ?? '', note: p ? proposedNote(p) : '', variables: p ? templateVariables(p.body) : 0, proposed: !!p, inLibrary: false, usedBy, flags: [] });
  }
  for (const p of proposals) {
    if (rows.has(p.name)) continue;
    rows.set(p.name, { name: p.name, language: p.language, category: '', status: '', body: p.body, note: proposedNote(p), variables: templateVariables(p.body), proposed: true, inLibrary: false, usedBy: [], flags: [] });
  }

  for (const row of rows.values()) {
    const inUse = row.usedBy.filter((u) => u.on);
    if (row.category && row.usedBy.some((u) => u.category && u.category !== row.category)) row.flags.push('category_differs');
    if (row.status && row.status !== 'APPROVED' && inUse.length) row.flags.push('not_approved');
  }

  return [...rows.values()].sort((a, b) => {
    const au = a.usedBy.some((u) => u.on) ? 0 : 1;
    const bu = b.usedBy.some((u) => u.on) ? 0 : 1;
    return au - bu || a.name.localeCompare(b.name);
  });
}
