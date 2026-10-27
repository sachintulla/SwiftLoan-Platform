'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui';
import { Control } from '@/components/timings/TimingControls';
import {
  localError, same, show, sensitive, spanText, toDraft, toValue,
  type Draft, type Item, type Kind, type SchedRow, type Source, type UiRow, type TimeUnit,
} from '@/lib/timingsEdit';

/* Every delay, window and limit that can be changed without a deploy. The list, the rules (min/max) and the defaults all
 * come from the server (GET /api/admin/timings); this page only knows how to edit each kind of value. Confirmations use
 * the admin's own dialog, never the browser's. */

interface Tab { id: string; title: string; groups: string[]; intro: string; sections?: Array<{ title: string; keys: string[] }> }
const TABS: Tab[] = [
  {
    id: 'reminders', title: 'Install reminders', groups: ['install', 'website'],
    intro: 'When someone leaves the website part-way, or has applied to a lender, how and when we bring them to the app.',
    sections: [
      { title: 'Sending', keys: ['install.sendEnabled', 'install.allowedNumbers'] },
      { title: 'When to remind', keys: ['install.idleMinutes', 'install.schedule', 'install.minGapMinutes', 'install.maxLateHours', 'install.maxCycles'] },
      { title: 'Asked for an OTP but never entered it', keys: ['install.unverifiedEnabled', 'install.unverifiedSchedule'] },
      { title: 'After they apply to a lender', keys: ['applied.sendEnabled', 'applied.schedule', 'applied.minGapMinutes', 'applied.maxLateHours', 'applied.maxAgeHours'] },
      { title: 'Behind the scenes', keys: ['install.recheckMinutes', 'install.jobEveryMinutes', 'install.resumeMaxAgeDays', 'website.pingEverySeconds'] },
    ],
  },
  { id: 'hours', title: 'Calling hours', groups: ['hours'], intro: 'One window, in India time, shared by the reminders, the stuck-stage nudges and every automatic call.' },
  { id: 'calls', title: 'Lead calls', groups: ['calls'], intro: 'The automatic call that follows a website lead who agreed to be called.' },
  { id: 'auth', title: 'Login & sessions', groups: ['auth'], intro: 'Security settings. New codes and new logins use the new values; people already signed in keep their current session.' },
  { id: 'tracking', title: 'Tracking & limits', groups: ['tracking'], intro: 'How long install links, offers and referrals stay valid, and the per-person limits.' },
];

export default function TimingsPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/timings', swrFetcher, { revalidateOnFocus: false });
  const payload = data?.data as { items: Item[] } | undefined;

  const [tab, setTab] = useState(TABS[0].id);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'reset'; it: Item } | { kind: 'send'; key: string } | { kind: 'save' } | null>(null);
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
    if ((it.key === 'install.sendEnabled' || it.key === 'applied.sendEnabled') && on) { setDialog({ kind: 'send', key: it.key }); return; }
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
              ? 'Real SMS and WhatsApp messages will go out, but only to the numbers in the test list. Nobody else is messaged.'
              : dialog.key === 'applied.sendEnabled'
                ? 'Real SMS and WhatsApp messages will go out to EVERYONE who applies to a lender and has not installed the app (one sequence per lender). The test-number list is empty. If you only want to try it on a few phones, add their numbers to the list first.'
                : 'Real SMS and WhatsApp reminders will go out to EVERY website visitor who drops off. The test-number list is empty. If you only want to try it on a few phones, add their numbers to the list first.'
          }
          onConfirm={() => { set(dialog.key, true); setDialog(null); }}
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

