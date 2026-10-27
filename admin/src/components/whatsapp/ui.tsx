'use client';
// Shared pieces for the WhatsApp (Vox) page: types, sample values and the small building blocks.
import React from 'react';

export type Category = '' | 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
export type Group = 'dropoff' | 'install' | 'applied' | 'stall';

export interface Spec { template: string; language: string; placeholders: string[]; category: string }
export interface Item {
  key: string; group: Group; label: string; when: string; link: 'yes' | 'no' | 'n/a'; tokens: string[];
  spec: Spec; on: boolean; source: 'saved' | 'default'; defaultSpec: Spec | null;
}
export interface Catalog {
  connection: { enabled: boolean; projectId: string; sender: string; tokenSaved: boolean; cardCategory: string; configured: boolean };
  switches: { dropoff: boolean; install: boolean; applied: boolean; noOffersCall: boolean; testNumbers: number };
  items: Item[];
}
export interface Summary { counts: Record<string, Record<string, number>>; stuck: number; callbackConfigured: boolean }

export type TemplateFlag = 'category_differs' | 'not_approved';
export interface TemplateRow {
  name: string; language: string; category: string; status: string; body: string; note: string; variables: number;
  /** false = a message uses this name but nobody has added it to the library yet. */
  inLibrary: boolean;
  /** true = from the template catalogue (Stage outreach), not recorded or submitted yet. */
  proposed: boolean;
  usedBy: { key: string; label: string; on: boolean; category: string }[];
  flags: TemplateFlag[];
}
export interface TemplatesPayload { items: TemplateRow[]; prefilled: boolean; prefilledFrom: string }

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'REJECTED', label: 'Rejected' },
];

/** What a typical person would see, so the admin can read a message the way a customer will. */
export const SAMPLE: Record<string, string> = {
  name: 'Priya', step: 'Basic details', link: 'https://swiftloan.ai/dl?ref=AB12CD', ref: 'SL-2041', offerCount: '3', lender: 'Prime Finance', siteUrl: 'https://www.swiftloan.ai',
};
export const TOKEN_HELP: Record<string, string> = {
  name: 'first name', step: 'the step they stopped at', link: 'app download link', ref: 'application reference', offerCount: 'number of offers', lender: 'lender name', siteUrl: 'website address',
};

export const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: '', label: 'Card default' },
  { value: 'UTILITY', label: 'Utility' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'AUTHENTICATION', label: 'Authentication' },
];

export const fillSample = (text: string) => text.replace(/\{(\w+)\}/g, (_m, k: string) => SAMPLE[k] ?? `{${k}}`);
export const cap = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);

type Tone = 'green' | 'amber' | 'blue' | 'grey' | 'red';

export function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap',
        color: `var(--${tone === 'grey' ? 'text-dim' : tone})`, background: `var(--${tone}-bg)`,
      }}
    >
      {children}
    </span>
  );
}

export function CategoryChip({ value, fallback }: { value: string | null; fallback?: string }) {
  const tone: Tone = value === 'UTILITY' ? 'green' : value === 'MARKETING' ? 'amber' : value === 'AUTHENTICATION' ? 'blue' : 'grey';
  if (value) return <Chip tone={tone}>{cap(value)}</Chip>;
  if (fallback) return <Chip tone="grey" title="This template has no category of its own, so the card's category is sent with it.">{`Card default · ${cap(fallback)}`}</Chip>;
  return <Chip tone="grey">Not recorded</Chip>;
}

export function StatusChip({ status }: { status: string | null }) {
  if (!status) return <Chip tone="grey">Not recorded</Chip>;
  const tone: Tone = status === 'APPROVED' ? 'green' : status === 'PENDING' ? 'amber' : status === 'UNKNOWN' ? 'grey' : 'red';
  return <Chip tone={tone}>{cap(status)}</Chip>;
}

/** A coloured dot, for the small status lines. */
export function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: `var(--${tone === 'grey' ? 'grey' : tone})`, display: 'inline-block' }} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</label>
      <div style={{ marginTop: 6 }}>{children}</div>
      {error ? <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 5 }}>{error}</div> : hint ? <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>{hint}</div> : null}
    </div>
  );
}
