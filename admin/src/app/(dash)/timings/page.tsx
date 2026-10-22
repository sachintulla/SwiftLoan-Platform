'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui';

/* Every delay, window and limit that can be changed without a deploy. The list, the rules (min/max) and the defaults all
 * come from the server (GET /api/admin/timings); this page only knows how to edit each kind of value. Confirmations use
 * the admin's own dialog, never the browser's. */

type Kind = 'number' | 'minuteOfDay' | 'boolean' | 'schedule' | 'phones';
type Source = 'override' | 'env' | 'default';
interface SchedRow { channel: 'sms' | 'whatsapp'; afterMinutes: number }
interface Item {
  key: string; group: string; label: string; help: string; warn?: string; env?: string;
  kind: Kind; unit: string; def: unknown; effective: unknown; source: Source;
  min?: number; max?: number; maxRows?: number; maxMinutes?: number; maxItems?: number;
  updatedAt: string | null; updatedBy: string | null;
}
type TimeUnit = 'minutes' | 'hours' | 'days';
interface UiRow { channel: 'sms' | 'whatsapp'; amount: string; unit: TimeUnit }
type Draft = string | boolean | UiRow[];

interface Tab { id: string; title: string; groups: string[]; intro: string; sections?: Array<{ title: string; keys: string[] }> }
const TABS: Tab[] = [
  {
    id: 'reminders', title: 'Install reminders', groups: ['install', 'website'],
    intro: 'When someone leaves the website part-way, how and when we bring them back to the app.',
    sections: [
      { title: 'Sending', keys: ['install.sendEnabled', 'install.allowedNumbers'] },
      { title: 'When to remind', keys: ['install.idleMinutes', 'install.schedule', 'install.minGapMinutes', 'install.maxLateHours', 'install.maxCycles'] },
      { title: 'Behind the scenes', keys: ['install.recheckMinutes', 'install.jobEveryMinutes', 'install.resumeMaxAgeDays', 'website.pingEverySeconds'] },
    ],
  },
  { id: 'hours', title: 'Calling hours', groups: ['hours'], intro: 'One window, in India time, shared by the reminders, the stuck-stage nudges and every automatic call.' },
  { id: 'calls', title: 'Lead calls', groups: ['calls'], intro: 'The automatic call that follows a website lead who agreed to be called.' },
  { id: 'auth', title: 'Login & sessions', groups: ['auth'], intro: 'Security settings. New codes and new logins use the new values; people already signed in keep their current session.' },
  { id: 'tracking', title: 'Tracking & limits', groups: ['tracking'], intro: 'How long install links, offers and referrals stay valid, and the per-person limits.' },
];

/** Changes to these get a review step before they are saved. */
const sensitive = (key: string) =>
  key.startsWith('auth.') || key.startsWith('calling.') || key === 'install.sendEnabled' || key === 'calls.maxPerHour' || key === 'pan.dailyLimit';

const FACTOR: Record<TimeUnit, number> = { minutes: 1, hours: 60, days: 1440 };
const UNIT_SHORT: Record<string, string> = { seconds: 'sec', minutes: 'min', hours: 'hours', days: 'days', count: '' };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const parseHhmm = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

function rowsToUi(rows: SchedRow[]): UiRow[] {
  return rows.map((r) => {
    const unit: TimeUnit = r.afterMinutes > 0 && r.afterMinutes % 1440 === 0 ? 'days' : r.afterMinutes > 0 && r.afterMinutes % 60 === 0 ? 'hours' : 'minutes';
    return { channel: r.channel, unit, amount: String(r.afterMinutes / FACTOR[unit]) };
  });
}
const uiToRows = (ui: UiRow[]): SchedRow[] => ui.map((r) => ({ channel: r.channel, afterMinutes: Number(r.amount) * FACTOR[r.unit] }));

function toDraft(it: Item): Draft {
  switch (it.kind) {
    case 'boolean': return Boolean(it.effective);
    case 'minuteOfDay': return hhmm(Number(it.effective));
    case 'phones': return (it.effective as string[]).join('\n');
    case 'schedule': return rowsToUi(it.effective as SchedRow[]);
    default: return String(it.effective);
  }
}
/** What would be saved for this draft (NaN means "not valid yet"). */
function toValue(it: Item, d: Draft): unknown {
  switch (it.kind) {
    case 'boolean': return Boolean(d);
    case 'minuteOfDay': return parseHhmm(String(d));
    case 'phones': return String(d).split(/[\s,;]+/).filter(Boolean);
    case 'schedule': return uiToRows(d as UiRow[]);
    default: return d === '' ? NaN : Number(d);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function localError(it: Item, v: unknown): string | null {
  if (it.kind === 'number' || it.kind === 'minuteOfDay') {
    const n = v as number;
    if (!Number.isFinite(n) || !Number.isInteger(n)) return 'Enter a whole number';
    if (it.min !== undefined && n < it.min) return `At least ${it.min}`;
    if (it.max !== undefined && n > it.max) return `At most ${it.max}`;
  }
  if (it.kind === 'schedule') {
    const rows = v as SchedRow[];
    if (rows.length < 1) return 'Add at least one message';
    let prev = -1;
    for (let i = 0; i < rows.length; i++) {
      const m = rows[i].afterMinutes;
      if (!Number.isFinite(m) || !Number.isInteger(m) || m < 0) return `Message ${i + 1}: enter a whole number`;
      if (it.maxMinutes !== undefined && m > it.maxMinutes) return `Message ${i + 1}: too long (30 days at most)`;
      if (m < prev) return `Message ${i + 1}: must not be earlier than the one above`;
      prev = m;
    }
  }
  return null;
}

function spanText(m: number): string {
  if (!Number.isFinite(m)) return '–';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mi = m % 60;
  const parts = [d && `${d} day${d > 1 ? 's' : ''}`, h && `${h} h`, mi && `${mi} min`].filter(Boolean);
  return parts.length ? parts.join(' ') : 'straight away';
}

/** A value in words, for the "default" line and the review dialog. */
function show(it: Item, v: unknown): string {
  switch (it.kind) {
    case 'boolean': return v ? 'On' : 'Off';
    case 'minuteOfDay': return Number.isFinite(v as number) ? hhmm(Number(v)) : '–';
    case 'phones': { const n = (v as string[]).length; return n ? `${n} number${n === 1 ? '' : 's'}` : 'everyone'; }
    case 'schedule': {
      const rows = v as SchedRow[];
      const sms = rows.filter((r) => r.channel === 'sms').length;
      return `${sms} SMS + ${rows.length - sms} WhatsApp over ${spanText(rows[rows.length - 1]?.afterMinutes ?? 0)}`;
    }
    default: return Number.isFinite(v as number) ? `${v} ${UNIT_SHORT[it.unit] ?? ''}`.trim() : '–';
  }
}

export default function TimingsPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/timings', swrFetcher, { revalidateOnFocus: false });
  const payload = data?.data as { items: Item[] } | undefined;

  const [tab, setTab] = useState(TABS[0].id);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'reset'; it: Item } | { kind: 'send' } | { kind: 'save' } | null>(null);
  const prevItems = useRef<Map<string, Item>>(new Map());

  // Load the saved values into the form. After a save or a reset, keep anything else still being edited.
  useEffect(() => {
    if (!payload) return;
    const before = prevItems.current; // captured now: the updater below runs later, after this ref has moved on
    setDraft((prev) => {
      const next: Record<string, Draft> = {};
      for (const it of payload.items) {
        const old = before.get(it.key);
        const cur = prev[it.key];
        const wasEditing = old !== undefined && cur !== undefined && !same(toValue(old, cur), old.effective);
        next[it.key] = wasEditing ? cur : toDraft(it);
      }
      return next;
    });
    prevItems.current = new Map(payload.items.map((i) => [i.key, i]));
  }, [payload]);

  const dirty = useMemo(() => {
    const out: Array<{ it: Item; value: unknown; bad: string | null }> = [];
    for (const it of payload?.items ?? []) {
      if (draft[it.key] === undefined) continue;
      const value = toValue(it, draft[it.key]);
      if (!same(value, it.effective)) out.push({ it, value, bad: localError(it, value) });
    }
    return out;
  }, [payload, draft]);
  const anyBad = dirty.some((d) => d.bad);
  const dirtyTabs = new Set(TABS.filter((t) => dirty.some((d) => t.groups.includes(d.it.group))).map((t) => t.id));

  const set = (key: string, v: Draft) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    setNotice(null);
  };

  async function doSave() {
    setSaving(true); setNotice(null); setErrors({});
    try {
      const changes: Record<string, unknown> = {};
      for (const d of dirty) changes[d.it.key] = d.value;
      await apiFetch('/api/admin/timings', { method: 'PUT', body: JSON.stringify({ changes }) });
      setDialog(null);
      await mutate();
      setNotice({ ok: true, text: `Saved ${dirty.length} change${dirty.length === 1 ? '' : 's'}. Servers pick them up within about a minute.` });
    } catch (e) {
      setDialog(null);
      const errs = (e instanceof ApiError ? (e.body as { errors?: Record<string, string> } | undefined)?.errors : undefined) ?? {};
      setErrors(errs);
      const firstKey = Object.keys(errs)[0];
      const firstItem = firstKey ? byKey.get(firstKey) : undefined;
      if (firstItem) setTab(TABS.find((t) => t.groups.includes(firstItem.group))?.id ?? tab);
      setNotice({ ok: false, text: Object.keys(errs).length ? 'Some values are not allowed. They are marked in red.' : (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function requestSave() {
    if (dirty.some((d) => sensitive(d.it.key))) setDialog({ kind: 'save' });
    else void doSave();
  }

  async function resetOne(it: Item) {
    try {
      await apiFetch(`/api/admin/timings/${encodeURIComponent(it.key)}`, { method: 'DELETE' });
      setDialog(null);
      await mutate();
      setNotice({ ok: true, text: `“${it.label}” is back to ${it.env ? 'the server setting or the default' : 'the default'}.` });
    } catch (e) {
      setDialog(null);
      setNotice({ ok: false, text: (e as Error).message });
    }
  }

  const byKey = useMemo(() => new Map((payload?.items ?? []).map((i) => [i.key, i])), [payload]);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  function sectionsOf(t: Tab): Array<{ title: string | null; items: Item[] }> {
    const all = (payload?.items ?? []).filter((i) => t.groups.includes(i.group));
    const listed = new Set((t.sections ?? []).flatMap((s) => s.keys));
    const out: Array<{ title: string | null; items: Item[] }> = (t.sections ?? [])
      .map((s) => ({ title: s.title as string | null, items: s.keys.map((k) => byKey.get(k)).filter((x): x is Item => !!x) }))
      .filter((s) => s.items.length);
    const rest = all.filter((i) => !listed.has(i.key));
    if (rest.length) out.push({ title: out.length ? 'More' : null, items: rest });
    return out;
  }

  function setBool(it: Item, on: boolean) {
    if (it.key === 'install.sendEnabled' && on) { setDialog({ kind: 'send' }); return; }
    set(it.key, on);
  }

  const testListFilled = String(draft['install.allowedNumbers'] ?? '').trim().length > 0;

  return (
    <div className="page" style={{ paddingBottom: dirty.length ? 96 : undefined }}>
      <div>
        <h1 className="page-title">Timings</h1>
        <p className="page-sub">
          Change how long things wait, when messages go out and how long logins last. Changes take effect within about a minute and
          never affect a message that was already sent. The in-app help bubble is on <Link href="/app-config" style={{ color: 'var(--brand)', fontWeight: 600 }}>App Config</Link>.
        </p>
      </div>

      <div style={{ maxWidth: 1000 }}>
        <div className="tm-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className="tm-tab" onClick={() => setTab(t.id)}>
              {t.title}
              {dirtyTabs.has(t.id) && <span className="tm-dot" title="Unsaved changes" />}
            </button>
          ))}
        </div>

        {notice && <div className={`tm-notice ${notice.ok ? 'tm-notice-ok' : 'tm-notice-err'}`}>{notice.text}</div>}

        {error ? (
          <div className="empty">
            Could not load the settings: {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading && !payload ? (
          <div className="skeleton" style={{ height: 320, borderRadius: 14 }} />
        ) : payload ? (
          <div className="tm-panel">
            <div className="tm-intro">{current.intro}</div>
            {sectionsOf(current).map((sec, si) => (
              <div key={si}>
                {sec.title && <div className="tm-sec">{sec.title}</div>}
                {sec.items.map((it) => {
                  const d = draft[it.key];
                  if (d === undefined) return null;
                  const changed = dirty.find((x) => x.it.key === it.key);
                  const problem = errors[it.key] ?? changed?.bad ?? null;
                  return (
                    <div className={`tm-row${it.kind === 'schedule' ? ' tm-row-wide' : ''}`} key={it.key}>
                      <div>
                        <div className="tm-label">{it.label}</div>
                        <div className="tm-help">{it.help}</div>
                        {it.warn && <div className="tm-warn"><span aria-hidden>⚠</span><span>{it.warn}</span></div>}
                      </div>
                      <div className="tm-ctl">
                        <Control it={it} d={d} bad={!!problem} onChange={(v) => set(it.key, v)} onSwitch={(v) => setBool(it, v)} />
                        {problem && <div className="tm-err">{problem}</div>}
                        <div className="tm-meta">
                          <span>Default: {show(it, it.def)}</span>
                          {changed ? (
                            <span className="tm-chip tm-chip-edit">Edited</span>
                          ) : it.source === 'override' ? (
                            <>
                              <span className="tm-chip tm-chip-set" title={it.updatedBy ? `Changed by ${it.updatedBy}` : undefined}>Customised</span>
                              <button type="button" className="tm-link" onClick={() => setDialog({ kind: 'reset', it })}>Reset</button>
                            </>
                          ) : it.source === 'env' ? (
                            <span className="tm-chip tm-chip-set" title={it.env}>Server setting</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {dirty.length > 0 && (
        <div className="tm-bar" role="status">
          <span><b>{dirty.length}</b> unsaved change{dirty.length === 1 ? '' : 's'}</span>
          {anyBad && <span style={{ color: '#fecaca' }}>Fix the red notes first</span>}
          <button type="button" className="btn tm-bar-ghost" disabled={saving} onClick={() => { setDraft(Object.fromEntries((payload?.items ?? []).map((i) => [i.key, toDraft(i)]))); setErrors({}); setNotice(null); }}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={saving || anyBad} onClick={requestSave}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}

      {dialog?.kind === 'send' && (
        <ConfirmDialog
          tone="red"
          title="Turn on real sending?"
          confirmLabel="Turn on"
          message={
            testListFilled
              ? 'Real SMS and WhatsApp reminders will go out, but only to the numbers in the test list. Nobody else is messaged.'
              : 'Real SMS and WhatsApp reminders will go out to EVERY website visitor who drops off. The test-number list is empty. If you only want to try it on a few phones, add their numbers to the list first.'
          }
          onConfirm={() => { set('install.sendEnabled', true); setDialog(null); }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'reset' && (
        <ConfirmDialog
          title="Reset to the default?"
          confirmLabel="Reset"
          message={<>“{dialog.it.label}” will go back to {dialog.it.env ? 'the server setting, or the built-in default if there is none' : 'the built-in default'}: <b>{show(dialog.it, dialog.it.source === 'override' ? dialog.it.def : dialog.it.effective)}</b>.</>}
          onConfirm={() => void resetOne(dialog.it)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'save' && (
        <ConfirmDialog
          title={`Save ${dirty.length} change${dirty.length === 1 ? '' : 's'}?`}
          confirmLabel="Save"
          busy={saving}
          message={
            <ul className="tm-list">
              {dirty.map((d) => (
                <li key={d.it.key}><b>{d.it.label}</b>: {show(d.it, d.it.effective)} → {show(d.it, d.value)}</li>
              ))}
            </ul>
          }
          onConfirm={() => void doSave()}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function Control({ it, d, bad, onChange, onSwitch }: {
  it: Item; d: Draft; bad: boolean; onChange: (v: Draft) => void; onSwitch: (v: boolean) => void;
}) {
  if (it.kind === 'boolean') {
    const on = Boolean(d);
    return (
      <span className="tm-switch-wrap">
        <button type="button" role="switch" aria-checked={on} aria-label={it.label} className="tm-switch" onClick={() => onSwitch(!on)} />
        {on ? 'On' : 'Off'}
      </span>
    );
  }
  if (it.kind === 'minuteOfDay') {
    return (
      <div className={`tm-num${bad ? ' tm-bad' : ''}`}>
        <input type="time" aria-label={it.label} value={String(d)} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (it.kind === 'phones') {
    const n = String(d).split(/[\s,;]+/).filter(Boolean).length;
    return (
      <div style={{ width: '100%' }}>
        <textarea
          className="tm-text" rows={3} aria-label={it.label} value={String(d)} placeholder={'One mobile number per line\n9876543210'}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="tm-meta" style={{ marginTop: 4 }}>{n ? `${n} number${n === 1 ? '' : 's'}: only these will be messaged` : 'Empty: everyone is messaged'}</div>
      </div>
    );
  }
  if (it.kind === 'schedule') return <ScheduleField it={it} rows={d as UiRow[]} onChange={(r) => onChange(r)} />;
  const unit = UNIT_SHORT[it.unit] ?? '';
  return (
    <div className={`tm-num${bad ? ' tm-bad' : ''}`}>
      <input type="number" step={1} min={it.min} max={it.max} aria-label={it.label} value={String(d)} onChange={(e) => onChange(e.target.value)} />
      {unit && <span>{unit}</span>}
    </div>
  );
}

/** The schedule on the page: a plain summary and one chip per message. Editing happens in a window (ScheduleModal). */
function ScheduleField({ it, rows, onChange }: { it: Item; rows: UiRow[]; onChange: (r: UiRow[]) => void }) {
  const [open, setOpen] = useState(false);
  const value = uiToRows(rows);
  const sms = value.filter((r) => r.channel === 'sms').length;
  const last = value.reduce((m, r) => (Number.isFinite(r.afterMinutes) ? Math.max(m, r.afterMinutes) : m), 0);
  return (
    <div className="tm-sch">
      <div className="tm-sch-top">
        <span className="tm-sch-sum">
          <b>{value.length} message{value.length === 1 ? '' : 's'}</b> · {sms} SMS, {value.length - sms} WhatsApp · the last one goes out {spanText(last)} after they leave
        </span>
        <span style={{ display: 'inline-flex', gap: 14, alignItems: 'center' }}>
          <button type="button" className="tm-link" onClick={() => onChange(rowsToUi(it.def as SchedRow[]))}>Use default</button>
          <button type="button" className="btn" onClick={() => setOpen(true)}>Edit schedule</button>
        </span>
      </div>
      <div className="tm-chips">
        {value.map((r, i) => (
          <span key={i} className={`tm-sc ${r.channel === 'sms' ? 'tm-sc-sms' : 'tm-sc-wa'}`}>
            <b>{r.channel === 'sms' ? 'SMS' : 'WhatsApp'}</b>
            {r.afterMinutes === 0 ? 'right away' : `+${spanText(r.afterMinutes)}`}
          </span>
        ))}
      </div>
      <div className="tm-sch-note">Time is counted from the moment the visitor is treated as having left the website (see “Counts as dropped off after”).</div>
      {open && <ScheduleModal it={it} rows={rows} onApply={(r) => { onChange(r); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The editor window: one aligned table with headings, and the time also written out in plain words. */
function ScheduleModal({ it, rows, onApply, onClose }: { it: Item; rows: UiRow[]; onApply: (r: UiRow[]) => void; onClose: () => void }) {
  const [work, setWork] = useState<UiRow[]>(() => rows.map((r) => ({ ...r })));
  const value = uiToRows(work);
  const problem = localError(it, value);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const upd = (i: number, patch: Partial<UiRow>) => setWork((w) => w.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => setWork((w) => {
    const j = i + by;
    if (j < 0 || j >= w.length) return w;
    const next = w.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  return (
    <div className="tm-modal-back" onClick={onClose}>
      <div className="tm-modal" role="dialog" aria-modal="true" aria-label="Edit the message schedule" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-head">
          <div className="tm-modal-title">Message schedule</div>
          <div className="tm-modal-sub">
            Each line is one message. The time is counted from when the visitor leaves the website. Keep the lines in time order;
            a message that falls outside calling hours waits until they open.
          </div>
        </div>
        <div className="tm-modal-body">
          <div className="tm-th">
            <span style={{ textAlign: 'center' }}>#</span><span>Channel</span><span>Sent after they leave</span><span className="tm-plain">In plain words</span><span />
          </div>
          {work.map((r, i) => {
            const m = value[i].afterMinutes;
            const bad = !Number.isFinite(m) || (i > 0 && m < value[i - 1].afterMinutes);
            return (
              <div className={`tm-tr${bad ? ' tm-tr-bad' : ''}`} key={i}>
                <span className="tm-tn">{i + 1}</span>
                <select className="tm-chan" aria-label={`Message ${i + 1} channel`} value={r.channel} onChange={(e) => upd(i, { channel: e.target.value as 'sms' | 'whatsapp' })}>
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
                <span className="tm-when">
                  <input type="number" min={0} step={1} aria-label={`Message ${i + 1} delay`} value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} />
                  <select aria-label={`Message ${i + 1} unit`} value={r.unit} onChange={(e) => upd(i, { unit: e.target.value as TimeUnit })}>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </span>
                <span className="tm-plain">
                  {!Number.isFinite(m) ? <small>Enter a number</small> : m === 0 ? 'Right away' : spanText(m)}
                </span>
                <span className="tm-acts">
                  <button type="button" className="tm-ibtn" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="tm-ibtn" title="Move down" aria-label="Move down" disabled={i === work.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="tm-ibtn" title="Remove" aria-label="Remove" disabled={work.length <= 1} onClick={() => setWork((w) => w.filter((_, k) => k !== i))}>✕</button>
                </span>
              </div>
            );
          })}
        </div>
        <div className="tm-modal-foot">
          <button
            type="button" className="tm-link" disabled={work.length >= (it.maxRows ?? 40)}
            onClick={() => setWork((w) => {
              const l = w[w.length - 1];
              return [...w, { channel: 'sms', unit: l?.unit ?? 'days', amount: String((Number(l?.amount) || 0) + 1) }];
            })}
          >
            + Add a message
          </button>
          <button type="button" className="tm-link" onClick={() => setWork(rowsToUi(it.def as SchedRow[]))}>Use default</button>
          {problem ? <span className="tm-err">{problem}</span> : <span style={{ flex: 1 }} />}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!!problem} onClick={() => onApply(work)}>Apply</button>
        </div>
      </div>
    </div>
  );
}
