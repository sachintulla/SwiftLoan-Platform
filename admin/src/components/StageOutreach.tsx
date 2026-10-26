'use client';
// One page to configure what the customer receives at every journey stage, on
// every channel (WhatsApp, SMS, email, Ello call, push).
//
// Layout: a journey rail on the left (pick the stage where customers stop) and,
// on the right, that stage as a timeline: what goes out, in order, at what delay.
// Click a step to edit it; only one editor is open at a time.
//
// Timing and on/off live on the stall rules (the same rows as Notification
// Rules). WhatsApp templates and SMS overrides live in the Voxvalley settings and
// the call's agent/brief in the Ello settings, where the senders already read
// them, so this page never creates a second copy.
import React, { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { TableSkeleton } from '@/components/ui';

type Channel = 'whatsapp' | 'sms' | 'email' | 'voice' | 'push';

interface Activity {
  ruleId: string;
  name: string;
  channel: Channel;
  delayMinutes: number;
  cooldownMinutes: number;
  enabled: boolean;
  upshotEvent: string;
  firedCount: number;
  whatsapp?: { template: string; language: string; placeholders: string[]; customised: boolean };
  sms?: { templateId: string; body: string; customised: boolean };
  call?: { agentRole: string | null; assistantId: string; brief: string; effectiveAgentId: string | null };
}
interface Stage {
  key: string; label: string; description: string; surface: string;
  activities: Activity[]; missingChannels: Channel[];
}
interface Variable { name: string; group: string; description: string; example: string }
interface AgentRole { role: string; label: string; direction: string }
interface Overview {
  stages: Stage[];
  variables: Variable[];
  whatsappTokens: string[];
  agentRoles: AgentRole[];
  maxBriefLength: number;
  afterConversation: { enabled: boolean; template: string; language: string; placeholders: string[]; tokens: string[] };
  gates: { callsAutomatic: boolean; testNumbersOnly: number; nudgesDisabled: boolean; elloConnected: boolean; whatsappConnected: boolean; upshotConnected: boolean; smsConnected: boolean };
}

const KEY = '/api/admin/stage-outreach';
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email', 'voice', 'push'];
const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', voice: 'Call (Ello)', push: 'Push notification' };
const DEFAULT_DELAY: Record<Channel, number> = { whatsapp: 30, sms: 30, email: 30, voice: 60, push: 20 };

const ICON_PATHS: Record<Channel, string[]> = {
  whatsapp: ['M21 11.5a8.4 8.4 0 0 1-1.1 4.2A8.5 8.5 0 0 1 8.4 19.5L3 21l1.6-5.1A8.5 8.5 0 1 1 21 11.5z'],
  sms: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  email: ['M3 5h18v14H3z', 'M3 7l9 6 9-6'],
  voice: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'],
  push: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
};

function Icon({ channel }: { channel: Channel }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICON_PATHS[channel].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

const tone = (c: Channel) => ({ color: `var(--so-${c === 'voice' ? 'voice' : c})`, background: `var(--so-${c}-bg)` });

function duration(mins: number): string {
  if (!mins || mins < 1) return 'now';
  if (mins < 60) return `${mins} min`;
  if (mins % 1440 === 0) { const d = mins / 1440; return `${d} day${d === 1 ? '' : 's'}`; }
  if (mins % 60 === 0) { const h = mins / 60; return `${h} hr`; }
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function errText(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : 'Could not save';
}

export default function StageOutreach() {
  const { data, error, isLoading, mutate } = useSWR(KEY, swrFetcher);
  const ov = data?.data as Overview | undefined;
  const [selected, setSelected] = useState<string | null>(null);
  const [openRule, setOpenRule] = useState<string | null>(null);

  const totals = useMemo(() => {
    const all = (ov?.stages ?? []).flatMap((s) => s.activities);
    return { on: all.filter((a) => a.enabled).length, total: all.length, empty: (ov?.stages ?? []).filter((s) => !s.activities.some((a) => a.enabled)).length };
  }, [ov]);

  if (error) return <div className="card card-pad"><div className="empty">Could not load stage outreach: {(error as Error).message}</div></div>;
  if (isLoading || !ov) return <div className="card card-pad"><TableSkeleton rows={6} cols={2} /></div>;

  const current = ov.stages.find((s) => s.key === selected) ?? ov.stages.find((s) => s.activities.some((a) => a.enabled)) ?? ov.stages[0];
  const number = ov.stages.findIndex((s) => s.key === current.key) + 1;

  return (
    <div className="so">
      <div className="so-head">
        <div>
          <h2 className="so-title">Stage outreach</h2>
          <p className="so-sub">Choose the stage where customers stop. Then set what they receive, on which channel, and how long after they stop. Website visitors and app users share these stages.</p>
        </div>
        <div className="so-stats">
          <div className="so-stat"><b>{totals.on}</b><span>follow-ups on</span></div>
          <div className="so-stat"><b>{totals.total - totals.on}</b><span>switched off</span></div>
          <div className="so-stat"><b>{totals.empty}</b><span>stages with nothing on</span></div>
        </div>
      </div>

      <Notes gates={ov.gates} />

      <details className="so-guide">
        <summary>How to set it up</summary>
        <ol>
          <li><b>Pick the stage</b> from the journey on the left.</li>
          <li><b>Add a follow-up</b> on a channel the stage does not have yet: WhatsApp, SMS, Email, Call or Push.</li>
          <li><b>Click the step</b> to set when it goes out and what it says. Calls also take the variables the Ello agent receives.</li>
          <li><b>Switch it on.</b> New follow-ups start switched off, so nothing reaches a customer until you turn them on. Calls also need the Timings switch.</li>
        </ol>
      </details>

      <AfterConversation cfg={ov.afterConversation} whatsappConnected={ov.gates.whatsappConnected} onChanged={() => mutate()} />

      <div className="so-grid">
        <Rail stages={ov.stages} currentKey={current.key} onPick={(k) => { setSelected(k); setOpenRule(null); }} />
        <StagePanel
          key={current.key} number={number} stage={current} ov={ov}
          openRule={openRule} setOpenRule={setOpenRule} onChanged={() => mutate()}
        />
      </div>

      <VariableDictionary variables={ov.variables} />
    </div>
  );
}

/**
 * The WhatsApp recap sent after every conversation (call, in-app agent, website
 * agent): what was discussed and the action plan. Not tied to one stage, so it
 * sits above the journey.
 */
function AfterConversation({ cfg, whatsappConnected, onChanged }: { cfg: Overview['afterConversation']; whatsappConnected: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [template, setTemplate] = useState(cfg.template);
  const [language, setLanguage] = useState(cfg.language);
  const [vars, setVars] = useState<string[]>(cfg.placeholders);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const list = vars.map((v) => v.trim()).filter(Boolean);
  const dirty = enabled !== cfg.enabled || template.trim() !== cfg.template || language.trim() !== cfg.language || list.join('\n') !== cfg.placeholders.join('\n');
  const needsTemplate = enabled && !template.trim();
  const touch = () => setMsg(null);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await apiFetch(`${KEY}/after-conversation`, { method: 'PUT', body: JSON.stringify({ enabled, template: template.trim(), language: language.trim() || 'en', placeholders: list }) });
      setMsg({ ok: true, text: 'Saved' });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally { setSaving(false); }
  }

  return (
    <section className="so-panel" style={{ marginBottom: 18 }}>
      <div className="so-card-head" style={{ padding: '14px 20px' }} onClick={() => setOpen(!open)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}>
        <span className="so-node" style={{ color: 'var(--so-whatsapp)', width: 34, height: 34 }}><Icon channel="whatsapp" /></span>
        <div className="so-card-main">
          <div className="so-card-name" style={{ fontSize: 15 }}>
            After every conversation
            <span className="so-chip" style={cfg.enabled ? { background: 'var(--green-bg)', color: '#0b7a47' } : undefined}>{cfg.enabled ? `On · ${cfg.template}` : 'Off'}</span>
          </div>
          <div className="so-card-sum">WhatsApp the customer a recap of what was discussed and their action plan, after a call, or after talking to the in-app or website agent.</div>
        </div>
        <svg className="so-chev" style={{ transform: open ? 'rotate(90deg)' : undefined }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
      </div>

      {open && (
        <div className="so-editor" style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
          {!whatsappConnected && <div className="so-note">No WhatsApp provider is turned on (Vox or Meta), so this cannot send yet.</div>}
          <div className="so-fields">
            <div className="so-field wide">
              <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
                <button type="button" className={`so-switch ${enabled ? 'on' : ''}`} aria-pressed={enabled} onClick={() => { setEnabled(!enabled); touch(); }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{enabled ? 'On: send a recap after each conversation' : 'Off'}</span>
              </label>
              {needsTemplate && <span className="so-msg err">Enter the approved template name before switching this on.</span>}
            </div>
            <div className="so-field">
              <label className="so-label">Approved WhatsApp template name</label>
              <input className="input mono" value={template} placeholder="e.g. conversation_summary" onChange={(e) => { setTemplate(e.target.value); touch(); }} />
              <span className="so-hint">Create the template with variables in CPaaS (Vox Digitals) or Meta and get it approved, then enter its exact name here.</span>
            </div>
            <div className="so-field">
              <label className="so-label">Language code</label>
              <input className="input mono" style={{ maxWidth: 120 }} value={language} onChange={(e) => { setLanguage(e.target.value); touch(); }} />
            </div>
            <div className="so-field wide">
              <span className="so-label">Values sent into the template, in order</span>
              <div className="so-vars">
                {vars.map((v, i) => (
                  <div key={i} className="so-var">
                    <span className="so-var-no">{`{{${i + 1}}}`}</span>
                    <input className="input mono" value={v} onChange={(e) => { setVars(vars.map((x, j) => (j === i ? e.target.value : x))); touch(); }} />
                    <button type="button" className="so-x" aria-label={`Remove value ${i + 1}`} onClick={() => { setVars(vars.filter((_, j) => j !== i)); touch(); }}>×</button>
                  </div>
                ))}
              </div>
              <div className="so-tokens">
                <span className="so-hint">Add:</span>
                {cfg.tokens.map((t) => <button key={t} type="button" className="so-token" onClick={() => { setVars([...vars, t]); touch(); }}>{t}</button>)}
                <button type="button" className="so-token" onClick={() => { setVars([...vars, '']); touch(); }}>+ custom text</button>
              </div>
              <span className="so-hint">The count and order must match the approved template exactly. <b>{'{summary}'}</b> is what we discussed, <b>{'{actionPlan}'}</b> is what happens next, <b>{'{callbackTime}'}</b> is the agreed callback.</span>
            </div>
            <div className="so-field wide">
              <div className="so-preview">
                <div className="so-preview-label">What the agent must send</div>
                Only the agent&apos;s <span className="mono">customer_summary</span> is sent, in the customer&apos;s own terms; add <span className="mono">action_plan</span> for the next steps. The internal <span className="mono">summary</span> written for colleagues is never sent. If the agent sends no customer summary, nothing goes out. Nothing is sent after a refusal, wrong number, voicemail or no answer, and in test mode only the allowed test numbers receive it. Each conversation sends once.
              </div>
            </div>
          </div>
          <div className="so-actions">
            <button type="button" className="btn btn-primary" disabled={!dirty || saving || needsTemplate} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
            {dirty && !msg && <span className="so-hint">You have unsaved changes.</span>}
            {msg && <span className={`so-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function Notes({ gates: g }: { gates: Overview['gates'] }) {
  const notes: Array<{ tone: '' | 'blue' | 'red'; text: string }> = [];
  if (!g.whatsappConnected) notes.push({ tone: '', text: 'No WhatsApp provider is turned on (Vox or Meta), so WhatsApp steps will not send.' });
  if (!g.smsConnected) notes.push({ tone: '', text: 'The Vox SMS gateway is off, so SMS steps will not send.' });
  if (!g.upshotConnected) notes.push({ tone: '', text: 'Upshot is off, so email and push steps will not reach anyone (they go through Upshot).' });
  if (!g.elloConnected) notes.push({ tone: '', text: 'Ello voice is not connected, so calls cannot be placed.' });
  if (!g.callsAutomatic) notes.push({ tone: 'blue', text: 'Automatic drop-off calls are switched off (Timings, calls.nudgeEnabled). No call rings a customer until that is on.' });
  if (g.callsAutomatic && g.testNumbersOnly > 0) notes.push({ tone: 'blue', text: `Test mode: calls only go to the ${g.testNumbersOnly} allowed test number${g.testNumbersOnly === 1 ? '' : 's'}.` });
  if (g.nudgesDisabled) notes.push({ tone: 'red', text: 'NUDGES_DISABLED is set on this server, so stage follow-ups are paused here.' });
  if (!notes.length) return null;
  const urgent = notes.some((n) => n.tone === 'red');
  return (
    <details className="so-guide so-notes-box" style={urgent ? { borderColor: '#f3b6b0' } : undefined}>
      <summary>{notes.length} thing{notes.length === 1 ? '' : 's'} to know before anything is sent{urgent ? ' (action needed)' : ''}</summary>
      <div className="so-notes" style={{ marginTop: 10, marginBottom: 0 }}>
        {notes.map((n) => <div key={n.text} className={`so-note ${n.tone}`}><span aria-hidden>{n.tone === 'blue' ? 'ℹ' : '⚠'}</span><span>{n.text}</span></div>)}
      </div>
    </details>
  );
}

function Rail({ stages, currentKey, onPick }: { stages: Stage[]; currentKey: string; onPick: (key: string) => void }) {
  return (
    <nav className="so-rail" aria-label="Journey stages">
      <div className="so-rail-title">Customer journey</div>
      {stages.map((s, i) => (
        <button key={s.key} type="button" className={`so-stage ${s.key === currentKey ? 'active' : ''}`} onClick={() => onPick(s.key)}>
          <span className="so-stage-no">{i + 1}</span>
          <span className="so-stage-body">
            <span className="so-stage-name" style={{ display: 'block' }}>{s.label}</span>
            <span className="so-stage-meta">
              <span className="so-surface">{s.surface}</span>
              <span className="so-dots">
                {CHANNELS.map((c) => {
                  const a = s.activities.find((x) => x.channel === c);
                  return <i key={c} className={`so-dot ${a ? 'set' : ''} ${a?.enabled ? 'on' : ''}`} style={{ color: `var(--so-${c})` }} title={`${CHANNEL_LABEL[c]}: ${a ? (a.enabled ? 'on' : 'off') : 'not set up'}`} />;
                })}
              </span>
            </span>
          </span>
        </button>
      ))}
      <div className="so-rail-legend">
        <span><i style={{ background: 'var(--text-dim)' }} />on</span>
        <span><i style={{ border: '1.5px solid var(--text-dim)' }} />off</span>
        <span><i style={{ border: '1.5px solid var(--border)' }} />not set up</span>
      </div>
    </nav>
  );
}

function StagePanel({ number, stage, ov, openRule, setOpenRule, onChanged }: {
  number: number; stage: Stage; ov: Overview; openRule: string | null; setOpenRule: (id: string | null) => void; onChanged: () => void;
}) {
  const steps = [...stage.activities].sort((a, b) => a.delayMinutes - b.delayMinutes);
  const on = steps.filter((a) => a.enabled).length;
  return (
    <section className="so-panel">
      <div className="so-panel-head">
        <div className="so-panel-top">
          <h3 className="so-panel-title">{number}. {stage.label}</h3>
          <span className="so-chip">{stage.surface}</span>
          <span className="so-chip" style={on ? { background: 'var(--green-bg)', color: '#0b7a47' } : undefined}>{on} of {steps.length} on</span>
        </div>
        <p className="so-panel-desc">{stage.description}</p>
      </div>

      <div className="so-panel-body">
        <div className="so-section">What the customer gets after they stop here</div>

        {steps.length === 0 ? (
          <div className="so-empty">Nothing is set up for this stage yet. Add a follow-up below.</div>
        ) : (
          <div className="so-tl">
            <div className="so-step">
              <div className="so-when">0 min</div>
              <div className="so-node origin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="3" /></svg></div>
              <div className="so-origin-text">The customer stops here</div>
            </div>
            {steps.map((a) => (
              <Step key={a.ruleId} stageKey={stage.key} a={a} ov={ov} open={openRule === a.ruleId}
                onToggleOpen={() => setOpenRule(openRule === a.ruleId ? null : a.ruleId)} onChanged={onChanged} />
            ))}
          </div>
        )}

        <AddRow stage={stage} onAdded={(id) => { onChanged(); setOpenRule(id); }} />
      </div>
    </section>
  );
}

function summaryFor(a: Activity, ov: Overview): { text: string; warn?: string } {
  if (a.channel === 'whatsapp') {
    const w = a.whatsapp;
    if (!w?.template) return { text: 'No template set. Falls back to the Upshot event.', warn: a.enabled ? 'Needs a template' : undefined };
    return { text: `Template ${w.template} · ${w.placeholders.length} variable${w.placeholders.length === 1 ? '' : 's'}` };
  }
  if (a.channel === 'sms') {
    const s = a.sms;
    if (!s?.templateId) return { text: 'No SMS text set.', warn: a.enabled ? 'Needs text' : undefined };
    return { text: `${s.customised ? 'Custom text for this stage' : 'Default registered text'} · template ${s.templateId}` };
  }
  if (a.channel === 'voice') {
    const role = ov.agentRoles.find((r) => r.role === a.call?.agentRole)?.label ?? 'Website lead callback';
    return { text: `${a.call?.assistantId ? `Agent ${a.call.assistantId}` : role} · ${a.call?.brief ? 'talking points set' : 'default talking points'}` };
  }
  return { text: `Fires Upshot event ${a.upshotEvent}` };
}

function Step({ stageKey, a, ov, open, onToggleOpen, onChanged }: {
  stageKey: string; a: Activity; ov: Overview; open: boolean; onToggleOpen: () => void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sum = summaryFor(a, ov);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !a.enabled;
    if (next && a.channel === 'voice' && !window.confirm('Turn on calls at this stage? Customers who stop here will get a phone call from the Ello agent, once automatic calls are enabled in Timings.')) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/api/admin/stall-rules/${a.ruleId}`, { method: 'PATCH', body: JSON.stringify({ enabled: next }) });
      onChanged();
    } catch (er) {
      setErr(errText(er));
    } finally { setBusy(false); }
  }

  return (
    <div className="so-step">
      <div className="so-when">+ {duration(a.delayMinutes)}</div>
      <div className={`so-node ${a.enabled ? '' : 'off'}`} style={{ color: `var(--so-${a.channel})` }}><Icon channel={a.channel} /></div>
      <div className={`so-card ${open ? 'open' : ''} ${a.enabled ? '' : 'dim'}`}>
        <div className="so-card-head" onClick={onToggleOpen} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleOpen(); } }}>
          <div className="so-card-main">
            <div className="so-card-name">
              {CHANNEL_LABEL[a.channel]}
              {sum.warn && <span className="so-warn">{sum.warn}</span>}
              {err && <span className="so-msg err">{err}</span>}
            </div>
            <div className="so-card-sum">{sum.text}{a.firedCount ? ` · ${a.firedCount} sent` : ''}</div>
          </div>
          <button type="button" className={`so-switch ${a.enabled ? 'on' : ''}`} disabled={busy} onClick={toggle}
            aria-label={`${CHANNEL_LABEL[a.channel]} ${a.enabled ? 'on' : 'off'}`} aria-pressed={a.enabled} title={a.enabled ? 'On. Click to turn off' : 'Off. Click to turn on'} />
          <svg className="so-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
        </div>
        {open && <Editor stageKey={stageKey} a={a} ov={ov} onChanged={onChanged} />}
      </div>
    </div>
  );
}

function Editor({ stageKey, a, ov, onChanged }: { stageKey: string; a: Activity; ov: Overview; onChanged: () => void }) {
  const [delay, setDelay] = useState(String(a.delayMinutes));
  const [upshotEvent, setUpshotEvent] = useState(a.upshotEvent);
  const [waTemplate, setWaTemplate] = useState(a.whatsapp?.template ?? '');
  const [waLanguage, setWaLanguage] = useState(a.whatsapp?.language ?? 'en');
  const [waVars, setWaVars] = useState<string[]>(a.whatsapp?.placeholders ?? []);
  const [smsId, setSmsId] = useState(a.sms?.templateId ?? '');
  const [smsBody, setSmsBody] = useState(a.sms?.body ?? '');
  const [role, setRole] = useState(a.call?.agentRole ?? '');
  const [assistantId, setAssistantId] = useState(a.call?.assistantId ?? '');
  const [brief, setBrief] = useState(a.call?.brief ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);

  const touch = () => setMsg(null);
  const delayNum = Number(delay);
  const delayValid = delay.trim() !== '' && Number.isInteger(delayNum) && delayNum >= 1 && delayNum <= 20160;
  const isUpshot = a.channel === 'email' || a.channel === 'push';
  const waList = waVars.map((v) => v.trim()).filter(Boolean);

  const ruleDirty = delayNum !== a.delayMinutes || (isUpshot && upshotEvent.trim() !== a.upshotEvent);
  const waDirty = a.channel === 'whatsapp' && (waTemplate.trim() !== (a.whatsapp?.template ?? '') || waLanguage.trim() !== (a.whatsapp?.language ?? 'en') || waList.join('\n') !== (a.whatsapp?.placeholders ?? []).join('\n'));
  const smsDirty = a.channel === 'sms' && (smsId.trim() !== (a.sms?.templateId ?? '') || smsBody.trim() !== (a.sms?.body ?? '').trim());
  const callDirty = a.channel === 'voice' && (role !== (a.call?.agentRole ?? '') || assistantId.trim() !== (a.call?.assistantId ?? '') || brief.trim() !== (a.call?.brief ?? ''));
  const dirty = ruleDirty || waDirty || smsDirty || callDirty;
  const canSave = dirty && delayValid && (!isUpshot || upshotEvent.trim().length > 0);

  function insertBrief(token: string) {
    const el = briefRef.current;
    if (!el) { setBrief((b) => `${b}${token}`); return; }
    const s = el.selectionStart ?? brief.length;
    const e = el.selectionEnd ?? brief.length;
    setBrief(brief.slice(0, s) + token + brief.slice(e));
    touch();
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  }

  const sample = useMemo(() => Object.fromEntries(ov.variables.map((v) => [v.name, v.example])), [ov.variables]);
  const preview = brief.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_m, n: string) => sample[n] ?? '').replace(/[ \t]{2,}/g, ' ').trim();
  const groups = useMemo(() => Array.from(new Set(ov.variables.map((v) => v.group))), [ov.variables]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      if (ruleDirty) {
        await apiFetch(`/api/admin/stall-rules/${a.ruleId}`, { method: 'PATCH', body: JSON.stringify({ delayMinutes: delayNum, ...(isUpshot ? { upshotEvent: upshotEvent.trim() } : {}) }) });
      }
      if (waDirty) await apiFetch(`${KEY}/${stageKey}/whatsapp`, { method: 'PUT', body: JSON.stringify({ template: waTemplate.trim(), language: waLanguage.trim() || 'en', placeholders: waList }) });
      if (smsDirty) await apiFetch(`${KEY}/${stageKey}/sms`, { method: 'PUT', body: JSON.stringify({ templateId: smsId.trim(), body: smsBody }) });
      if (callDirty) await apiFetch(`${KEY}/${stageKey}/call`, { method: 'PUT', body: JSON.stringify({ agentRole: role || null, assistantId: assistantId.trim(), brief }) });
      setMsg({ ok: true, text: 'Saved' });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!window.confirm(`Remove the ${CHANNEL_LABEL[a.channel]} follow-up from this stage? It stops going out. Customers already contacted are not affected.`)) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/stall-rules/${a.ruleId}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      setSaving(false);
    }
  }

  return (
    <div className="so-editor">
      <div className="so-fields">
        <div className="so-field">
          <label className="so-label" htmlFor={`d-${a.ruleId}`}>Goes out after the customer stops</label>
          <div className="so-input-unit">
            <input id={`d-${a.ruleId}`} className="input mono" inputMode="numeric" value={delay}
              onChange={(e) => { setDelay(e.target.value.replace(/[^0-9]/g, '')); touch(); }} />
            <span className="muted">minutes</span>
          </div>
          <span className="so-hint">{delayValid ? `That is ${duration(delayNum)}.` : 'Enter 1 minute or more.'}</span>
        </div>

        {a.channel === 'whatsapp' && (
          <>
            <div className="so-field">
              <label className="so-label">Approved template name</label>
              <input className="input mono" value={waTemplate} placeholder="e.g. offers_ready" onChange={(e) => { setWaTemplate(e.target.value); touch(); }} />
              <span className="so-hint">Exactly as approved by Meta: lowercase letters, numbers, underscores.</span>
            </div>
            <div className="so-field">
              <label className="so-label">Language code</label>
              <input className="input mono" style={{ maxWidth: 120 }} value={waLanguage} onChange={(e) => { setWaLanguage(e.target.value); touch(); }} />
            </div>
            <div className="so-field wide">
              <span className="so-label">Values sent into the template, in order</span>
              <div className="so-vars">
                {waVars.length === 0 && <span className="so-hint">This template takes no variables.</span>}
                {waVars.map((v, i) => (
                  <div key={i} className="so-var">
                    <span className="so-var-no">{`{{${i + 1}}}`}</span>
                    <input className="input mono" value={v} onChange={(e) => { setWaVars(waVars.map((x, j) => (j === i ? e.target.value : x))); touch(); }} />
                    <button type="button" className="so-x" aria-label={`Remove value ${i + 1}`} onClick={() => { setWaVars(waVars.filter((_, j) => j !== i)); touch(); }}>×</button>
                  </div>
                ))}
              </div>
              <div className="so-tokens">
                <span className="so-hint">Add:</span>
                {ov.whatsappTokens.map((t) => <button key={t} type="button" className="so-token" onClick={() => { setWaVars([...waVars, t]); touch(); }}>{t}</button>)}
                <button type="button" className="so-token" onClick={() => { setWaVars([...waVars, '']); touch(); }}>+ custom text</button>
              </div>
              <span className="so-hint">A customer missing one of these values is skipped, never sent a blank. Clear the template name to hand this step back to Upshot.</span>
            </div>
          </>
        )}

        {a.channel === 'sms' && (
          <>
            <div className="so-field">
              <label className="so-label">DLT template ID</label>
              <input className="input mono" value={smsId} onChange={(e) => { setSmsId(e.target.value); touch(); }} />
            </div>
            <div className="so-field wide">
              <label className="so-label">Exact registered text</label>
              <textarea className="input" rows={4} maxLength={1000} value={smsBody} onChange={(e) => { setSmsBody(e.target.value); touch(); }} />
              <span className="so-hint">
                India SMS must match the DLT registration character for character, so no variables are added.{' '}
                {a.sms?.customised ? 'This stage has its own text. Clear both fields to go back to the default.' : 'This is the default text used at every stage. Change it here to give this stage its own.'}
              </span>
            </div>
          </>
        )}

        {isUpshot && (
          <div className="so-field wide">
            <label className="so-label">Upshot event to fire</label>
            <input className="input mono" value={upshotEvent} onChange={(e) => { setUpshotEvent(e.target.value); touch(); }} />
            <span className="so-hint">
              {a.channel === 'email' ? 'Email' : 'Push'} is sent through Upshot: write the message there and attach it to this event. The event carries the customer&apos;s name, phone, city, source, campaign, stage and minutes stuck.
            </span>
          </div>
        )}

        {a.channel === 'voice' && a.call && (
          <>
            <div className="so-field">
              <label className="so-label">Ello agent</label>
              <select className="input" value={role} onChange={(e) => { setRole(e.target.value); touch(); }}>
                <option value="">Website lead callback (default)</option>
                {ov.agentRoles.filter((r) => r.direction === 'outbound' && r.role !== 'leadCallback').map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
              </select>
            </div>
            <div className="so-field">
              <label className="so-label">Or a specific agent ID</label>
              <input className="input mono" value={assistantId} placeholder="Optional. Overrides the choice" onChange={(e) => { setAssistantId(e.target.value); touch(); }} />
              <span className="so-hint">Calls <span className="mono">{assistantId.trim() || a.call.effectiveAgentId || 'no agent configured'}</span></span>
            </div>
            <div className="so-field wide">
              <label className="so-label">What the agent should talk about</label>
              <textarea ref={briefRef} className="input" rows={4} maxLength={ov.maxBriefLength} value={brief}
                placeholder="e.g. Greet {lead_first_name}. They {stall_reason}. Offer to {stall_help}."
                onChange={(e) => { setBrief(e.target.value); touch(); }} />
              <span className="so-hint">{brief.length}/{ov.maxBriefLength}. Sent to the agent as <span className="mono">stage_brief</span> with each {'{variable}'} replaced by the customer&apos;s real value.</span>
            </div>
            {preview && (
              <div className="so-field wide">
                <div className="so-preview"><div className="so-preview-label">Preview with a sample customer</div>{preview}</div>
              </div>
            )}
            <div className="so-field wide">
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Insert a variable ({ov.variables.length} available)</summary>
                <div className="so-vargroups">
                  {groups.map((g) => (
                    <div key={g}>
                      <div className="so-vargroup-name">{g}</div>
                      <div className="so-tokens">
                        {ov.variables.filter((v) => v.group === g).map((v) => (
                          <button key={v.name} type="button" className="so-token" title={`${v.description}. Example: ${v.example}`} onClick={() => insertBrief(`{${v.name}}`)}>{v.name}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </>
        )}
      </div>

      <div className="so-actions">
        <button type="button" className="btn btn-primary" disabled={!canSave || saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
        {dirty && !msg && <span className="so-hint">You have unsaved changes.</span>}
        {msg && <span className={`so-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
        <span className="so-spacer" />
        <button type="button" className="so-link-danger" disabled={saving} onClick={remove}>Remove this follow-up</button>
      </div>
    </div>
  );
}

function AddRow({ stage, onAdded }: { stage: Stage; onAdded: (ruleId: string) => void }) {
  const [busy, setBusy] = useState<Channel | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (stage.missingChannels.length === 0) return null;

  async function add(channel: Channel) {
    setBusy(channel); setMsg(null);
    try {
      const res = await apiFetch<{ ruleId: string }>(`${KEY}/${stage.key}/activities`, { method: 'POST', body: JSON.stringify({ channel, delayMinutes: DEFAULT_DELAY[channel] }) });
      onAdded((res.data as { ruleId: string }).ruleId);
    } catch (e) {
      setMsg(errText(e));
    } finally { setBusy(null); }
  }

  return (
    <div className="so-add">
      <div className="so-section" style={{ marginTop: 22 }}>Add a follow-up at this stage</div>
      <div className="so-add-row">
        {stage.missingChannels.map((c) => (
          <button key={c} type="button" className="so-add-btn" disabled={busy !== null} onClick={() => add(c)}>
            <span style={{ color: `var(--so-${c})`, display: 'inline-flex' }}><Icon channel={c} /></span>
            {busy === c ? 'Adding…' : `+ ${CHANNEL_LABEL[c]}`}
          </button>
        ))}
      </div>
      <div className="so-hint" style={{ marginTop: 8 }}>It starts switched off, about {duration(DEFAULT_DELAY[stage.missingChannels[0]])} after the customer stops. Change the timing and content, then switch it on.</div>
      {msg && <div className="so-msg err" style={{ marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

function VariableDictionary({ variables }: { variables: Variable[] }) {
  const groups = Array.from(new Set(variables.map((v) => v.group)));
  return (
    <details className="so-guide" style={{ marginTop: 18 }}>
      <summary>Every variable the Ello agent receives ({variables.length})</summary>
      <div className="so-hint" style={{ margin: '8px 0 12px' }}>Sent with each call. The agent&apos;s prompt must use these exact names. After a new one is added, run the agent sync so Ello learns it.</div>
      <div style={{ display: 'grid', gap: 16 }}>
        {groups.map((g) => (
          <div key={g}>
            <div className="so-vargroup-name">{g}</div>
            <table className="table">
              <thead><tr><th style={{ width: 220 }}>Variable</th><th>What it holds</th><th style={{ width: 260 }}>Example</th></tr></thead>
              <tbody>
                {variables.filter((v) => v.group === g).map((v) => (
                  <tr key={v.name}><td className="mono">{v.name}</td><td>{v.description}</td><td className="muted">{v.example}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </details>
  );
}
