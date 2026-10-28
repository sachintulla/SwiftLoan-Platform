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
import { splitMinutes, toMinutes, draftProblem, type Unit, type ChDraft } from '@/lib/eventEditor';
import { laterEvents } from '@/lib/eventLabels';
import StageTimeline from '@/components/StageTimeline';
import { CHANNEL_LABEL, Icon, duration, tone, type Channel } from '@/components/stageOutreachUi';
import { FLOWS, FLOW_LABEL, SURFACE_LABEL, stagesForFlow, type FlowKey, type FlowStep, type RuleSurface } from '@/lib/stageFlows';

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
  const [allMode, setAllMode] = useState(false);
  const [flow, setFlow] = useState<FlowKey>('app');

  if (error) return <div className="card card-pad"><div className="empty">Could not load stage outreach: {(error as Error).message}</div></div>;
  if (isLoading || !ov) return <div className="card card-pad"><TableSkeleton rows={6} cols={2} /></div>;

  // The tab decides which steps are listed, what they are called, and which follow-ups show.
  const flowStages = stagesForFlow(flow, ov.flows?.[flow] ?? [], ov.stages);
  const shown = flowStages.length ? flowStages : ov.stages;
  const current = shown.find((s) => s.key === selected) ?? shown.find((s) => s.activities.some((a) => a.enabled)) ?? shown[0];
  const number = shown.findIndex((s) => s.key === current.key) + 1;

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

      <div className={`so-grid ${allMode ? 'stack' : ''}`}>
        <Rail title={`${FLOW_LABEL[flow]} journey`} stages={shown} currentKey={current.key} onPick={(k) => { setSelected(k); setOpenRule(null); }} />
        <StagePanel
          key={`${flow}:${current.key}`} number={number} flow={flow} stage={current} ov={ov}
          openRule={openRule} setOpenRule={setOpenRule} onChanged={() => mutate()}
          allMode={allMode} setAllMode={setAllMode}
        />
      </div>

      <details className="so-guide">
        <summary>Other messages (not tied to a step)</summary>
        <div style={{ marginTop: 10 }}>
          <MessageCard kind="conversationSummary" cfg={ov.messages.conversationSummary} templates={ov.templates} whatsappConnected={ov.gates.whatsappConnected} onChanged={() => mutate()} />
        </div>
      </details>

      <TemplateCatalog templates={ov.templates} legacy={ov.legacyTemplates} />

      <VariableDictionary variables={ov.variables} />
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
  const catalog = templates.filter((t) => t.target === meta.target);
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
              <span className="so-hint">Submit the template below to CPaaS (Vox Digitals) as <b>Utility</b>, wait for approval, then enter its exact name here.</span>
              {catalog.map((t) => (
                <button key={t.name} type="button" className="so-token" style={{ justifySelf: 'start' }}
                  onClick={() => { setTemplate(t.name); setLanguage(t.language); setVars(t.placeholders); touch(); }}>
                  Use catalogue template {t.name}
                </button>
              ))}
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
              <span className="so-hint">The count and order must match the approved template exactly. {meta.hint}</span>
            </div>
            <div className="so-field wide">
              <div className="so-preview">
                <div className="so-preview-label">How it behaves</div>
                {meta.rules}
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

function StagePanel({ number, stage, flow, ov, openRule, setOpenRule, onChanged, allMode, setAllMode }: {
  number: number; flow: FlowKey; stage: Stage; ov: Overview; openRule: string | null; setOpenRule: (id: string | null) => void; onChanged: () => void | Promise<unknown>;
  allMode: boolean; setAllMode: (v: boolean) => void;
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
          <span className="so-spacer" />
          <div className="ee-seg" role="group" aria-label="View">
            <button type="button" className={!allMode ? 'active' : ''} aria-pressed={!allMode} onClick={() => setAllMode(false)}>Timeline</button>
            <button type="button" className={allMode ? 'active' : ''} aria-pressed={allMode} onClick={() => setAllMode(true)}>All channels</button>
          </div>
        </div>
        <p className="so-panel-desc">{stage.description}</p>
      </div>

      {allMode ? (
        <div className="so-panel-body">
          <EventEditor key={stage.key} stage={stage} flow={flow} ov={ov} onSaved={onChanged} onClose={() => setAllMode(false)} />
        </div>
      ) : (
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
          stages={ov.stages.map((x) => ({ key: x.key, label: x.label }))}
          rules={steps.map((a) => ({
            key: a.ruleId, afterMinutes: a.delayMinutes, enabled: a.enabled, channel: a.channel, label: CHANNEL_LABEL[a.channel],
            node: <Step key={a.ruleId} stageKey={stage.key} a={a} ov={ov} open={openRule === a.ruleId} onToggleOpen={() => setOpenRule(openRule === a.ruleId ? null : a.ruleId)} onChanged={onChanged} />,
          }))}
        />

        <AddRow stage={stage} flow={flow} onAdded={(id) => { onChanged(); setOpenRule(id); }} />

      </div>
      )}
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
              <span className="so-chip" style={{ marginLeft: 8, fontWeight: 500 }}>{SURFACE_LABEL[a.surface ?? 'all']}</span>
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

  const sample = useMemo(() => Object.fromEntries(ov.variables.map((v) => [v.name, v.example])), [ov.variables]);
  const preview = brief.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_m, n: string) => sample[n] ?? '').replace(/[ \t]{2,}/g, ' ').trim();
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
        <TriggerPicker stageKey={stageKey} stageLabel={ov.stages.find((x) => x.key === stageKey)?.label ?? stageKey} value={expected} onChange={(v) => { setExpected(v); touch(); }} label="The step the customer has not yet done" />
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
              {a.whatsapp?.recommended && waTemplate.trim() !== a.whatsapp.recommended.name && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <button type="button" className="so-token" style={{ justifySelf: 'start' }}
                    onClick={() => { const r = a.whatsapp!.recommended!; setWaTemplate(r.name); setWaLanguage(r.language); setWaVars(r.placeholders); touch(); }}>
                    Use the utility template {a.whatsapp.recommended.name}
                  </button>
                  <span className="so-hint">Utility wording written for this stage: &ldquo;{a.whatsapp.recommended.preview}&rdquo; Switch to it once Meta has approved it as Utility.</span>
                </div>
              )}
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

/** When a notification triggers: the step the customer reached (the stage) and the step they have not yet done. */
function TriggerPicker({ stageKey, stageLabel, value, onChange, label }: { stageKey: string; stageLabel: string; value: string; onChange: (v: string) => void; label: string }) {
  const options = laterEvents(stageKey, value);
  return (
    <div className="so-field wide">
      <span className="so-label">When it triggers</span>
      <div className="ee-trigger">
        <span>When the customer reaches <b>{stageLabel}</b> but has not yet reached</span>
        <select className="input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <span className="so-hint">Customers who have already done this are skipped. It then goes out after the time you set.</span>
    </div>
  );
}

/* ─────────────── One event, every channel, one Save ─────────────── */

const UNIT_LABEL: Record<Unit, string> = { min: 'minutes', hr: 'hours', day: 'days' };
const UNIT_ONE: Record<Unit, string> = { min: 'minute', hr: 'hour', day: 'day' };
const unitText = (u: Unit, val: string) => (val === '1' ? UNIT_ONE[u] : UNIT_LABEL[u]);

function makeDraft(a: Activity | undefined, ch: Channel, stageKey: string, stageExpected: string): ChDraft {
  const delay = splitMinutes(a?.delayMinutes ?? DEFAULT_DELAY[ch]);
  const cool = splitMinutes(a?.cooldownMinutes ?? (ch === 'voice' ? 4320 : 1440));
  return {
    enabled: a?.enabled ?? false,
    expectedEvent: a?.expectedEvent ?? stageExpected,
    delayVal: delay.val, delayUnit: delay.unit, coolVal: cool.val, coolUnit: cool.unit,
    upshotEvent: a?.upshotEvent ?? `swiftloan_${stageKey}_${ch}`,
    waTemplate: a?.whatsapp?.template ?? '', waLanguage: a?.whatsapp?.language ?? 'en', waVars: a?.whatsapp?.placeholders ?? [],
    smsId: a?.sms?.templateId ?? '', smsBody: a?.sms?.body ?? '',
    role: a?.call?.agentRole ?? '', assistantId: a?.call?.assistantId ?? '', brief: a?.call?.brief ?? '',
  };
}

const ruleChanged = (d: ChDraft, b: ChDraft, upshot: boolean) =>
  d.enabled !== b.enabled || d.expectedEvent !== b.expectedEvent || toMinutes(d.delayVal, d.delayUnit) !== toMinutes(b.delayVal, b.delayUnit)
  || toMinutes(d.coolVal, d.coolUnit) !== toMinutes(b.coolVal, b.coolUnit) || (upshot && d.upshotEvent.trim() !== b.upshotEvent);
const waChanged = (d: ChDraft, b: ChDraft) =>
  d.waTemplate.trim() !== b.waTemplate || d.waLanguage.trim() !== b.waLanguage || d.waVars.map((v) => v.trim()).filter(Boolean).join('\n') !== b.waVars.join('\n');
const smsChanged = (d: ChDraft, b: ChDraft) => d.smsId.trim() !== b.smsId || d.smsBody.trim() !== b.smsBody.trim();
const callChanged = (d: ChDraft, b: ChDraft) => d.role !== b.role || d.assistantId.trim() !== b.assistantId || d.brief.trim() !== b.brief;

function EventEditor({ stage, flow, ov, onSaved, onClose }: { stage: Stage; flow: FlowKey; ov: Overview; onSaved: () => void | Promise<unknown>; onClose: () => void }) {
  const [version, setVersion] = useState(0);
  const baselines = useMemo(() => Object.fromEntries(CHANNELS.map((c) => [c, makeDraft(stage.activities.find((a) => a.channel === c), c, stage.key, stage.expectedEvent)])) as Record<Channel, ChDraft>, [stage]);
  const [drafts, setDrafts] = useState<Record<Channel, ChDraft>>(baselines);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Partial<Record<Channel, { ok: boolean; text: string }>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const recommended = ov.templates.find((t) => t.target === 'stage' && t.recommendedStages?.includes(stage.key));
  const set = (ch: Channel, patch: Partial<ChDraft>) => { setDrafts((d) => ({ ...d, [ch]: { ...d[ch], ...patch } })); setResults((r) => ({ ...r, [ch]: undefined })); setFormError(null); };
  const activityOf = (ch: Channel) => stage.activities.find((a) => a.channel === ch);
  const touched = (ch: Channel) => JSON.stringify(drafts[ch]) !== JSON.stringify(baselines[ch]);
  const anyTouched = CHANNELS.some(touched);
  const problems = CHANNELS.map((c) => [c, draftProblem(c, drafts[c], touched(c))] as const).filter(([, p]) => p);

  const sentence = CHANNELS
    .map((c) => {
      const d = drafts[c];
      if (!d.enabled) return activityOf(c) || touched(c) ? `${CHANNEL_LABEL[c]} off` : null;
      return `${CHANNEL_LABEL[c]} after ${duration(toMinutes(d.delayVal, d.delayUnit))}`;
    })
    .filter(Boolean)
    .join(', ');

  async function saveAll() {
    if (problems.length) { setFormError(problems[0][1]); return; }
    if (drafts.voice.enabled && !baselines.voice.enabled && !window.confirm('Turn on calls at this stage? Customers who stop here will get a phone call from the Ello agent, once automatic calls are enabled in Timings.')) return;
    setSaving(true); setResults({}); setFormError(null);
    const out: Partial<Record<Channel, { ok: boolean; text: string }>> = {};
    for (const ch of CHANNELS) {
      if (!touched(ch)) continue;
      const d = drafts[ch]; const b = baselines[ch]; const a = activityOf(ch);
      const upshot = ch === 'email' || ch === 'push';
      try {
        let ruleId = a?.ruleId;
        if (!ruleId) {
          const res = await apiFetch<{ ruleId: string }>(`${KEY}/${stage.key}/activities`, { method: 'POST', body: JSON.stringify({ channel: ch, delayMinutes: toMinutes(d.delayVal, d.delayUnit), surface: flow }) });
          ruleId = (res.data as { ruleId: string }).ruleId;
        }
        if (!a || ruleChanged(d, b, upshot)) {
          await apiFetch(`/api/admin/stall-rules/${ruleId}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: d.enabled, expectedEvent: d.expectedEvent, delayMinutes: toMinutes(d.delayVal, d.delayUnit), cooldownMinutes: toMinutes(d.coolVal, d.coolUnit), ...(upshot ? { upshotEvent: d.upshotEvent.trim() } : {}) }),
          });
        }
        if (ch === 'whatsapp' && waChanged(d, b)) {
          await apiFetch(`${KEY}/${stage.key}/whatsapp`, { method: 'PUT', body: JSON.stringify({ template: d.waTemplate.trim(), language: d.waLanguage.trim() || 'en', placeholders: d.waVars.map((v) => v.trim()).filter(Boolean) }) });
        }
        if (ch === 'sms' && smsChanged(d, b)) {
          await apiFetch(`${KEY}/${stage.key}/sms`, { method: 'PUT', body: JSON.stringify({ templateId: d.smsId.trim(), body: d.smsBody }) });
        }
        if (ch === 'voice' && callChanged(d, b)) {
          await apiFetch(`${KEY}/${stage.key}/call`, { method: 'PUT', body: JSON.stringify({ agentRole: d.role || null, assistantId: d.assistantId.trim(), brief: d.brief }) });
        }
        out[ch] = { ok: true, text: 'Saved' };
      } catch (e) {
        out[ch] = { ok: false, text: errText(e) };
      }
    }
    setResults(out);
    await onSaved();
    // Reload the drafts from the saved data, keeping the messages for the channels that failed.
    if (Object.values(out).every((r) => r?.ok)) setVersion((v) => v + 1);
    setSaving(false);
  }

  return (
    <div className="ee" key={version}>
      <div className="ee-intro">
        <b>Set up every channel for this event in one go.</b> Switch on the ones you want, choose when each goes out and what it says, then press <b>Save all</b>. Channels you leave off are not created and nothing is sent until a channel is on.
      </div>

      <div className="ee-grid">
        {CHANNELS.map((ch) => {
          const d = drafts[ch]; const a = activityOf(ch); const upshot = ch === 'email' || ch === 'push';
          const problem = draftProblem(ch, d, touched(ch));
          return (
            <div key={ch} className={`ee-card ${d.enabled ? 'on' : ''}`}>
              <div className="ee-card-head">
                <span className="so-node" style={{ color: `var(--so-${ch})`, width: 30, height: 30 }}><Icon channel={ch} /></span>
                <div className="ee-card-title">
                  {CHANNEL_LABEL[ch]}
                  <span className="so-hint">{a ? (a.firedCount ? `${a.firedCount} sent so far` : 'Not sent yet') : 'Not set up yet'}</span>
                </div>
                <button type="button" className={`so-switch ${d.enabled ? 'on' : ''}`} aria-pressed={d.enabled} aria-label={`${CHANNEL_LABEL[ch]} ${d.enabled ? 'on' : 'off'}`} onClick={() => set(ch, { enabled: !d.enabled })} />
              </div>

              <div className="ee-fields"><TriggerPicker stageKey={stage.key} stageLabel={stage.label} value={d.expectedEvent} onChange={(v) => set(ch, { expectedEvent: v })} label={CHANNEL_LABEL[ch] + ": the step the customer has not yet done"} /></div>

              <div className="ee-when">
                <span>Send after</span>
                <input className="input mono" inputMode="numeric" value={d.delayVal} aria-label={`${CHANNEL_LABEL[ch]}: how long after the customer stops`} onChange={(e) => set(ch, { delayVal: e.target.value.replace(/[^0-9]/g, '') })} />
                <select className="input" value={d.delayUnit} aria-label="Unit" onChange={(e) => set(ch, { delayUnit: e.target.value as Unit })}>
                  {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => <option key={u} value={u}>{unitText(u, d.delayVal)}</option>)}
                </select>
                <span className="so-hint">after they stop</span>
              </div>

              {ch === 'whatsapp' && (
                <div className="ee-fields">
                  <label className="so-field"><span className="so-label">Approved template name</span>
                    <input className="input mono" value={d.waTemplate} placeholder="e.g. offers_available_update" onChange={(e) => set(ch, { waTemplate: e.target.value })} /></label>
                  {recommended && d.waTemplate.trim() !== recommended.name && (
                    <button type="button" className="so-token" style={{ justifySelf: 'start' }} title={recommended.preview}
                      onClick={() => set(ch, { waTemplate: recommended.name, waLanguage: recommended.language, waVars: recommended.placeholders })}>
                      Use the utility template {recommended.name}
                    </button>
                  )}
                  <div className="so-field"><span className="so-label">Values sent into the template, in order</span>
                    <div className="so-vars">
                      {d.waVars.length === 0 && <span className="so-hint">None yet.</span>}
                      {d.waVars.map((v, i) => (
                        <div key={i} className="so-var">
                          <span className="so-var-no">{`{{${i + 1}}}`}</span>
                          <input className="input mono" value={v} onChange={(e) => set(ch, { waVars: d.waVars.map((x, j) => (j === i ? e.target.value : x)) })} />
                          <button type="button" className="so-x" aria-label={`Remove value ${i + 1}`} onClick={() => set(ch, { waVars: d.waVars.filter((_, j) => j !== i) })}>×</button>
                        </div>
                      ))}
                    </div>
                    <div className="so-tokens">
                      {ov.whatsappTokens.map((t) => <button key={t} type="button" className="so-token" onClick={() => set(ch, { waVars: [...d.waVars, t] })}>{t}</button>)}
                      <button type="button" className="so-token" onClick={() => set(ch, { waVars: [...d.waVars, ''] })}>+ text</button>
                    </div>
                  </div>
                </div>
              )}

              {ch === 'sms' && (
                <div className="ee-fields">
                  <label className="so-field"><span className="so-label">DLT template ID</span>
                    <input className="input mono" value={d.smsId} onChange={(e) => set(ch, { smsId: e.target.value })} /></label>
                  <label className="so-field"><span className="so-label">Exact registered text</span>
                    <textarea className="input" rows={3} maxLength={1000} value={d.smsBody} onChange={(e) => set(ch, { smsBody: e.target.value })} /></label>
                  <span className="so-hint">Must match the DLT registration exactly, so no variables. Leave both empty to use the default text.</span>
                </div>
              )}

              {upshot && (
                <div className="ee-fields">
                  <label className="so-field"><span className="so-label">Upshot event to fire</span>
                    <input className="input mono" value={d.upshotEvent} onChange={(e) => set(ch, { upshotEvent: e.target.value })} /></label>
                  <span className="so-hint">{ch === 'email' ? 'Email' : 'Push'} is sent through Upshot. Write the message there and attach it to this event.</span>
                </div>
              )}

              {ch === 'voice' && (
                <div className="ee-fields">
                  <label className="so-field"><span className="so-label">Ello agent</span>
                    <select className="input" value={d.role} onChange={(e) => set(ch, { role: e.target.value })}>
                      <option value="">Website lead callback (default)</option>
                      {ov.agentRoles.filter((r) => r.direction === 'outbound' && r.role !== 'leadCallback').map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                    </select></label>
                  <label className="so-field"><span className="so-label">Or a specific agent ID</span>
                    <input className="input mono" value={d.assistantId} placeholder="Optional" onChange={(e) => set(ch, { assistantId: e.target.value })} /></label>
                  <label className="so-field"><span className="so-label">What the agent should talk about</span>
                    <textarea className="input" rows={3} maxLength={ov.maxBriefLength} value={d.brief} placeholder="e.g. Greet {lead_first_name}. They {stall_reason}. Offer to {stall_help}." onChange={(e) => set(ch, { brief: e.target.value })} /></label>
                </div>
              )}

              <details className="ee-more">
                <summary>More</summary>
                <div className="ee-when" style={{ marginTop: 8 }}>
                  <span>Do not repeat for</span>
                  <input className="input mono" inputMode="numeric" value={d.coolVal} aria-label="Repeat protection" onChange={(e) => set(ch, { coolVal: e.target.value.replace(/[^0-9]/g, '') })} />
                  <select className="input" value={d.coolUnit} aria-label="Unit" onChange={(e) => set(ch, { coolUnit: e.target.value as Unit })}>
                    {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => <option key={u} value={u}>{unitText(u, d.coolVal)}</option>)}
                  </select>
                </div>
                <span className="so-hint">The same customer is not sent this again inside this window.</span>
              </details>

              {problem && <div className="so-msg err">{problem}</div>}
              {results[ch] && <div className={`so-msg ${results[ch]!.ok ? 'ok' : 'err'}`}>{results[ch]!.text}</div>}
            </div>
          );
        })}
      </div>

      <div className="ee-foot">
        <div className="ee-summary"><div className="so-preview-label">What will happen</div>
          {sentence ? <>When a customer stops at <b>{stage.label}</b>: {sentence}.</> : <>Nothing is set up for <b>{stage.label}</b> yet.</>}
        </div>
        <div className="so-actions ee-sticky">
          <button type="button" className="btn btn-primary" disabled={!anyTouched || saving} onClick={saveAll}>{saving ? 'Saving…' : 'Save all'}</button>
          <button type="button" className="btn" disabled={saving} onClick={onClose}>{anyTouched ? 'Discard and close' : 'Close'}</button>
          {anyTouched && !saving && !formError && <span className="so-hint">You have unsaved changes.</span>}
          {formError && <span className="so-msg err">{formError}</span>}
        </div>
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
      <div className="so-section" style={{ marginTop: 22 }}>Add {flow === 'app' ? 'an app' : 'a website'} follow-up at this step</div>
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

/**
 * Every WhatsApp message the system sends, written to Meta's Utility category, ready to
 * submit through CPaaS (Vox Digitals) or Meta. Utility is about a customer's own request,
 * so the wording is factual; Meta makes the final call on the category.
 */
function TemplateCatalog({ templates, legacy }: { templates: CatalogTemplate[]; legacy: Overview['legacyTemplates'] }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800); } catch { setCopied(null); }
  }
  return (
    <details className="so-guide" style={{ marginTop: 18 }}>
      <summary>WhatsApp template catalogue: {templates.length} Utility templates to submit</summary>
      <div className="so-hint" style={{ margin: '8px 0 12px' }}>
        Submit each as <b>Utility</b>, English. Copy the body and the sample values into CPaaS (Vox Digitals), or copy the Meta JSON. Meta decides the final category, so check what it assigns before you rely on a template: a reminder to finish an abandoned application can be re-categorised as marketing whatever it is submitted as.
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {templates.map((t) => (
          <div key={t.name} className="so-card" style={{ padding: 14 }}>
            <div className="so-card-name">
              <span className="mono">{t.name}</span>
              <span className="so-chip" style={{ background: 'var(--green-bg)', color: '#0b7a47' }}>{t.category}</span>
              <span className="so-chip">{t.usedBy}</span>
              {t.replaces && <span className="so-warn">replaces {t.replaces}</span>}
            </div>
            <div className="so-hint" style={{ marginTop: 4 }}>{t.purpose}</div>
            <div className="so-preview" style={{ marginTop: 10 }}><div className="so-preview-label">Body (as submitted)</div>{t.body}</div>
            <div className="so-preview" style={{ marginTop: 8 }}><div className="so-preview-label">Preview with the sample values</div>{t.preview}</div>
            <table className="table" style={{ marginTop: 10 }}>
              <thead><tr><th style={{ width: 60 }}>Variable</th><th>What it holds</th><th>Sample value</th><th>Filled by</th></tr></thead>
              <tbody>
                {t.variables.map((v, i) => (
                  <tr key={v}><td className="mono">{`{{${i + 1}}}`}</td><td>{v}</td><td className="muted">{t.examples[i]}</td><td className="mono">{t.placeholders[i]}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => copy(`${t.name}:name`, t.name)}>{copied === `${t.name}:name` ? 'Copied' : 'Copy name'}</button>
              <button type="button" className="btn" onClick={() => copy(`${t.name}:body`, t.body)}>{copied === `${t.name}:body` ? 'Copied' : 'Copy body'}</button>
              <button type="button" className="btn" onClick={() => copy(`${t.name}:samples`, t.examples.join('\n'))}>{copied === `${t.name}:samples` ? 'Copied' : 'Copy sample values'}</button>
              <button type="button" className="btn" onClick={() => copy(`${t.name}:json`, JSON.stringify(t.meta, null, 2))}>{copied === `${t.name}:json` ? 'Copied' : 'Copy Meta JSON'}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="so-vargroup-name" style={{ marginTop: 18 }}>Older templates to retire</div>
      <table className="table">
        <thead><tr><th style={{ width: 220 }}>Template</th><th>Why</th><th>Use instead</th></tr></thead>
        <tbody>
          {legacy.map((l) => <tr key={l.name}><td className="mono">{l.name}</td><td>{l.issue}</td><td className="mono">{l.replacement}</td></tr>)}
        </tbody>
      </table>
    </details>
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
