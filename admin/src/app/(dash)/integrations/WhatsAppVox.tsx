'use client';
// Admin → Configs → WhatsApp (Vox): the Vox integration only.
//   Connection  — project, sender and token (the provider card, passed in by the page).
//   Templates   — the Vox template library: what exists in Vox / Meta, its category and approval.
//   Send a test — send one real message to a number.
// What is sent and when is set up on Stage outreach; what was sent is on the Messages page.
import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { swrFetcher, apiFetch, ApiError, getAdmin } from '@/lib/api';
import { Card, ConfirmDialog, Select, TableSkeleton } from '@/components/ui';
import WhatsAppTemplates, { needsAttention } from './WhatsAppTemplates';
import {
  CATEGORY_OPTIONS, CategoryChip, Chip, Dot, Field, TOKEN_HELP, cap, fillSample,
  type Catalog, type Category, type Group, type Item, type Spec, type Summary, type TemplateRow, type TemplatesPayload,
} from '@/components/whatsapp/ui';

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

type Tab = 'connection' | 'templates' | 'test';

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

export default function WhatsAppVox({ connection, onChanged }: { connection: React.ReactNode; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('connection');
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
  const attentionCount = (tpls?.items ?? []).filter(needsAttention).length;

  // One short list of what needs a human, instead of a stack of banners.
  const notes: { tone: 'red' | 'amber' | 'blue'; node: React.ReactNode }[] = [];
  if (!ready) notes.push({ tone: 'red', node: <>WhatsApp is not connected: {!c.enabled ? 'it is switched off' : 'a project, sender or auth token is missing'}. <button style={linkBtn} onClick={() => setTab('connection')}>Open Connection</button></> });
  if (summary && total > 0 && delivered === 0) notes.push({ tone: 'red', node: <>Vox accepted {total} message{total === 1 ? '' : 's'} in the last 24 hours, but none is confirmed delivered{!summary.callbackConfigured ? ' (delivery reports cannot reach us yet)' : ''}. <Link href="/messages" style={{ textDecoration: 'underline' }}>See sent messages</Link></> });
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
          { key: 'connection', label: 'Connection' },
          { key: 'templates', label: 'Templates', badge: attentionCount || undefined },
          { key: 'test', label: 'Send a test' },
        ]}
      />

      {tab === 'templates' && <WhatsAppTemplates data={tpls} loading={tplLoading} canEdit={canEdit} onChanged={() => { mutateTpl(); mutate(); }} />}
      {tab === 'connection' && <>{connection}</>}
      {tab === 'test' && <TestTab cat={cat} canEdit={canEdit} />}
    </div>
  );
}
