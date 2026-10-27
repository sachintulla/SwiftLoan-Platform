'use client';
// Admin → Configs → WhatsApp (Vox): everything about our WhatsApp messages in one place.
//   Messages    — each message we send, its template, variables and category, and whether it is really going out; edit in place.
//   Templates   — every template (what Meta decided, which messages use it).
//   Connection  — project, sender and token (the provider card, passed in by the page).
//   Send a test — send one real message to a number.
// The rules (what is allowed, where each message is stored) live on the server: server/src/lib/whatsappCatalog.ts.
import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { swrFetcher, apiFetch, ApiError, getAdmin } from '@/lib/api';
import { Card, ConfirmDialog, Select, TableSkeleton } from '@/components/ui';
import WhatsAppTemplates, { needsAttention } from './WhatsAppTemplates';
import WhatsAppSent from './WhatsAppSent';
import {
  CATEGORY_OPTIONS, CategoryChip, Chip, Dot, Field, TOKEN_HELP, cap, fillSample,
  type Catalog, type Category, type Group, type Item, type Spec, type Summary, type TemplateRow, type TemplatesPayload,
} from './whatsappUi';

const GROUPS: { key: Group; title: string; sub: string }[] = [
  { key: 'dropoff', title: 'Drop-off messages', sub: 'When someone stops partway through the loan journey, on the website or in the app.' },
  { key: 'install', title: 'Website install reminders', sub: 'Website visitors who left without installing the app.' },
  { key: 'applied', title: 'After applying with a lender', sub: 'Sent after someone taps Apply on a lender offer.' },
  { key: 'stall', title: 'Stuck-stage nudges', sub: 'A customer sits too long at one stage. Each is switched on or off under Notification Rules.' },
];

/* ─────────────────────────────── the variable list ─────────────────────────────── */

/** The variables of a template, {{1}}, {{2}}… in order, each a token or fixed text, with what a customer would see underneath. */
function VariableEditor({ tokens, value, onChange, error, disabled }: { tokens: string[]; value: string[]; onChange: (v: string[]) => void; error?: string; disabled?: boolean }) {
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

function MessageEditor({ item, cardCategory, canEdit, templates, onDone }: { item: Item; cardCategory: string; canEdit: boolean; templates: TemplateRow[]; onDone: () => void }) {
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

function GroupState({ group, switches }: { group: Group; switches: Catalog['switches'] }) {
  if (group === 'stall') return <Link href="/notifications-rules" className="muted" style={{ fontSize: 12.5, textDecoration: 'underline' }}>Set per notification rule</Link>;
  const live = switches[group];
  return (
    <span className="row" style={{ gap: 8 }}>
      {live ? <Chip tone="green">Sending</Chip> : <Chip tone="amber" title="Nothing is sent. The job only records what it would send.">Log only · nothing is sent</Chip>}
      {live && switches.testNumbers > 0 && <Chip tone="blue" title="Only the numbers on the test list receive messages.">Test list · {switches.testNumbers}</Chip>}
    </span>
  );
}

function MessageRow({ it, cardCategory, open, canEdit, templates, onToggle, onChanged }: { it: Item; cardCategory: string; open: boolean; canEdit: boolean; templates: TemplateRow[]; onToggle: () => void; onChanged: () => void }) {
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

function MessagesTab({ cat, canEdit, templates, onChanged, onOpenStageOutreach }: { cat: Catalog; canEdit: boolean; templates: TemplateRow[]; onChanged: () => void; onOpenStageOutreach?: () => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Stuck-stage nudges are set up on Stage outreach (one page per stage, with the timing and the channel); editing them here too would be a second editor for the same settings.
  const byGroup = useMemo(() => GROUPS.filter((g) => g.key !== 'stall').map((g) => ({ ...g, items: cat.items.filter((i) => i.group === g.key) })).filter((g) => g.items.length), [cat.items]);
  const stall = cat.items.filter((i) => i.group === 'stall');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {byGroup.map((g) => (
        <Card key={g.key}>
          <div className="row between wrap" style={{ gap: 10, marginBottom: 8 }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <h3 className="card-title" style={{ margin: 0 }}>{g.title}</h3>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{g.sub}</div>
            </div>
            <GroupState group={g.key} switches={cat.switches} />
          </div>
          {g.items.map((it) => (
            <MessageRow
              key={it.key} it={it} cardCategory={cat.connection.cardCategory} canEdit={canEdit} templates={templates}
              open={openKey === it.key} onToggle={() => setOpenKey(openKey === it.key ? null : it.key)} onChanged={onChanged}
            />
          ))}
        </Card>
      ))}
      {stall.length > 0 && (
        <Card>
          <div className="row between wrap" style={{ gap: 12 }}>
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <h3 className="card-title" style={{ margin: 0 }}>Stuck-stage nudges</h3>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                {stall.filter((i) => i.on).length} of {stall.length} stages have a WhatsApp template. They are set up on <b>Stage outreach</b>: pick the stage, then the channel, the timing and the template.
              </div>
            </div>
            {onOpenStageOutreach && <button className="btn btn-primary" onClick={onOpenStageOutreach}>Open Stage outreach</button>}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────── send a test ─────────────────────────────── */

function TestTab({ cat, canEdit }: { cat: Catalog; canEdit: boolean }) {
  const options = useMemo(() => cat.items.filter((i) => i.on), [cat.items]);
  const [pick, setPick] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [tpl, setTpl] = useState<Spec>({ template: '', language: 'en', placeholders: [], category: '' });
  const [values, setValues] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function choose(key: string) {
    setPick(key);
    setResult(null);
    const it = cat.items.find((i) => i.key === key);
    if (!it) { setTpl({ template: '', language: 'en', placeholders: [], category: '' }); setValues([]); return; }
    setTpl(it.spec);
    setValues(it.spec.placeholders.map(fillSample)); // sample values, editable
  }

  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const phoneOk = /^[6-9]\d{9}$/.test(digits);
  const ready = phoneOk && !!tpl.template.trim() && cat.connection.configured;

  async function send() {
    setBusy(true); setResult(null);
    try {
      const res = await apiFetch<{ messageId?: string }>('/api/admin/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: digits, templateName: tpl.template.trim(), language: tpl.language || 'en', placeholders: values, ...(tpl.category ? { category: tpl.category } : {}) }),
      });
      setResult({ ok: true, text: `Accepted by Vox${res.data?.messageId ? ` (id ${res.data.messageId})` : ''}. Accepted is not delivered: check the phone, then the Messages page.` });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); setConfirm(false); }
  }

  return (
    <Card title="Send a test message" sub="Sends one real WhatsApp message with sample values, to check that a template reaches a phone.">
      {!canEdit && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Only a super admin can send test messages.</div>}
      {!cat.connection.configured && <div style={{ fontSize: 12.5, color: 'var(--amber)', marginBottom: 12 }}>WhatsApp is not fully connected yet. Finish the Connection tab first.</div>}
      <div style={{ display: 'grid', gap: 18, maxWidth: 620 }}>
        <Field label="Message to test" hint="One of your messages, or type a template name yourself.">
          <Select<string>
            value={pick}
            onChange={choose}
            placeholder="Choose a message…"
            options={[{ value: '', label: 'Another template (type below)' }, ...options.map((o) => ({ value: o.key, label: o.label }))]}
          />
        </Field>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Field label="Template name"><input className="input mono" value={tpl.template} onChange={(e) => { setTpl({ ...tpl, template: e.target.value }); setResult(null); }} /></Field>
          <Field label="Language"><input className="input" style={{ maxWidth: 140 }} value={tpl.language} onChange={(e) => setTpl({ ...tpl, language: e.target.value })} /></Field>
        </div>
        <Field label="Category sent">
          <Select<Category> value={(tpl.category as Category) || ''} onChange={(v) => setTpl({ ...tpl, category: v })} options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
        </Field>
        <Field label="Values for the variables" hint={values.length ? 'Sample values are filled in. Change any of them.' : undefined}>
          {values.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>This template has no variables.</div> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {values.map((v, i) => (
                <div key={i} className="row" style={{ gap: 8 }}>
                  <span className="mono muted" style={{ width: 38, fontSize: 12 }}>{`{{${i + 1}}}`}</span>
                  <input className="input" value={v} onChange={(e) => setValues(values.map((x, k) => (k === i ? e.target.value : x)))} />
                </div>
              ))}
            </div>
          )}
        </Field>
        <Field label="Send to" error={phone && !phoneOk ? 'Enter a 10-digit Indian mobile number.' : undefined}>
          <div className="row" style={{ gap: 8 }}>
            <span className="muted">+91</span>
            <input className="input" style={{ maxWidth: 200 }} inputMode="numeric" value={phone} onChange={(e) => { setPhone(e.target.value); setResult(null); }} placeholder="10-digit number" />
          </div>
        </Field>
        <div className="row wrap" style={{ gap: 12 }}>
          <button className="btn btn-primary" disabled={!ready || !canEdit || busy} onClick={() => setConfirm(true)}>Send test</button>
          {result && <span style={{ fontSize: 12.5, color: result.ok ? 'var(--green)' : 'var(--red)' }}>{result.text}</span>}
          {result?.ok && <Link href="/messages" style={{ fontSize: 12.5, textDecoration: 'underline' }}>See its delivery status</Link>}
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          title="Send a real WhatsApp message?" confirmLabel="Send" busy={busy}
          message={<>This sends <span className="mono">{tpl.template}</span> to <b>+91 {digits}</b> now.</>}
          onCancel={() => setConfirm(false)}
          onConfirm={send}
        />
      )}
    </Card>
  );
}

/* ─────────────────────────────── the page ─────────────────────────────── */

type Tab = 'sent' | 'messages' | 'templates' | 'connection' | 'test';

function Tabs({ value, onChange, tabs }: { value: Tab; onChange: (t: Tab) => void; tabs: { key: Tab; label: string; badge?: number }[] }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 22, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key} role="tab" aria-selected={active} onClick={() => onChange(t.key)}
            style={{
              all: 'unset', cursor: 'pointer', padding: '10px 2px', fontSize: 13.5, fontWeight: active ? 650 : 500,
              color: active ? 'var(--brand-ink)' : 'var(--text-dim)', borderBottom: `2px solid ${active ? 'var(--brand)' : 'transparent'}`, marginBottom: -1,
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}
          >
            {t.label}
            {t.badge ? <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--amber-bg)', color: '#7a4b06', borderRadius: 999, padding: '1px 7px' }}>{t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const linkBtn: React.CSSProperties = { all: 'unset', cursor: 'pointer', textDecoration: 'underline', color: 'var(--brand-ink)', fontWeight: 600 };

export default function WhatsAppVox({ connection, onChanged, onOpenStageOutreach }: { connection: React.ReactNode; onChanged: () => void; onOpenStageOutreach?: () => void }) {
  const [tab, setTab] = useState<Tab>('sent');
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => { setCanEdit(getAdmin()?.role === 'super_admin'); }, []);

  const { data, error, isLoading, mutate } = useSWR('/api/admin/whatsapp/catalog', swrFetcher);
  const { data: sumRes } = useSWR('/api/admin/messages/summary', swrFetcher, { refreshInterval: 15000 });
  const { data: tplRes, isLoading: tplLoading, mutate: mutateTpl } = useSWR('/api/admin/whatsapp/templates', swrFetcher);

  const cat = data?.data as Catalog | undefined;
  const summary = sumRes?.data as Summary | undefined;
  const tpls = tplRes?.data as TemplatesPayload | undefined;
  const wa = (summary?.counts?.whatsapp ?? {}) as Record<string, number>;

  if (error) {
    return <Card title="💬  WhatsApp (Voxvalley)"><div className="empty">Could not load — {(error as Error).message}<br /><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div></Card>;
  }
  if (isLoading || !cat) return <Card><TableSkeleton rows={6} cols={4} /></Card>;

  const c = cat.connection;
  const ready = c.enabled && c.configured;
  const total = Object.values(wa).reduce((a, b) => a + b, 0);
  const delivered = (wa.delivered ?? 0) + (wa.read ?? 0);
  const notSending = [!cat.switches.dropoff && 'drop-off messages', !cat.switches.install && 'install reminders', !cat.switches.applied && '"you applied" messages'].filter(Boolean) as string[];
  const attentionCount = (tpls?.items ?? []).filter(needsAttention).length;

  // One short list of what needs a human, instead of a stack of banners.
  const notes: { tone: 'red' | 'amber' | 'blue'; node: React.ReactNode }[] = [];
  if (!ready) notes.push({ tone: 'red', node: <>WhatsApp is not connected: {!c.enabled ? 'it is switched off' : 'a project, sender or auth token is missing'}. <button style={linkBtn} onClick={() => setTab('connection')}>Open Connection</button></> });
  if (ready && notSending.length) notes.push({ tone: 'blue', node: <>Log only, nothing is sent yet: {notSending.join(', ')}. Switch them on under <Link href="/timings" style={{ textDecoration: 'underline' }}>Timings</Link>.</> });
  if (summary && total > 0 && delivered === 0) notes.push({ tone: 'red', node: <>Vox accepted {total} message{total === 1 ? '' : 's'} in the last 24 hours, but none is confirmed delivered{!summary.callbackConfigured ? ' (delivery reports cannot reach us yet)' : ''}. <button style={linkBtn} onClick={() => setTab('sent')}>See sent messages</button></> });
  if (attentionCount > 0) notes.push({ tone: 'amber', node: <>{attentionCount} template{attentionCount === 1 ? ' needs' : 's need'} a look (not in the list yet, category or approval). <button style={linkBtn} onClick={() => setTab('templates')}>See templates</button></> });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 12, minWidth: 0 }}>
            <h2 className="card-title" style={{ margin: 0, fontSize: 17 }}>💬  WhatsApp (Voxvalley)</h2>
            {ready ? <Chip tone="green">Connected</Chip> : <Chip tone="amber">{c.enabled ? 'Incomplete' : 'Off'}</Chip>}
          </div>
          <div className="muted mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{c.projectId || 'no project'} · sender {c.sender || '—'}</div>
        </div>
        {notes.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {notes.map((n, i) => (
              <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ marginTop: 6 }}><Dot tone={n.tone} /></span>
                <span>{n.node}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { key: 'sent', label: 'Sent messages' },
          { key: 'messages', label: `Message setup (${cat.items.filter((i) => i.on).length} on)` },
          { key: 'templates', label: 'Templates', badge: attentionCount || undefined },
          { key: 'connection', label: 'Connection' },
          { key: 'test', label: 'Send a test' },
        ]}
      />

      {tab === 'sent' && <WhatsAppSent />}
      {tab === 'messages' && <MessagesTab cat={cat} canEdit={canEdit} templates={tpls?.items ?? []} onChanged={() => { mutate(); mutateTpl(); onChanged(); }} onOpenStageOutreach={onOpenStageOutreach} />}
      {tab === 'templates' && <WhatsAppTemplates data={tpls} loading={tplLoading} canEdit={canEdit} onChanged={() => { mutateTpl(); mutate(); }} />}
      {tab === 'connection' && <>{connection}</>}
      {tab === 'test' && <TestTab cat={cat} canEdit={canEdit} />}
    </div>
  );
}
