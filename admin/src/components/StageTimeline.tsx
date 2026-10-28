'use client';
// One timeline per journey stage on Configs → Stage outreach. It lists, in time order, everything that goes out after a customer stops
// at the stage: the stuck-stage follow-ups the page already had (push, SMS, WhatsApp, call, email) AND the steps of the message jobs
// that run at that stage (website reminders, drop-off messages, "you applied", the no-offers call). Click any step to edit it in place:
// a rule keeps its own editor; a job step opens its message, its schedule and its rules. The rules around those jobs (gap between
// messages, skip if too late, how old is too old) sit under the timeline. Sending switches, calling hours and limits stay on the Timings page.
//
// Nothing here changes how messages are sent: the jobs still run separately. The screen only brings their timing to one place and warns when
// a rule and a job would reach someone close together.
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError, getAdmin } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui';
import { Control } from '@/components/timings/TimingControls';
import { MessageRow } from '@/components/whatsapp/MessageSetup';
import { Chip, type Catalog, type TemplatesPayload } from '@/components/whatsapp/ui';
import { CHANNEL_LABEL, Icon, duration, type Channel } from '@/components/stageOutreachUi';
import { same, sensitive, show, toDraft, toValue, localError, rowsToUi, uiToRows, spanText, type Draft, type Item, type SchedRow, type UiRow } from '@/lib/timingsEdit';
import {
  byTime, findOverlaps, jobSteps, ownScheduleKey, sequenceForFlow, stagesUsing,
  type JobStep, type SequenceSource, type TimelineEntry,
} from '@/lib/stageSequences';

interface StageRef { key: string; label: string }

/** A stuck-stage rule, already drawn by the page (its own editor); the timeline only orders it. */
export interface RuleEntry {
  key: string;
  afterMinutes: number;
  enabled: boolean;
  channel: Channel;
  label: string;
  node: React.ReactNode;
}

/** This stage's own copy of a shared schedule, or the shared one (read-only here). The other message rules stay shared. */
function StageSchedule({ shared, own, draft, customised, edited, problem, canEdit, others, onDraft, onUseOwn, onUseShared }: {
  shared: Item; own: Item; draft: Draft; customised: boolean; edited: boolean; problem: string | null; canEdit: boolean; others: string[];
  onDraft: (v: Draft) => void; onUseOwn: () => void; onUseShared: () => void;
}) {
  const rows = shared.effective as SchedRow[];
  return (
    <div className="tm-row tm-row-wide" style={{ padding: '14px 0' }}>
      <div>
        <div className="tm-label">{shared.label}</div>
        <div className="tm-help" style={{ marginTop: 6 }}>
          {customised
            ? 'This stage has its own schedule. The other stages are not affected.'
            : `This stage uses the shared schedule${others.length ? `, which ${others.join(', ')} also use${others.length === 1 ? 's' : ''}. Changing it on the Timings page would change all of them` : ''}.`}
        </div>
      </div>
      <div className="tm-ctl">
        {customised ? (
          <>
            <Control it={own} d={draft} bad={!!problem} onChange={onDraft} onSwitch={() => undefined} />
            {problem && <div className="tm-err">{problem}</div>}
            <div className="tm-meta">
              {edited ? <span className="tm-chip tm-chip-edit">Edited</span> : <span className="tm-chip tm-chip-set">This stage only</span>}
              {canEdit && <button type="button" className="tm-link" onClick={onUseShared}>Use the shared schedule</button>}
            </div>
          </>
        ) : (
          <>
            <div className="tm-chips">
              {rows.map((r, i) => (
                <span key={i} className={`tm-sc ${r.channel === 'sms' ? 'tm-sc-sms' : 'tm-sc-wa'}`}>
                  <b>{r.channel === 'sms' ? 'SMS' : 'WhatsApp'}</b>
                  {r.afterMinutes === 0 ? 'right away' : `+${spanText(r.afterMinutes)}`}
                </span>
              ))}
            </div>
            <div className="tm-meta">
              <span className="tm-chip tm-chip-set">Shared</span>
              {canEdit && <button type="button" className="btn" onClick={onUseOwn}>Use a different schedule for this stage</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function StageTimeline({ stageKey, flow, stages, rules }: { stageKey: string; flow: 'app' | 'website'; stages: StageRef[]; rules: RuleEntry[] }) {
  const seq = sequenceForFlow(stageKey, flow);
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

  const [openStep, setOpenStep] = useState<string | null>(null);
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'save' | { reset: Item } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Start fresh when the stage changes.
  useEffect(() => { setEdits({}); setErrors({}); setNotice(null); setOpenStep(null); setOpenMsg(null); }, [stageKey]);

  // Everything on this stage that can be edited here: schedules, their own-stage copies, rules, the call delay.
  const editable = useMemo(() => {
    const keys = new Set<string>();
    for (const s of seq.sources) { keys.add(s.scheduleKey); const o = ownScheduleKey(s, stageKey); if (o) keys.add(o); }
    if (seq.call) keys.add(seq.call.delayKey);
    for (const g of seq.rules) for (const k of g.keys) keys.add(k);
    return keys;
  }, [seq, stageKey]);

  const dirty = useMemo(() => {
    const out: Array<{ it: Item; value: unknown; bad: string | null }> = [];
    for (const [key, d] of Object.entries(edits)) {
      const it = byKey.get(key);
      if (!it || !editable.has(key)) continue;
      const value = toValue(it, d);
      if (!same(value, it.effective)) out.push({ it, value, bad: localError(it, value) });
    }
    return out;
  }, [edits, byKey, editable]);

  const set = (key: string, v: Draft) => { setEdits((e) => ({ ...e, [key]: v })); setErrors((e) => { const n = { ...e }; delete n[key]; return n; }); setNotice(null); };

  /* ── the steps the message jobs add ── */
  const rowsOf = (key: string): SchedRow[] => (edits[key] !== undefined ? uiToRows(edits[key] as UiRow[]) : ((byKey.get(key)?.effective as SchedRow[] | undefined) ?? []));
  const rowsFor = (s: SequenceSource): SchedRow[] => {
    const ownKey = ownScheduleKey(s, stageKey);
    const own = ownKey ? byKey.get(ownKey) : undefined;
    if (ownKey && own && (own.source === 'override' || edits[ownKey] !== undefined)) return rowsOf(ownKey);
    return rowsOf(s.scheduleKey);
  };
  const isOn = (key: string) => !!byKey.get(key)?.effective;
  const minutesOf = (key: string): number | null => {
    const it = byKey.get(key);
    if (!it) return null;
    const d = edits[key];
    const v = d !== undefined ? Number(d) : Number(it.effective);
    return Number.isFinite(v) ? v : null;
  };
  const jobs: JobStep[] = jobSteps(stageKey, rowsFor, isOn, minutesOf, flow);

  const ruleEntries: Array<TimelineEntry & { node: React.ReactNode }> = rules.map((r) => ({
    key: `rule:${r.key}`, group: 'rule' as const, channel: r.channel, afterMinutes: r.afterMinutes, live: r.enabled, label: r.label, node: r.node,
  }));
  const jobEntries = jobs.map((j) => ({ ...j }));
  const timeline = byTime<TimelineEntry & { node?: React.ReactNode }>([...ruleEntries, ...jobEntries]);
  const overlaps = findOverlaps(timeline);

  /* ── saving ── */
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
      setNotice({ ok: true, text: it.group === 'stage' ? 'This stage uses the shared schedule again.' : `“${it.label}” is back to its default.` });
    } catch (e) { setConfirm(null); setNotice({ ok: false, text: (e as Error).message }); }
  }

  const needsConfirm = dirty.some((d) => sensitive(d.it.key) || (d.it.kind === 'boolean' && !!d.it.warn));
  const anyBad = dirty.some((d) => d.bad);
  const hasRules = seq.rules.some((g) => g.keys.some((k) => byKey.has(k)));
  const nothing = timeline.length === 0;

  /* ── pieces ── */
  const switchChips = (keys: string[]) => (
    <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
      {keys.map((k) => {
        const it = byKey.get(k);
        const on = !!it?.effective;
        return <Chip key={k} tone={on ? 'green' : 'amber'} title={it?.label}>{it?.label ?? k}: {on ? 'on' : 'off'}</Chip>;
      })}
      <Link href="/timings" className="muted" style={{ fontSize: 12, textDecoration: 'underline' }}>Change in Timings</Link>
    </div>
  );

  // Plain render functions (not components): a component defined inside this one would be re-created every render and lose input focus.
  const renderJobEditor = (step: JobStep): React.ReactNode => {
    if (step.kind === 'call') {
      const call = seq.call!;
      const it = byKey.get(call.delayKey);
      if (!it) return null;
      const d = edits[call.delayKey] ?? toDraft(it);
      return (
        <div style={{ padding: '4px 14px 14px' }}>
          {switchChips(call.switches)}
          <div className="tm-row tm-row-wide" style={{ padding: '10px 0' }}>
            <div><div className="tm-label">{it.label}</div><div className="tm-help">{it.help}</div></div>
            <div className="tm-ctl">
              {canEdit ? <Control it={it} d={d} bad={!!(errors[call.delayKey])} onChange={(v) => set(call.delayKey, v)} onSwitch={() => undefined} /> : <span className="muted">{show(it, it.effective)}</span>}
              {errors[call.delayKey] && <div className="tm-err">{errors[call.delayKey]}</div>}
            </div>
          </div>
        </div>
      );
    }
    const source = seq.sources.find((s) => s.id === step.sourceId)!;
    const shared = byKey.get(source.scheduleKey);
    const ownKey = ownScheduleKey(source, stageKey);
    const own = ownKey ? byKey.get(ownKey) : undefined;
    const msgs = source.messages.map((k) => catalog?.items.find((i) => i.key === k)).filter((i): i is NonNullable<typeof i> => !!i);
    return (
      <div style={{ padding: '4px 14px 14px' }}>
        {switchChips(source.switches)}
        {msgs.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {msgs.map((it) => (
              <MessageRow
                key={it.key} it={it} cardCategory={catalog?.connection.cardCategory ?? ''} canEdit={canEdit} templates={templates}
                open={openMsg === it.key} onToggle={() => setOpenMsg(openMsg === it.key ? null : it.key)} onChanged={() => { mutateCat(); mutateTpl(); }}
              />
            ))}
          </div>
        )}
        {shared && ownKey && own ? (
          <StageSchedule
            shared={shared} own={own} draft={edits[ownKey] ?? toDraft(own)} customised={own.source === 'override' || edits[ownKey] !== undefined}
            edited={!!dirty.find((x) => x.it.key === ownKey)} problem={errors[ownKey] ?? dirty.find((x) => x.it.key === ownKey)?.bad ?? null} canEdit={canEdit}
            others={stagesUsing(source.scheduleKey, stageKey).map(label)}
            onDraft={(v) => set(ownKey, v)} onUseOwn={() => set(ownKey, rowsToUi(shared.effective as SchedRow[]))}
            onUseShared={() => (own.source === 'override' ? setConfirm({ reset: own }) : setEdits((e) => { const n = { ...e }; delete n[ownKey]; return n; }))}
          />
        ) : shared ? (
          <div className="tm-row tm-row-wide" style={{ padding: '10px 0' }}>
            <div><div className="tm-label">{shared.label}</div><div className="tm-help">{shared.help}</div></div>
            <div className="tm-ctl">
              {canEdit ? <Control it={shared} d={edits[source.scheduleKey] ?? toDraft(shared)} bad={!!errors[source.scheduleKey]} onChange={(v) => set(source.scheduleKey, v)} onSwitch={() => undefined} /> : <span className="muted">{show(shared, shared.effective)}</span>}
              {errors[source.scheduleKey] && <div className="tm-err">{errors[source.scheduleKey]}</div>}
              <div className="tm-meta">
                <span>Default: {show(shared, shared.def)}</span>
                {dirty.find((x) => x.it.key === source.scheduleKey) ? <span className="tm-chip tm-chip-edit">Edited</span> : shared.source === 'override' ? (
                  <>
                    <span className="tm-chip tm-chip-set">Customised</span>
                    {canEdit && <button type="button" className="tm-link" onClick={() => setConfirm({ reset: shared })}>Reset</button>}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const renderJobCard = (step: JobStep, index: number, total: number): React.ReactNode => {
    const open = openStep === step.key;
    const channel = step.channel as Channel;
    const source = seq.sources.find((s) => s.id === step.sourceId);
    const short: Record<string, string> = { install: 'Reminder', unverified: 'OTP reminder', dropoff: 'Drop-off', applied: 'Applied' };
    const sub = step.kind === 'call' ? 'Phone call' : `${short[step.sourceId] ?? 'Reminder'}${total > 1 ? ` ${index + 1} of ${total}` : ''}`;
    return (
      <div className="so-step">
        <div className="so-when">+ {duration(step.afterMinutes)}</div>
        <div className={`so-node ${step.live ? '' : 'off'}`} style={{ color: `var(--so-${channel})` }}><Icon channel={channel} /></div>
        <div className={`so-card ${open ? 'open' : ''} ${step.live ? '' : 'dim'}`}>
          <div
            className="so-card-head" role="button" tabIndex={0} onClick={() => setOpenStep(open ? null : step.key)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenStep(open ? null : step.key); } }}
          >
            <div className="so-card-main">
              <div className="so-card-name">{CHANNEL_LABEL[channel]}</div>
              <div className="so-card-sum">{sub}</div>
            </div>
            {step.live ? <Chip tone="green">Sending</Chip> : <Chip tone="grey" title="Switched off in Timings, so nothing is sent.">Not sending</Chip>}
            <svg className="so-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </div>
          {open && renderJobEditor(step)}
        </div>
      </div>
    );
  }

  const perSource = (id: string) => jobs.filter((j) => j.sourceId === id);

  return (
    <>
      {nothing ? (
        <div className="so-empty">Nothing here yet.</div>
      ) : (
        <div className="so-tl">
          <div className="so-step">
            <div className="so-when">0 min</div>
            <div className="so-node origin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="3" /></svg></div>
            <div className="so-origin-text">Customer stops here</div>
          </div>
          {timeline.map((e) => {
            if (e.group === 'rule') return <React.Fragment key={e.key}>{e.node}</React.Fragment>;
            const j = e as unknown as JobStep;
            const siblings = perSource(j.sourceId);
            return <React.Fragment key={e.key}>{renderJobCard(j, siblings.findIndex((x) => x.key === j.key), siblings.length)}</React.Fragment>;
          })}
        </div>
      )}

      {overlaps.length > 0 && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'var(--amber-bg)', color: '#7a4b06', fontSize: 12.5 }}>
          ⚠ Close together: {overlaps.map(([r, j]) => `${CHANNEL_LABEL[r.channel as Channel]} +${duration(r.afterMinutes)} and ${CHANNEL_LABEL[j.channel as Channel]} +${duration(j.afterMinutes)}`).join('; ')}
        </div>
      )}

      {hasRules && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 650 }}>Message limits</summary>
          <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
            {seq.rules.map((g) => (
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
                        {shared.length > 0 && <div className="tm-help" style={{ marginTop: 6 }}>Also used by {shared.map(label).join(', ')}. Changing it changes it there too.</div>}
                      </div>
                      <div className="tm-ctl">
                        {canEdit ? <Control it={it} d={d} bad={!!problem} onChange={(v) => set(key, v)} onSwitch={(v) => set(key, v)} /> : <span className="muted" style={{ fontSize: 13 }}>{show(it, it.effective)}</span>}
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
          </div>
        </details>
      )}

      {(dirty.length > 0 || notice) && (
        <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
          {canEdit && dirty.length > 0 && (
            <>
              <button className="btn btn-primary" disabled={saving || anyBad} onClick={() => (needsConfirm ? setConfirm('save') : void save())}>
                {saving ? 'Saving…' : `Save ${dirty.length} change${dirty.length === 1 ? '' : 's'}`}
              </button>
              <button className="btn" disabled={saving} onClick={() => { setEdits({}); setErrors({}); setNotice(null); }}>Discard</button>
            </>
          )}
          {notice && <span style={{ fontSize: 12.5, color: notice.ok ? 'var(--green)' : 'var(--red)' }}>{notice.text}</span>}
        </div>
      )}
      {!canEdit && (seq.sources.length > 0 || hasRules || seq.call) && <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>View only</div>}

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
