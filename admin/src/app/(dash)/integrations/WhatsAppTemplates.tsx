'use client';
// The template library: the team's own record of the WhatsApp templates that exist in Vox / Meta, and which of our messages use each one.
// Adding a template here does NOT create it in Vox. It records it, so everything is in one place, can be picked when setting up a message,
// and the page can warn about a category that disagrees or a template that is not approved yet.
import React, { useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { ConfirmDialog, FilterChips, Modal, PagerBar, SearchBox, Select } from '@/components/ui';
import { dateTimeStr, num } from '@/lib/format';
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
        <Field label="Name" error={errors.name}>
          <input className="input mono" value={d.name} disabled={!canEdit || !isNew} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} />
        </Field>
        <Field label="Language" error={errors.language}>
          <input className="input" style={{ maxWidth: 140 }} value={d.language} disabled={!canEdit} onChange={(e) => set({ language: e.target.value })} />
        </Field>
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Field label="Category" error={errors.category}>
          <Select<Category> value={(d.category as Category) || ''} onChange={(v) => canEdit && set({ category: v })} options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.value === '' ? 'Not recorded' : o.label }))} />
        </Field>
        <Field label="Status" error={errors.status}>
          <Select<string> value={d.status} onChange={(v) => canEdit && set({ status: v })} options={STATUS_OPTIONS} />
        </Field>
      </div>
      <Field label="Text" error={errors.body} hint={d.body.trim() ? `${vars} variable${vars === 1 ? '' : 's'}` : undefined}>
        <textarea className="input" style={{ minHeight: 96, resize: 'vertical' }} value={d.body} disabled={!canEdit} onChange={(e) => set({ body: e.target.value })} />
      </Field>
      <Field label="Note" error={errors.note}>
        <input className="input" value={d.note} disabled={!canEdit} onChange={(e) => set({ note: e.target.value })} />
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
          message={<>Removes <span className="mono">{d.name}</span> from this list only. Vox is not changed.</>}
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  const openRow = rows.find((r) => r.name === openName) ?? null;
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const cur = Math.min(page, totalPages);
  const pageRows = shown.slice((cur - 1) * pageSize, cur * pageSize);

  if (loading && !data) return <div className="card card-pad muted">Loading templates…</div>;
  if (!data) return <div className="card card-pad muted">Could not load the templates.</div>;

  const done = () => { setAdding(null); setOpenName(null); onChanged(); };

  return (
    <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
      <div className="row between wrap" style={{ gap: 12, alignItems: 'center' }}>
        <h3 className="card-title" style={{ margin: 0 }}>Templates</h3>
        {canEdit && !adding && <button className="btn btn-primary" onClick={() => { setAdding({ name: '', language: 'en', category: '', status: '', body: '', note: '' }); setOpenName(null); }}>+ Add template</button>}
      </div>



      <div className="row between wrap" style={{ gap: 12 }}>
        <FilterChips<Filter>
          value={filter}
          onChange={(f) => { setFilter(f); setPage(1); }}
          options={[
            { key: 'all', label: `All ${counts.all}` },
            { key: 'inuse', label: `In use ${counts.inuse}` },
            { key: 'attention', label: `Check ${counts.attention}` },
          ]}
        />
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search templates…" />
      </div>

      {shown.length === 0 ? (
        <div className="empty">{filter === 'attention' ? 'Nothing to check.' : rows.length === 0 ? 'No templates yet.' : 'No templates match.'}</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data brand-table">
              <thead>
                <tr><th>Template</th><th>Category</th><th>Language</th><th>Status</th><th>Sent</th><th>Last sent</th><th style={{ textAlign: 'right' }}>Action</th></tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  return (
                    <React.Fragment key={r.name}>
                      <tr onClick={() => { setOpenName(r.name); setAdding(null); }}>
                        <td><span className="mono" style={{ fontWeight: 650, wordBreak: 'break-all' }}>{r.name}</span></td>
                        <td>{r.category ? <CategoryChip value={r.category} /> : <span className="muted">-</span>}</td>
                        <td>{r.language}</td>
                        <td>
                          {!r.inLibrary ? <Chip tone="amber" title="Used by a message but not in the list yet">Not added</Chip>
                            : r.flags.length ? <Chip tone="amber" title={r.flags.map((f) => FLAG_TEXT[f](r)).join(' ')}>Check</Chip>
                            : r.status ? <StatusChip status={r.status} /> : <span className="muted">-</span>}
                        </td>
                        <td>{num(r.sent)}</td>
                        <td className="muted" title={r.lastSentAt ? dateTimeStr(r.lastSentAt) : undefined}>{r.lastSentAt ? dateTimeStr(r.lastSentAt) : '-'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn row-act" aria-label={canEdit ? 'View and edit' : 'View'}
                            onClick={(e) => { e.stopPropagation(); setOpenName(r.name); setAdding(null); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                          </button>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PagerBar page={cur} pageSize={pageSize} total={shown.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </>
      )}
      {adding && (
        <Modal title="Add a template" onClose={() => setAdding(null)}>
          <TemplateEditor initial={adding} isNew canEdit={canEdit} onDone={done} onCancel={() => setAdding(null)} />
        </Modal>
      )}
      {openRow && (
        <Modal title={<span className="mono">{openRow.name}</span>} onClose={() => setOpenName(null)}>
          {openRow.usedBy.some((u) => u.on) && <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Used in: {openRow.usedBy.filter((u) => u.on).map((u) => u.label).join(', ')}</div>}
          <TemplateEditor
            key={`${openRow.name}:${openRow.inLibrary}:${openRow.category}:${openRow.status}:${openRow.body}:${openRow.note}:${openRow.language}`}
            initial={{ name: openRow.name, language: openRow.language, category: openRow.category, status: openRow.status, body: openRow.body, note: openRow.note }}
            isNew={!openRow.inLibrary}
            canEdit={canEdit}
            onDone={done}
            onCancel={() => setOpenName(null)}
          />
        </Modal>
      )}
    </div>
  );
}
