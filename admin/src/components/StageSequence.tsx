'use client';
// Inside one stage of Configs → Stage outreach: the messages the drop-off, reminder and "you applied" jobs send at this stage, and the timing
// settings behind them. The settings are the same ones as on the Timings page (one value, two doors); changing a shared one says who else it affects.
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError, getAdmin } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui';
import { Control } from '@/components/timings/TimingControls';
import { MessageRow } from '@/components/whatsapp/MessageSetup';
import { Chip, type Catalog, type TemplatesPayload } from '@/components/whatsapp/ui';
import { same, sensitive, show, toDraft, toValue, localError, type Draft, type Item } from '@/lib/timingsEdit';
import { sequenceFor, stagesUsing } from '@/lib/stageSequences';

interface StageRef { key: string; label: string }

export default function StageSequence({ stageKey, stages }: { stageKey: string; stages: StageRef[] }) {
  const seq = sequenceFor(stageKey);
  const label = (k: string) => stages.find((s) => s.key === k)?.label ?? k;

  const { data: cRes, mutate: mutateCat } = useSWR('/api/admin/whatsapp/catalog', swrFetcher);
  const { data: tRes, mutate: mutateTpl } = useSWR('/api/admin/whatsapp/templates', swrFetcher);
  const { data: timRes, mutate: mutateTim } = useSWR('/api/admin/timings', swrFetcher, { revalidateOnFocus: false });
  const catalog = cRes?.data as Catalog | undefined;
  const templates = (tRes?.data as TemplatesPayload | undefined)?.items ?? [];
  const items = (timRes?.data as { items?: Item[] } | undefined)?.items ?? [];
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => { setCanEdit(getAdmin()?.role === 'super_admin'); }, []);

  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'save' | { reset: Item } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Start fresh when the stage changes.
  useEffect(() => { setEdits({}); setErrors({}); setNotice(null); setOpenMsg(null); }, [stageKey]);

  const messages = seq.messages.map((k) => catalog?.items.find((i) => i.key === k)).filter((i): i is NonNullable<typeof i> => !!i);
  const stageKeys = new Set(seq.timings.flatMap((g) => g.keys));
  const dirty = useMemo(() => {
    const out: Array<{ it: Item; value: unknown; bad: string | null }> = [];
    for (const [key, d] of Object.entries(edits)) {
      const it = byKey.get(key);
      if (!it || !stageKeys.has(key)) continue;
      const value = toValue(it, d);
      if (!same(value, it.effective)) out.push({ it, value, bad: localError(it, value) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, byKey, stageKey]);

  const set = (key: string, v: Draft) => { setEdits((e) => ({ ...e, [key]: v })); setErrors((e) => { const n = { ...e }; delete n[key]; return n; }); setNotice(null); };

  async function save() {
    setSaving(true); setNotice(null); setErrors({});
    try {
      const changes: Record<string, unknown> = {};
      for (const d of dirty) changes[d.it.key] = d.value;
      await apiFetch('/api/admin/timings', { method: 'PUT', body: JSON.stringify({ changes }) });
      setEdits({}); setConfirm(null);
      await mutateTim();
      setNotice({ ok: true, text: `Saved ${dirty.length} change${dirty.length === 1 ? '' : 's'}. Servers pick them up within about a minute.` });
    } catch (e) {
      setConfirm(null);
      const errs = (e instanceof ApiError ? (e.body as { errors?: Record<string, string> } | undefined)?.errors : undefined) ?? {};
      setErrors(errs);
      setNotice({ ok: false, text: Object.keys(errs).length ? 'Some values are not allowed. They are marked in red.' : (e as Error).message });
    } finally { setSaving(false); }
  }

  async function reset(it: Item) {
    try {
      await apiFetch(`/api/admin/timings/${encodeURIComponent(it.key)}`, { method: 'DELETE' });
      setConfirm(null);
      setEdits((e) => { const n = { ...e }; delete n[it.key]; return n; });
      await mutateTim();
      setNotice({ ok: true, text: `“${it.label}” is back to its default.` });
    } catch (e) { setConfirm(null); setNotice({ ok: false, text: (e as Error).message }); }
  }

  const needsConfirm = dirty.some((d) => sensitive(d.it.key) || (d.it.kind === 'boolean' && !!d.it.warn));
  const anyBad = dirty.some((d) => d.bad);
  const nothing = messages.length === 0 && seq.timings.length === 0;

  return (
    <>
      <div className="so-section" style={{ marginTop: 26 }}>What we send at this stage</div>
      {messages.length === 0 ? (
        <div className="so-empty">
          {seq.note ?? 'No reminder or drop-off message is sent at this stage. Its follow-ups above are the only messages.'}
        </div>
      ) : (
        <>
          {seq.switches.length > 0 && (
            <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}>
              {seq.switches.map((s) => {
                const on = !!byKey.get(s.key)?.effective;
                return (
                  <Chip key={s.key} tone={on ? 'green' : 'amber'} title={on ? 'Really sending.' : 'Log only: it records what it would send, and sends nothing.'}>
                    {s.label}: {on ? 'sending' : 'log only'}
                  </Chip>
                );
              })}
              <Link href="/timings" className="muted" style={{ fontSize: 12, textDecoration: 'underline' }}>Switch on or off in Timings</Link>
            </div>
          )}
          {messages.map((it) => (
            <MessageRow
              key={it.key} it={it} cardCategory={catalog?.connection.cardCategory ?? ''} canEdit={canEdit} templates={templates}
              open={openMsg === it.key} onToggle={() => setOpenMsg(openMsg === it.key ? null : it.key)}
              onChanged={() => { mutateCat(); mutateTpl(); }}
            />
          ))}
          {seq.note && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{seq.note}</div>}
        </>
      )}

      <div className="so-section" style={{ marginTop: 26 }}>Timing for this stage</div>
      {seq.timings.length === 0 ? (
        <div className="so-empty">{seq.note ?? 'No timing settings for this stage.'}</div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {seq.timings.map((g) => (
            <div key={g.title} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div className="tm-sec" style={{ background: 'var(--surface-2)' }}>{g.title}</div>
              {g.keys.map((key) => {
                const it = byKey.get(key);
                if (!it) return null;
                const d = edits[key] ?? toDraft(it);
                const changed = dirty.find((x) => x.it.key === key);
                const problem = errors[key] ?? changed?.bad ?? null;
                const shared = stagesUsing(key, stageKey);
                return (
                  <div className="tm-row tm-row-wide" key={key}>
                    <div>
                      <div className="tm-label">{it.label}</div>
                      <div className="tm-help">{it.help}</div>
                      {it.warn && <div className="tm-warn"><span aria-hidden>⚠</span><span>{it.warn}</span></div>}
                      {shared.length > 0 && (
                        <div className="tm-help" style={{ marginTop: 6 }}>
                          Also used by {shared.map(label).join(', ')}. Changing it changes it there too.
                        </div>
                      )}
                    </div>
                    <div className="tm-ctl">
                      {canEdit ? (
                        <Control it={it} d={d} bad={!!problem} onChange={(v) => set(key, v)} onSwitch={(v) => set(key, v)} />
                      ) : (
                        <span className="muted" style={{ fontSize: 13 }}>{show(it, it.effective)}</span>
                      )}
                      {problem && <div className="tm-err">{problem}</div>}
                      <div className="tm-meta">
                        <span>Default: {show(it, it.def)}</span>
                        {changed ? <span className="tm-chip tm-chip-edit">Edited</span> : it.source === 'override' ? (
                          <>
                            <span className="tm-chip tm-chip-set" title={it.updatedBy ? `Changed by ${it.updatedBy}` : undefined}>Customised</span>
                            {canEdit && <button type="button" className="tm-link" onClick={() => setConfirm({ reset: it })}>Reset</button>}
                          </>
                        ) : it.source === 'env' ? <span className="tm-chip tm-chip-set" title={it.env}>Server setting</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="row wrap" style={{ gap: 10 }}>
            {canEdit ? (
              <>
                <button className="btn btn-primary" disabled={saving || dirty.length === 0 || anyBad} onClick={() => (needsConfirm ? setConfirm('save') : void save())}>
                  {saving ? 'Saving…' : dirty.length ? `Save ${dirty.length} change${dirty.length === 1 ? '' : 's'}` : 'Save'}
                </button>
                <button className="btn" disabled={saving || dirty.length === 0} onClick={() => { setEdits({}); setErrors({}); setNotice(null); }}>Discard</button>
              </>
            ) : <span className="muted" style={{ fontSize: 12.5 }}>Only a super admin can change timings.</span>}
            {notice && <span style={{ fontSize: 12.5, color: notice.ok ? 'var(--green)' : 'var(--red)' }}>{notice.text}</span>}
            <span style={{ flex: 1 }} />
            <Link href="/timings" className="muted" style={{ fontSize: 12.5, textDecoration: 'underline' }}>Calling hours, limits and login times are on the Timings page</Link>
          </div>
        </div>
      )}
      {nothing && null}

      {confirm === 'save' && (
        <ConfirmDialog
          title="Save these changes?" confirmLabel="Save" busy={saving}
          message={<>{dirty.map((d) => <div key={d.it.key}><b>{d.it.label}</b>: {show(d.it, d.it.effective)} → {show(d.it, d.value)}</div>)}</>}
          onCancel={() => setConfirm(null)} onConfirm={() => void save()}
        />
      )}
      {confirm && typeof confirm === 'object' && (
        <ConfirmDialog
          title="Reset to the default?" confirmLabel="Reset" busy={false}
          message={<><b>{confirm.reset.label}</b> goes back to {show(confirm.reset, confirm.reset.def)}.</>}
          onCancel={() => setConfirm(null)} onConfirm={() => void reset(confirm.reset)}
        />
      )}
    </>
  );
}
