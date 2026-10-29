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
import { laterEvents } from '@/lib/eventLabels';
import StageTimeline from '@/components/StageTimeline';
import { CHANNEL_LABEL, Icon, duration, type Channel } from '@/components/stageOutreachUi';
import { FLOWS, FLOW_LABEL, stagesForFlow, type FlowKey, type FlowStep, type RuleSurface } from '@/lib/stageFlows';

interface Activity {
  ruleId: string;
  name: string;
  channel: Channel;
  delayMinutes: number;
  cooldownMinutes: number;
  enabled: boolean;
  /** The step the customer has not yet done; the notification is skipped once they do it. */
  expectedEvent: string;
  upshotEvent: string;
  firedCount: number;
  /** Who it applies to: both, only the app, or only the website. */
  surface?: RuleSurface;
  whatsapp?: { template: string; language: string; placeholders: string[]; customised: boolean; recommended: { name: string; language: string; placeholders: string[]; preview: string } | null };
  sms?: { templateId: string; body: string; customised: boolean };
  call?: { agentRole: string | null; assistantId: string; brief: string; effectiveAgentId: string | null };
}
interface Stage {
  key: string; label: string; description: string; surface: string; expectedEvent: string;
  activities: Activity[]; missingChannels: Channel[];
}
type MessageKind = 'conversationSummary' | 'noOffers' | 'eligibilityRetry';
interface CatalogTemplate {
  name: string; category: string; language: string; purpose: string; target: string; usedBy: string;
  body: string; footer: string; variables: string[]; examples: string[]; placeholders: string[];
  replaces?: string; preview: string; meta: unknown; recommendedStages?: string[];
}
interface Variable { name: string; group: string; description: string; example: string }
interface AgentRole { role: string; label: string; direction: string }
interface Overview {
  stages: Stage[];
  /** The App and Website journeys, each in its own order and words. */
  flows: Record<FlowKey, FlowStep[]>;
  variables: Variable[];
  whatsappTokens: string[];
  agentRoles: AgentRole[];
  maxBriefLength: number;
  messages: Record<MessageKind, { enabled: boolean; template: string; language: string; placeholders: string[]; tokens: string[] }>;
  templates: CatalogTemplate[];
  legacyTemplates: Array<{ name: string; issue: string; replacement: string }>;
  gates: { callsAutomatic: boolean; testNumbersOnly: number; nudgesDisabled: boolean; elloConnected: boolean; whatsappConnected: boolean; upshotConnected: boolean; smsConnected: boolean };
}

const KEY = '/api/admin/stage-outreach';
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email', 'voice', 'push'];
const DEFAULT_DELAY: Record<Channel, number> = { whatsapp: 30, sms: 30, email: 30, voice: 60, push: 20 };

function errText(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : 'Could not save';
}

export default function StageOutreach() {
  const { data, error, isLoading, mutate } = useSWR(KEY, swrFetcher);
  const ov = data?.data as Overview | undefined;
  const [selected, setSelected] = useState<string | null>(null);
  const [openRule, setOpenRule] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowKey>('app');

  if (error) return <div className="card card-pad"><div className="empty">Could not load stage outreach: {(error as Error).message}</div></div>;
  if (isLoading || !ov) return <div className="card card-pad"><TableSkeleton rows={6} cols={2} /></div>;

  // The tab decides which steps are listed, what they are called, and which follow-ups show.
  const flowStages = stagesForFlow(flow, ov.flows?.[flow] ?? [], ov.stages);
  const shown = flowStages.length ? flowStages : ov.stages;
  const current = shown.find((s) => s.key === selected) ?? shown.find((s) => s.activities.some((a) => a.enabled)) ?? shown[0];

  return (
    <div className="so">
      <div className="so-flows" role="tablist" aria-label="App or website">
        {FLOWS.map((f) => {
          const list = stagesForFlow(f, ov.flows?.[f] ?? [], ov.stages);
          const on = list.reduce((n, st) => n + st.activities.filter((a) => a.enabled).length, 0);
          return (
            <button key={f} type="button" role="tab" aria-selected={flow === f} className={`so-flow ${flow === f ? 'active' : ''}`}
              onClick={() => { setFlow(f); setSelected(null); setOpenRule(null); }}>
              <span className="so-flow-ico" aria-hidden>{f === 'app' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
              )}</span>
              <span className="so-flow-text">
                <b>{FLOW_LABEL[f]}</b>
                <span>{list.length} steps · {on} follow-up{on === 1 ? '' : 's'} on</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="so-grid">
        <Rail title={`${FLOW_LABEL[flow]} journey`} stages={shown} currentKey={current.key} onPick={(k) => { setSelected(k); setOpenRule(null); }} />
        <StagePanel
          key={`${flow}:${current.key}`} flow={flow} stage={current} ov={ov}
          openRule={openRule} setOpenRule={setOpenRule} onChanged={() => mutate()}
        />
      </div>

    </div>
  );
}

/** The WhatsApp messages that are not tied to one journey stage. Each is off until a template is named. */
const MESSAGE_META: Record<MessageKind, { target: string; title: string; summary: string; on: string; example: string; hint: string; rules: React.ReactNode }> = {
  conversationSummary: {
    target: 'summary',
    title: 'After every conversation',
    summary: 'WhatsApp the customer a recap of what was discussed and their action plan, after a call, or after talking to the in-app or website agent.',
    on: 'On: send a recap after each conversation',
    example: 'conversation_summary',
    hint: '{summary} is what we discussed, {actionPlan} is what happens next, {callbackTime} is the agreed callback.',
    rules: <>Only the agent&apos;s <span className="mono">customer_summary</span> is sent, in the customer&apos;s own terms; add <span className="mono">action_plan</span> for the next steps. The internal <span className="mono">summary</span> written for colleagues is never sent. If the agent sends no customer summary, nothing goes out. Nothing is sent after a refusal, wrong number, voicemail or no answer, and in test mode only the allowed test numbers receive it. Each conversation sends once.</>,
  },
  noOffers: {
    target: 'noOffers',
    title: 'When the eligibility check returns no offers',
    summary: 'WhatsApp the customer that the check finished and no offers are available for their profile, so nobody is left wondering.',
    on: 'On: tell the customer when no offers are available',
    example: 'no_offers_update',
    hint: '{ref} is the application reference and {guidance} is what the customer can do next. The lender\'s own wording is never sent.',
    rules: <>Sent once per application, only when the lender made a real decision with no offers. It is also recorded as an <span className="mono">offers_not_received</span> event on the customer&apos;s timeline whether or not this is switched on. Nothing is sent for a duplicate number, to anyone who asked us to stop, or outside the allowed test numbers in test mode.</>,
  },
  eligibilityRetry: {
    target: 'eligibilityRetry',
    title: 'When the eligibility check could not complete',
    summary: 'WhatsApp the customer that a technical issue stopped the check, that their details are saved and how to try again.',
    on: 'On: tell the customer to try again after a technical issue',
    example: 'eligibility_retry_update',
    hint: '{ref} is the application reference and {link} opens the app to try again.',
    rules: <>Sent once per application when the check fails for a technical reason, not when the lender declines. Same safeguards as the no-offers message.</>,
  },
};

function MessageCard({ kind, cfg, templates, whatsappConnected, onChanged }: { kind: MessageKind; cfg: Overview['messages'][MessageKind]; templates: CatalogTemplate[]; whatsappConnected: boolean; onChanged: () => void }) {
  const meta = MESSAGE_META[kind];
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
      await apiFetch(`${KEY}/messages/${kind}`, { method: 'PUT', body: JSON.stringify({ enabled, template: template.trim(), language: language.trim() || 'en', placeholders: list }) });
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
            {meta.title}
            <span className="so-chip" style={cfg.enabled ? { background: 'var(--green-bg)', color: '#0b7a47' } : undefined}>{cfg.enabled ? `On · ${cfg.template}` : 'Off'}</span>
          </div>
          <div className="so-card-sum">{meta.summary}</div>
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
                <span style={{ fontSize: 13, fontWeight: 600 }}>{enabled ? meta.on : 'Off'}</span>
              </label>
              {needsTemplate && <span className="so-msg err">Enter the approved template name before switching this on.</span>}
            </div>
            <div className="so-field">
              <label className="so-label">Approved WhatsApp template name</label>
              <input className="input mono" value={template} placeholder={`e.g. ${meta.example}`} onChange={(e) => { setTemplate(e.target.value); touch(); }} />
              <span className="so-hint">Exactly as approved in Vox: lowercase letters, numbers, underscores.</span>
            </div>
            <div className="so-field">
              <label className="so-label">Language</label>
              <input className="input mono" style={{ maxWidth: 120 }} value={language} onChange={(e) => { setLanguage(e.target.value); touch(); }} />
            </div>
            <div className="so-field wide">
              <span className="so-label">Values</span>
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
              <span className="so-hint">The count and order must match the approved template exactly. {meta.hint}</span>
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

function Rail({ title, stages, currentKey, onPick }: { title: string; stages: Stage[]; currentKey: string; onPick: (key: string) => void }) {
  return (
    <nav className="so-rail" aria-label="Journey stages">
      <div className="so-rail-title">{title}</div>
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

function StagePanel({ stage, flow, ov, openRule, setOpenRule, onChanged }: {
  flow: FlowKey; stage: Stage; ov: Overview; openRule: string | null; setOpenRule: (id: string | null) => void; onChanged: () => void | Promise<unknown>;
}) {
  const steps = [...stage.activities].sort((a, b) => a.delayMinutes - b.delayMinutes);
  const on = steps.filter((a) => a.enabled).length;
  return (
    <section className="so-panel">
      <div className="so-panel-head">
        <div className="so-panel-top">
          <h3 className="so-panel-title">{stage.label}</h3>
          <span className="so-chip" style={on ? { background: 'var(--green-bg)', color: '#0b7a47' } : undefined}>{on} on</span>
        </div>
        <p className="so-panel-desc">{stage.description}</p>
      </div>

      <div className="so-panel-body">
        {stage.key === 'eligibility_completed' && (
          <>
            <div className="so-section">Right when the check ends (sent at once, not after a wait)</div>
            {(['noOffers', 'eligibilityRetry'] as MessageKind[]).map((kind) => (
              <MessageCard key={kind} kind={kind} cfg={ov.messages[kind]} templates={ov.templates} whatsappConnected={ov.gates.whatsappConnected} onChanged={onChanged} />
            ))}
          </>
        )}

        <div className="so-section">What the customer gets after they stop here</div>

        <StageTimeline
          stageKey={stage.key}
          flow={flow}
          stages={ov.stages.map((x) => ({ key: x.key, label: x.label }))}
          rules={steps.map((a) => ({
            key: a.ruleId, afterMinutes: a.delayMinutes, enabled: a.enabled, channel: a.channel, label: CHANNEL_LABEL[a.channel],
            node: <Step key={a.ruleId} stageKey={stage.key} a={a} ov={ov} open={openRule === a.ruleId} onToggleOpen={() => setOpenRule(openRule === a.ruleId ? null : a.ruleId)} onChanged={onChanged} />,
          }))}
        />

        <AddRow stage={stage} flow={flow} onAdded={(id) => { onChanged(); setOpenRule(id); }} />

      </div>
    </section>
  );
}

function summaryFor(a: Activity, _ov: Overview): { text: string; warn?: string } {
  if (a.channel === 'whatsapp') {
    const w = a.whatsapp;
    if (!w?.template) return { text: 'No template', warn: a.enabled ? 'Needs a template' : undefined };
    return { text: w.template };
  }
  if (a.channel === 'sms') {
    if (!a.sms?.templateId) return { text: 'No text', warn: a.enabled ? 'Needs text' : undefined };
    return { text: 'Text message' };
  }
  if (a.channel === 'voice') return { text: 'Phone call' };
  return { text: a.channel === 'email' ? 'Email' : 'Push notification' };
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
              {(a.surface ?? 'all') === 'all' && <span className="so-chip" style={{ marginLeft: 8, fontWeight: 500 }} title="Applies to the app and the website">Both</span>}
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
  const [expected, setExpected] = useState(a.expectedEvent);
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

  const ruleDirty = delayNum !== a.delayMinutes || expected !== a.expectedEvent || (isUpshot && upshotEvent.trim() !== a.upshotEvent);
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

  const groups = useMemo(() => Array.from(new Set(ov.variables.map((v) => v.group))), [ov.variables]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      if (ruleDirty) {
        await apiFetch(`/api/admin/stall-rules/${a.ruleId}`, { method: 'PATCH', body: JSON.stringify({ delayMinutes: delayNum, ...(expected !== a.expectedEvent ? { expectedEvent: expected } : {}), ...(isUpshot ? { upshotEvent: upshotEvent.trim() } : {}) }) });
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
        <TriggerPicker stageKey={stageKey} stageLabel={ov.stages.find((x) => x.key === stageKey)?.label ?? stageKey} value={expected} onChange={(v) => { setExpected(v); touch(); }} label="Skip once they reach" />
        <div className="so-field">
          <label className="so-label" htmlFor={`d-${a.ruleId}`}>Send after</label>
          <div className="so-input-unit">
            <input id={`d-${a.ruleId}`} className="input mono" inputMode="numeric" value={delay}
              onChange={(e) => { setDelay(e.target.value.replace(/[^0-9]/g, '')); touch(); }} />
            <span className="muted">minutes</span>
          </div>
          {!delayValid && <span className="so-hint">Enter 1 minute or more.</span>}
        </div>

        {a.channel === 'whatsapp' && (
          <>
            <div className="so-field">
              <label className="so-label">Template</label>
              <input className="input mono" value={waTemplate} onChange={(e) => { setWaTemplate(e.target.value); touch(); }} />
            </div>
            <div className="so-field">
              <label className="so-label">Language code</label>
              <input className="input mono" style={{ maxWidth: 120 }} value={waLanguage} onChange={(e) => { setWaLanguage(e.target.value); touch(); }} />
            </div>
            <div className="so-field wide">
              <span className="so-label">Values sent into the template, in order</span>
              <div className="so-vars">
                {waVars.length === 0 && <span className="so-hint">None</span>}
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
            </div>
          </>
        )}

        {a.channel === 'sms' && (
          <>
            <div className="so-field">
              <label className="so-label">Template ID</label>
              <input className="input mono" value={smsId} onChange={(e) => { setSmsId(e.target.value); touch(); }} />
            </div>
            <div className="so-field wide">
              <label className="so-label">Text</label>
              <textarea className="input" rows={4} maxLength={1000} value={smsBody} onChange={(e) => { setSmsBody(e.target.value); touch(); }} />
              <span className="so-hint">{a.sms?.customised ? 'Own text for this step' : 'Default text'}</span>
            </div>
          </>
        )}

        {isUpshot && (
          <div className="so-field wide">
            <label className="so-label">Upshot event to fire</label>
            <input className="input mono" value={upshotEvent} onChange={(e) => { setUpshotEvent(e.target.value); touch(); }} />
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
              <label className="so-label">Agent ID (optional)</label>
              <input className="input mono" value={assistantId} onChange={(e) => { setAssistantId(e.target.value); touch(); }} />
              <span className="so-hint">Calls <span className="mono">{assistantId.trim() || a.call.effectiveAgentId || 'no agent configured'}</span></span>
            </div>
            <div className="so-field wide">
              <label className="so-label">Talking points</label>
              <textarea ref={briefRef} className="input" rows={4} maxLength={ov.maxBriefLength} value={brief}
                onChange={(e) => { setBrief(e.target.value); touch(); }} />
              <span className="so-hint">{brief.length}/{ov.maxBriefLength}</span>
            </div>
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

/** When a notification triggers: the step the customer reached (the stage) and the step they have not yet done. */
function TriggerPicker({ stageKey, stageLabel, value, onChange, label }: { stageKey: string; stageLabel: string; value: string; onChange: (v: string) => void; label: string }) {
  const options = laterEvents(stageKey, value);
  return (
    <div className="so-field wide">
      <span className="so-label">Stop sending when</span>
      <div className="ee-trigger">
        <span>Skip if they reach</span>
        <select className="input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function AddRow({ stage, flow, onAdded }: { stage: Stage; flow: FlowKey; onAdded: (ruleId: string) => void }) {
  const [busy, setBusy] = useState<Channel | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (stage.missingChannels.length === 0) return null;

  async function add(channel: Channel) {
    setBusy(channel); setMsg(null);
    try {
      const res = await apiFetch<{ ruleId: string }>(`${KEY}/${stage.key}/activities`, { method: 'POST', body: JSON.stringify({ channel, delayMinutes: DEFAULT_DELAY[channel], surface: flow }) });
      onAdded((res.data as { ruleId: string }).ruleId);
    } catch (e) {
      setMsg(errText(e));
    } finally { setBusy(null); }
  }

  return (
    <div className="so-add">
      <div className="so-section" style={{ marginTop: 22 }}>Add a follow-up</div>
      <div className="so-add-row">
        {stage.missingChannels.map((c) => (
          <button key={c} type="button" className="so-add-btn" disabled={busy !== null} onClick={() => add(c)}>
            <span style={{ color: `var(--so-${c})`, display: 'inline-flex' }}><Icon channel={c} /></span>
            {busy === c ? 'Adding…' : `+ ${CHANNEL_LABEL[c]}`}
          </button>
        ))}
      </div>
      {msg && <div className="so-msg err" style={{ marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

