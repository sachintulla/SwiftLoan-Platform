'use client';
// The template library: the team's own record of the WhatsApp templates that exist in Vox / Meta, and which of our messages use each one.
// Adding a template here does NOT create it in Vox. It records it, so everything is in one place, can be picked when setting up a message,
// and the page can warn about a category that disagrees or a template that is not approved yet.
import React, { useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Callout, ConfirmDialog, FilterChips, SearchBox, Select } from '@/components/ui';
import {
  CATEGORY_OPTIONS, CategoryChip, Chip, Field, STATUS_OPTIONS, StatusChip, cap,
  type Category, type TemplateFlag, type TemplateRow, type TemplatesPayload,
} from '@/components/whatsapp/ui';

type Filter = 'all' | 'inuse' | 'unused' | 'attention';

const FLAG_TEXT: Record<TemplateFlag, (r: TemplateRow) => string> = {
  category_differs: (r) => {
    const set = [...new Set(r.usedBy.filter((u) => u.category && u.category !== r.category).map((u) => cap(u.category)))].join(' / ');
    return `A message sends it as ${set}, but this template is ${cap(r.category)}. Meta's category is what counts: change the message's category.`;
  },
  not_approved: (r) => `In use, but ${cap(r.status).toLowerCase()}. Sends will fail until Meta approves it.`,
};

/** A proposed template is a suggestion from the catalogue, not a problem: only a template a message uses but nobody recorded needs a look. */
export function needsAttention(r: TemplateRow): boolean {
  return r.flags.length > 0 || (!r.inLibrary && !r.proposed);
}

const varsIn = (body: string) => new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;

/* ─────────────────────────────── add / edit one template ─────────────────────────────── */

interface Draft { name: string; language: string; category: string; status: string; body: string; note: string }

function TemplateEditor({ initial, isNew, canEdit, onDone, onCancel }: { initial: Draft; isNew: boolean; canEdit: boolean; onDone: () => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setErrors({}); setMsg(null); };
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const vars = varsIn(d.body);

  async function call(init: RequestInit, done: string) {
    setSaving(true); setMsg(null);
    try {
      await apiFetch(`/api/admin/whatsapp/templates/${encodeURIComponent(d.name.trim())}`, init);
      setMsg({ ok: true, text: done });
      setConfirm(false);
      onDone();
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { errors?: Record<string, string> } | undefined) : undefined;
      setErrors(body?.errors ?? {});
      setMsg({ ok: false, text: (e as Error).message });
      setConfirm(false);
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 720 }}>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Field label="Template name" error={errors.name} hint="Exactly as in Vox (lowercase, underscores).">
          <input className="input mono" value={d.name} disabled={!canEdit || !isNew} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. dropoff_continue_app" autoFocus={isNew} />
        </Field>
        <Field label="Language" error={errors.language} hint="en, hi, te…">
          <input className="input" style={{ maxWidth: 140 }} value={d.language} disabled={!canEdit} onChange={(e) => set({ language: e.target.value })} />
        </Field>
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Field label="Category" error={errors.category} hint="What Meta decided.">
          <Select<Category> value={(d.category as Category) || ''} onChange={(v) => canEdit && set({ category: v })} options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.value === '' ? 'Not recorded' : o.label }))} />
        </Field>
        <Field label="Approval status" error={errors.status} hint="In Meta's review.">
          <Select<string> value={d.status} onChange={(v) => canEdit && set({ status: v })} options={STATUS_OPTIONS} />
        </Field>
      </div>
      <Field label="Template text (optional)" error={errors.body} hint={d.body.trim() ? `${vars} variable${vars === 1 ? '' : 's'} found. Write them as {{1}}, {{2}}…` : 'Paste the text from Vox, with {{1}}, {{2}}… for the variables. It lets the page check the variable count when you pick it for a message.'}>
        <textarea className="input" style={{ minHeight: 96, resize: 'vertical' }} value={d.body} disabled={!canEdit} onChange={(e) => set({ body: e.target.value })} placeholder="Hi {{1}}, you stopped at {{2}}. Open the app to continue." />
      </Field>
      <Field label="Note (optional)" error={errors.note}>
        <input className="input" value={d.note} disabled={!canEdit} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Submitted as Utility; Meta changed it to Marketing." />
      </Field>

      {canEdit ? (
        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn btn-primary" disabled={saving || (!isNew && !dirty) || !d.name.trim()} onClick={() => call({ method: 'PUT', body: JSON.stringify(d) }, isNew ? 'Added' : 'Saved')}>
            {saving ? 'Saving…' : isNew ? 'Add template' : 'Save'}
          </button>
          <button className="btn" disabled={saving} onClick={onCancel}>{isNew ? 'Cancel' : 'Close'}</button>
          <span style={{ flex: 1 }} />
          {!isNew && <button className="btn" disabled={saving} onClick={() => setConfirm(true)}>Remove from list</button>}
          {msg && <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</span>}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12.5 }}>Only a super admin can add or change templates.</div>
      )}

      {confirm && (
        <ConfirmDialog
          title="Remove this template from the list?" tone="red" confirmLabel="Remove" busy={saving}
          message={<>This only removes <span className="mono">{d.name}</span> from this list. It does not delete it in Vox, and any message that uses it keeps working.</>}
          onCancel={() => setConfirm(false)}
          onConfirm={() => call({ method: 'DELETE' }, 'Removed')}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────── the tab ─────────────────────────────── */

export default function WhatsAppTemplates({
  data, loading, canEdit, onChanged,
}: { data: TemplatesPayload | undefined; loading: boolean; canEdit: boolean; onChanged: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<Draft | null>(null);
  const [openName, setOpenName] = useState<string | null>(null);

  const rows = data?.items ?? [];
  const counts = useMemo(() => ({
    all: rows.length,
    inuse: rows.filter((r) => r.usedBy.some((u) => u.on)).length,
    unused: rows.filter((r) => !r.usedBy.some((u) => u.on)).length,
    attention: rows.filter(needsAttention).length,
  }), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'inuse' && !r.usedBy.some((u) => u.on)) return false;
      if (filter === 'unused' && r.usedBy.some((u) => u.on)) return false;
      if (filter === 'attention' && !needsAttention(r)) return false;
      return !needle || r.name.toLowerCase().includes(needle) || r.note.toLowerCase().includes(needle);
    });
  }, [rows, filter, q]);

  if (loading && !data) return <div className="card card-pad muted">Loading templates…</div>;
  if (!data) return <div className="card card-pad muted">Could not load the templates.</div>;

  const done = () => { setAdding(null); setOpenName(null); onChanged(); };

  return (
    <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
      <div className="row between wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <h3 className="card-title" style={{ margin: 0 }}>Templates</h3>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Your record of the templates in Vox. Adding one here does not create it in Vox. Started from our notes of {data.prefilledFrom}: check each against Vox.
          </div>
        </div>
        {canEdit && !adding && <button className="btn btn-primary" onClick={() => { setAdding({ name: '', language: 'en', category: '', status: '', body: '', note: '' }); setOpenName(null); }}>+ Add template</button>}
      </div>

      {adding && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '18px 18px 20px' }}>
          <div style={{ fontWeight: 650, fontSize: 13.5, marginBottom: 14 }}>Add a template</div>
          <TemplateEditor initial={adding} isNew canEdit={canEdit} onDone={done} onCancel={() => setAdding(null)} />
        </div>
      )}

      {rows.some((r) => !r.inLibrary && !r.proposed) && (
        <Callout tone="amber">
          {rows.filter((r) => !r.inLibrary && !r.proposed).length} template{rows.filter((r) => !r.inLibrary && !r.proposed).length === 1 ? ' is' : 's are'} used by a message but not in this list yet. Open it and add its category and approval.
        </Callout>
      )}
      {rows.some((r) => r.proposed) && (
        <div className="muted" style={{ fontSize: 12.5 }}>
          {rows.filter((r) => r.proposed).length} proposed templates come from the template catalogue used by Stage outreach. Submit them in Vox, then open one here to record its category and approval.
        </div>
      )}

      <div className="row between wrap" style={{ gap: 12 }}>
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'all', label: `All ${counts.all}` },
            { key: 'inuse', label: `In use ${counts.inuse}` },
            { key: 'unused', label: `Not used ${counts.unused}` },
            { key: 'attention', label: `Needs a look ${counts.attention}` },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search templates…" />
      </div>

      {shown.length === 0 ? (
        <div className="empty">{filter === 'attention' ? 'Nothing needs a look.' : rows.length === 0 ? 'No templates yet. Add the first one.' : 'No templates match.'}</div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {shown.map((r) => {
            const used = r.usedBy.filter((u) => u.on);
            const open = openName === r.name;
            return (
              <div key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => { setOpenName(open ? null : r.name); setAdding(null); }}
                  aria-expanded={open}
                  style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '8px 20px', padding: '14px 2px', alignItems: 'flex-start' }}
                >
                  <span style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <span className="mono" style={{ display: 'block', fontWeight: 650, fontSize: 13, wordBreak: 'break-all' }}>{r.name}</span>
                    {(r.body || r.note) && <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{r.body || r.note}</span>}
                    {r.flags.map((f) => (
                      <span key={f} style={{ display: 'block', fontSize: 12, marginTop: 6, color: f === 'category_differs' ? '#7a4b06' : '#8f271d' }}>⚠ {FLAG_TEXT[f](r)}</span>
                    ))}
                  </span>
                  <span style={{ flex: '0 0 auto', display: 'grid', gap: 6, justifyItems: 'start', minWidth: 120 }}>
                    {r.proposed ? <Chip tone="blue" title="From the template catalogue. Not submitted or recorded yet.">Proposed</Chip> : !r.inLibrary ? <Chip tone="amber" title="A message uses this template, but it is not in the list yet.">Not added yet</Chip> : r.category || r.status ? (
                      <><CategoryChip value={r.category || null} /><StatusChip status={r.status || null} /></>
                    ) : <Chip tone="grey" title="Category and approval not recorded yet.">Not recorded</Chip>}
                    <span className="muted" style={{ fontSize: 11.5 }}>{r.language}{r.body ? ` · ${r.variables} variable${r.variables === 1 ? '' : 's'}` : ''}</span>
                  </span>
                  <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                    {used.length === 0 ? (
                      <span className="muted" style={{ fontSize: 12.5 }}>Not used by any message</span>
                    ) : (
                      <span style={{ display: 'grid', gap: 4 }}>
                        {used.map((u) => (
                          <span key={u.key} style={{ fontSize: 12.5, lineHeight: 1.45, display: 'flex', gap: 7 }}>
                            <span aria-hidden style={{ color: 'var(--blue)' }}>•</span>
                            <span>{u.label}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="muted" aria-hidden style={{ fontSize: 12, flex: '0 0 auto' }}>{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '18px 18px 20px', margin: '0 0 14px' }}>
                    <TemplateEditor
                      key={`${r.name}:${r.inLibrary}:${r.category}:${r.status}:${r.body}:${r.note}:${r.language}`}
                      initial={{ name: r.name, language: r.language, category: r.category, status: r.status, body: r.body, note: r.note }}
                      isNew={!r.inLibrary}
                      canEdit={canEdit}
                      onDone={done}
                      onCancel={() => setOpenName(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
