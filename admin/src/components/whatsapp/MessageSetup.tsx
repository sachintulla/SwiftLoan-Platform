'use client';
// Editing one WhatsApp message (template, language, category, variables). Used inside Stage outreach, where each stage lists the messages it sends.
// The rules (what is allowed, where each message is stored) live on the server: server/src/lib/whatsappCatalog.ts.
import React, { useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { ConfirmDialog, Select } from '@/components/ui';
import {
  CATEGORY_OPTIONS, CategoryChip, Chip, Dot, Field, TOKEN_HELP, cap, fillSample,
  type Catalog, type Category, type Group, type Item, type Spec, type TemplateRow,
} from './ui';

const GROUPS: { key: Group; title: string; sub: string }[] = [
  { key: 'dropoff', title: 'Drop-off messages', sub: 'When someone stops partway through the loan journey, on the website or in the app.' },
  { key: 'install', title: 'Website install reminders', sub: 'Website visitors who left without installing the app.' },
  { key: 'applied', title: 'After applying with a lender', sub: 'Sent after someone taps Apply on a lender offer.' },
  { key: 'stall', title: 'Stuck-stage nudges', sub: 'A customer sits too long at one stage. Each is switched on or off under Notification Rules.' },
];

/* ─────────────────────────────── the variable list ─────────────────────────────── */

/** The variables of a template, {{1}}, {{2}}… in order, each a token or fixed text, with what a customer would see underneath. */
export function VariableEditor({ tokens, value, onChange, error, disabled }: { tokens: string[]; value: string[]; onChange: (v: string[]) => void; error?: string; disabled?: boolean }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      {value.length === 0 && <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>No variables. The template text is sent as it is.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {value.map((v, i) => (
          <div key={i}>
            <div className="row" style={{ gap: 6 }}>
              <span className="mono muted" style={{ width: 38, fontSize: 12, flexShrink: 0 }}>{`{{${i + 1}}}`}</span>
              <input className="input mono" style={{ flex: 1, minWidth: 0, fontSize: 12.5 }} value={v} disabled={disabled} onChange={(e) => onChange(value.map((x, k) => (k === i ? e.target.value : x)))} />
              {!disabled && (
                <>
                  <button type="button" className="btn" style={{ padding: '4px 8px' }} aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className="btn" style={{ padding: '4px 8px' }} aria-label="Move down" onClick={() => move(i, 1)} disabled={i === value.length - 1}>↓</button>
                  <button type="button" className="btn" style={{ padding: '4px 8px' }} aria-label="Remove variable" onClick={() => onChange(value.filter((_, k) => k !== i))}>✕</button>
                </>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, margin: '3px 0 0 44px', wordBreak: 'break-all' }}>Customer sees: {fillSample(v) || '—'}</div>
          </div>
        ))}
      </div>
      {!disabled && (
        <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
          <span className="muted" style={{ fontSize: 12 }}>Add:</span>
          {tokens.map((t) => (
            <button key={t} type="button" className="chip-filter" title={TOKEN_HELP[t]} onClick={() => onChange([...value, `{${t}}`])}>{`{${t}}`}</button>
          ))}
          <button type="button" className="chip-filter" onClick={() => onChange([...value, ''])}>fixed text</button>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/* ─────────────────────────────── editing one message ─────────────────────────────── */

export function MessageEditor({ item, cardCategory, canEdit, templates, onDone }: { item: Item; cardCategory: string; canEdit: boolean; templates: TemplateRow[]; onDone: () => void }) {
  const [draft, setDraft] = useState<Spec>({ ...item.spec, placeholders: [...item.spec.placeholders] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<'off' | 'reset' | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(item.spec);
  const set = (patch: Partial<Spec>) => { setDraft((d) => ({ ...d, ...patch })); setMsg(null); setErrors({}); };

  // Templates the team has added to the Templates tab, so a name is picked, not retyped. Choosing one fills its language and category.
  const library = templates.filter((t) => t.inLibrary);
  const chosen = library.find((t) => t.name === draft.template);
  const varMismatch = chosen && chosen.body.trim() && chosen.variables !== draft.placeholders.length;

  async function call(init: RequestInit, done: string) {
    setSaving(true); setMsg(null);
    try {
      await apiFetch(`/api/admin/whatsapp/catalog/${encodeURIComponent(item.key)}`, init);
      setMsg({ ok: true, text: done });
      setConfirm(null);
      onDone();
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { errors?: Record<string, string> } | undefined) : undefined;
      setErrors(body?.errors ?? {});
      setMsg({ ok: false, text: (e as Error).message });
      setConfirm(null);
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 760 }}>
      {canEdit && library.length > 0 && (
        <Field label="Pick from your templates" hint="Fills the name, language and category. Add more on the Templates tab.">
          <Select<string>
            value={chosen ? chosen.name : ''}
            onChange={(name) => {
              const t = library.find((x) => x.name === name);
              if (t) set({ template: t.name, language: t.language, category: t.category });
            }}
            placeholder="Choose a template…"
            options={library.map((t) => ({ value: t.name, label: `${t.name}${t.category ? ` · ${cap(t.category)}` : ''}${t.status && t.status !== 'APPROVED' ? ` · ${cap(t.status)}` : ''}` }))}
          />
        </Field>
      )}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="Template name" error={errors.template} hint="Exactly as approved in Vox.">
          <input className="input mono" value={draft.template} disabled={!canEdit} onChange={(e) => set({ template: e.target.value })} placeholder="e.g. dropoff_continue_app" />
        </Field>
        <Field label="Language" error={errors.language} hint="en, hi, te…">
          <input className="input" style={{ maxWidth: 140 }} value={draft.language} disabled={!canEdit} onChange={(e) => set({ language: e.target.value })} />
        </Field>
        <Field label="Category" error={errors.category} hint="As Meta approved it.">
          <Select<Category>
            value={(draft.category as Category) || ''}
            onChange={(v) => canEdit && set({ category: v })}
            options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.value === '' ? (cardCategory ? `Card default (${cap(cardCategory)})` : 'Card default') : o.label }))}
          />
        </Field>
      </div>

      <Field label="Variables, in the order of the template" hint={`This message can use: ${item.tokens.map((t) => `{${t}}`).join(', ')}.`}>
        <VariableEditor tokens={item.tokens} value={draft.placeholders} onChange={(v) => set({ placeholders: v })} error={errors.placeholders} disabled={!canEdit} />
        {varMismatch && (
          <div style={{ fontSize: 12, color: '#7a4b06', marginTop: 8 }}>
            ⚠ The text recorded for <span className="mono">{chosen!.name}</span> has {chosen!.variables} variable{chosen!.variables === 1 ? '' : 's'}, but you set {draft.placeholders.length}. WhatsApp rejects a send when the counts differ.
          </div>
        )}
      </Field>

      {canEdit ? (
        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn btn-primary" disabled={saving || !dirty} onClick={() => call({ method: 'PUT', body: JSON.stringify({ action: 'set', ...draft }) }, 'Saved')}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn" disabled={saving || !dirty} onClick={() => { setDraft({ ...item.spec, placeholders: [...item.spec.placeholders] }); setErrors({}); setMsg(null); }}>Discard</button>
          <span style={{ flex: 1 }} />
          {item.on && <button className="btn" disabled={saving} onClick={() => setConfirm('off')}>Turn off</button>}
          {item.source === 'saved' && <button className="btn" disabled={saving} onClick={() => setConfirm('reset')}>{item.defaultSpec ? 'Reset to default' : 'Remove saved setting'}</button>}
          {msg && <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</span>}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12.5 }}>Only a super admin can change messages.</div>
      )}

      {confirm === 'off' && (
        <ConfirmDialog
          title="Turn this message off?" tone="red" confirmLabel="Turn off" busy={saving}
          message={<>Nothing will be sent for <b>{item.label}</b> until you enter a template again. The people who would have received it are skipped.</>}
          onCancel={() => setConfirm(null)}
          onConfirm={() => call({ method: 'PUT', body: JSON.stringify({ action: 'off' }) }, 'Turned off')}
        />
      )}
      {confirm === 'reset' && (
        <ConfirmDialog
          title={item.defaultSpec ? 'Reset to the default?' : 'Remove the saved setting?'} confirmLabel={item.defaultSpec ? 'Reset' : 'Remove'} busy={saving}
          message={item.defaultSpec ? <>This goes back to <span className="mono">{item.defaultSpec.template}</span>.</> : <>This message has no default, so nothing will be sent for it.</>}
          onCancel={() => setConfirm(null)}
          onConfirm={() => call({ method: 'DELETE' }, 'Reset')}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────── the messages tab ─────────────────────────────── */

export function GroupState({ group, switches }: { group: Group; switches: Catalog['switches'] }) {
  if (group === 'stall') return <Link href="/notifications-rules" className="muted" style={{ fontSize: 12.5, textDecoration: 'underline' }}>Set per notification rule</Link>;
  const live = switches[group];
  return (
    <span className="row" style={{ gap: 8 }}>
      {live ? <Chip tone="green">Sending</Chip> : <Chip tone="amber" title="Nothing is sent. The job only records what it would send.">Log only · nothing is sent</Chip>}
      {live && switches.testNumbers > 0 && <Chip tone="blue" title="Only the numbers on the test list receive messages.">Test list · {switches.testNumbers}</Chip>}
    </span>
  );
}

export function MessageRow({ it, cardCategory, open, canEdit, templates, onToggle, onChanged }: { it: Item; cardCategory: string; open: boolean; canEdit: boolean; templates: TemplateRow[]; onToggle: () => void; onChanged: () => void }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '8px 20px', alignItems: 'center', padding: '14px 4px' }}
      >
        <span style={{ flex: '1 1 260px', minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>{it.label}</span>
          <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{it.when}</span>
        </span>
        <span style={{ flex: '1 1 220px', minWidth: 0 }}>
          {it.on ? (
            <>
              <span className="mono" style={{ display: 'block', fontSize: 12.5, wordBreak: 'break-all' }}>{it.spec.template}</span>
              <span className="row wrap" style={{ gap: 8, marginTop: 5 }}>
                <CategoryChip value={it.spec.category} fallback={cardCategory} />
                <span className="muted" style={{ fontSize: 11.5 }}>{it.spec.language} · {it.spec.placeholders.length} variable{it.spec.placeholders.length === 1 ? '' : 's'}</span>
              </span>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 12.5 }}>No template set</span>
          )}
        </span>
        <span className="row" style={{ gap: 10, flex: '0 0 auto', minWidth: 110, justifyContent: 'flex-end' }}>
          <span className="row" style={{ gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            <Dot tone={it.on ? 'green' : 'grey'} />
            <span style={{ color: it.on ? 'var(--text)' : 'var(--text-dim)' }}>{it.on ? 'On' : 'Off'}</span>
          </span>
          {it.source === 'saved' && <span className="muted" style={{ fontSize: 11.5 }} title="Changed in this dashboard">edited</span>}
          <span className="muted" aria-hidden style={{ fontSize: 12 }}>{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '18px 18px 20px', margin: '0 0 14px' }}>
          <MessageEditor key={`${it.key}:${JSON.stringify(it.spec)}`} item={it} cardCategory={cardCategory} canEdit={canEdit} templates={templates} onDone={onChanged} />
        </div>
      )}
    </div>
  );
}

