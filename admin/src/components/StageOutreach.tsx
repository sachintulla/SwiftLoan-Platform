'use client';
// ONE page to configure what the customer receives at every journey stage, on
// every channel: WhatsApp, SMS, email, Ello call and push. For each follow-up you
// set when it goes out, switch it on or off, and edit what it says and which
// variables travel with it.
//
// Timing and on/off live on the stall rules (the same rows as Notification
// Rules). WhatsApp templates and SMS overrides live in the Voxvalley settings and
// the call's agent/brief in the Ello settings, where the senders already read
// them, so this page never creates a second copy.
import React, { useRef, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { Card, TableSkeleton, Callout } from '@/components/ui';

type Channel = 'push' | 'whatsapp' | 'sms' | 'email' | 'voice';

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
  gates: { callsAutomatic: boolean; testNumbersOnly: number; nudgesDisabled: boolean; elloConnected: boolean; whatsappConnected: boolean; upshotConnected: boolean; smsConnected: boolean };
}

const KEY = '/api/admin/stage-outreach';
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email', 'voice', 'push'];
const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', voice: 'Call (Ello)', push: 'Push' };
const CHANNEL_TONE: Record<Channel, string> = { whatsapp: 'tone-green', sms: 'tone-blue', email: 'tone-amber', voice: 'tone-teal', push: 'tone-grey' };
const DEFAULT_DELAY: Record<Channel, number> = { whatsapp: 30, sms: 30, email: 30, voice: 60, push: 20 };

function duration(mins: number): string {
  if (!mins || mins < 1) return 'immediately';
  if (mins < 60) return `${mins} min`;
  if (mins % 1440 === 0) { const d = mins / 1440; return `${d} day${d === 1 ? '' : 's'}`; }
  if (mins % 60 === 0) { const h = mins / 60; return `${h} hour${h === 1 ? '' : 's'}`; }
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function errText(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : 'Could not save';
}

export default function StageOutreach() {
  const { data, error, isLoading, mutate } = useSWR(KEY, swrFetcher);
  const ov = data?.data as Overview | undefined;
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (error) return <Card><div className="empty">Could not load stage outreach — {(error as Error).message}</div></Card>;
  if (isLoading || !ov) return <Card><TableSkeleton rows={6} cols={2} /></Card>;

  function openStage(key: string) {
    setOpen((o) => ({ ...o, [key]: true }));
    setTimeout(() => document.getElementById(`stage-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Gates ov={ov} />
      <HowTo />
      <Matrix ov={ov} onOpen={openStage} />
      {ov.stages.map((stage, i) => (
        <StageCard
          key={stage.key} index={i + 1} stage={stage} ov={ov}
          open={!!open[stage.key]} onToggle={() => setOpen((o) => ({ ...o, [stage.key]: !o[stage.key] }))}
          onSaved={() => mutate()}
        />
      ))}
      <VariableReference variables={ov.variables} />
    </div>
  );
}

function Gates({ ov }: { ov: Overview }) {
  const g = ov.gates;
  const notes: Array<{ tone: 'amber' | 'blue' | 'red'; text: string }> = [];
  if (!g.whatsappConnected) notes.push({ tone: 'amber', text: 'No WhatsApp provider is turned on (Vox or Meta), so WhatsApp steps will not send.' });
  if (!g.smsConnected) notes.push({ tone: 'amber', text: 'The Vox SMS gateway is off, so SMS steps will not send.' });
  if (!g.upshotConnected) notes.push({ tone: 'amber', text: 'Upshot is off, so email and push steps will not reach anyone (they are sent through Upshot).' });
  if (!g.elloConnected) notes.push({ tone: 'amber', text: 'Ello voice is not connected, so calls cannot be placed.' });
  if (!g.callsAutomatic) notes.push({ tone: 'blue', text: 'Automatic drop-off calls are switched off (Timings → calls.nudgeEnabled). No call rings a customer until that is on.' });
  if (g.callsAutomatic && g.testNumbersOnly > 0) notes.push({ tone: 'blue', text: `Test mode: calls only go to the ${g.testNumbersOnly} allowed test number${g.testNumbersOnly === 1 ? '' : 's'}.` });
  if (g.nudgesDisabled) notes.push({ tone: 'red', text: 'NUDGES_DISABLED is set on this server, so stage follow-ups are paused here.' });
  if (!notes.length) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {notes.map((n) => <Callout key={n.text} tone={n.tone}>{n.text}</Callout>)}
    </div>
  );
}

function HowTo() {
  return (
    <Card title="Stage outreach" sub="Configure everything a customer receives, at every journey stage and on every channel, from this one page.">
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>How to configure it</summary>
        <ol style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 6, fontSize: 13.5 }}>
          <li><b>Pick the stage</b> where the customer stops: website lead, app installed, OTP, application, offers, KYC. The grid below shows every stage and channel at a glance; click a cell to jump to it.</li>
          <li><b>Add a follow-up</b> on any channel the stage does not have yet: WhatsApp, SMS, Email or Call. One per channel per stage.</li>
          <li><b>Set the timing</b>: how many minutes after the customer stops it goes out.</li>
          <li><b>Set the content</b>: the WhatsApp template and its variables, the registered SMS text, the Upshot event for email or push, or for a call the Ello agent and what it should talk about.</li>
          <li><b>Switch it on and Save.</b> A new follow-up starts switched off, so nothing reaches a customer until you turn it on. Calls also need the Timings switch.</li>
        </ol>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Website visitors and app users share these stages: the app&apos;s activity is mapped onto the same journey events, so one setup covers both. The scheduled install reminders sent to website visitors who leave early are separate and live on the Timings page.
        </div>
      </details>
    </Card>
  );
}

function Matrix({ ov, onOpen }: { ov: Overview; onOpen: (key: string) => void }) {
  return (
    <Card title="Everything at a glance" sub="Each cell shows whether that follow-up is on and how long after the customer stops it goes out. Click a cell to edit it.">
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Stage</th>
              {CHANNELS.map((c) => <th key={c}>{CHANNEL_LABEL[c]}</th>)}
            </tr>
          </thead>
          <tbody>
            {ov.stages.map((s, i) => (
              <tr key={s.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{i + 1}. {s.label}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{s.surface}</div>
                </td>
                {CHANNELS.map((c) => {
                  const a = s.activities.find((x) => x.channel === c);
                  return (
                    <td key={c}>
                      {a ? (
                        <button type="button" className={`badge ${a.enabled ? 'tone-green' : 'tone-grey'}`}
                          style={{ cursor: 'pointer', border: 'none' }} onClick={() => onOpen(s.key)}>
                          {a.enabled ? 'On' : 'Off'} · {duration(a.delayMinutes)}
                        </button>
                      ) : (
                        <button type="button" className="muted" style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} onClick={() => onOpen(s.key)} title="Not set up. Click to add.">+ add</button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StageCard({ index, stage, ov, open, onToggle, onSaved }: {
  index: number; stage: Stage; ov: Overview; open: boolean; onToggle: () => void; onSaved: () => void;
}) {
  const on = stage.activities.filter((a) => a.enabled);
  return (
    <div id={`stage-${stage.key}`}>
      <Card
        title={`${index}. ${stage.label}`}
        sub={`${stage.description}  (${stage.surface})`}
        right={
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <span className={`badge ${on.length ? 'tone-green' : 'tone-grey'}`}>{on.length} of {stage.activities.length} on</span>
            <button className="btn" onClick={onToggle}>{open ? 'Close' : 'Edit'}</button>
          </div>
        }
      >
        {!open ? (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {stage.activities.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No follow-ups yet. Click Edit to add one.</span>}
            {stage.activities.map((a) => (
              <span key={a.ruleId} className={`badge ${a.enabled ? CHANNEL_TONE[a.channel] : 'tone-grey'}`}>
                {CHANNEL_LABEL[a.channel]} · {duration(a.delayMinutes)}{a.enabled ? '' : ' · off'}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 0 }}>
            {stage.activities.map((a, i) => (
              <ActivityRow key={a.ruleId} stageKey={stage.key} activity={a} ov={ov} last={i === stage.activities.length - 1 && stage.missingChannels.length === 0} onSaved={onSaved} />
            ))}
            <AddFollowUp stage={stage} onSaved={onSaved} />
          </div>
        )}
      </Card>
    </div>
  );
}

function AddFollowUp({ stage, onSaved }: { stage: Stage; onSaved: () => void }) {
  const [channel, setChannel] = useState<Channel | ''>('');
  const [delay, setDelay] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (stage.missingChannels.length === 0) return null;
  const chosen = (channel || stage.missingChannels[0]) as Channel;
  const delayNum = delay.trim() === '' ? DEFAULT_DELAY[chosen] : Number(delay);
  const valid = Number.isInteger(delayNum) && delayNum >= 1 && delayNum <= 20160;

  async function add() {
    setBusy(true); setMsg(null);
    try {
      await apiFetch(`${KEY}/${stage.key}/activities`, { method: 'POST', body: JSON.stringify({ channel: chosen, delayMinutes: delayNum }) });
      setChannel(''); setDelay('');
      onSaved();
    } catch (e) {
      setMsg(errText(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 16 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Add a follow-up</span>
      <select className="input" style={{ width: 150 }} value={chosen} onChange={(e) => { setChannel(e.target.value as Channel); setDelay(''); }}>
        {stage.missingChannels.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
      </select>
      <span style={{ fontSize: 13 }}>after</span>
      <input className="input" style={{ width: 80 }} inputMode="numeric" value={delay} placeholder={String(DEFAULT_DELAY[chosen])}
        onChange={(e) => setDelay(e.target.value.replace(/[^0-9]/g, ''))} aria-label="Minutes" />
      <span style={{ fontSize: 13 }}>min</span>
      <button className="btn btn-primary" disabled={busy || !valid} onClick={add}>{busy ? 'Adding…' : 'Add (starts off)'}</button>
      {msg && <span style={{ fontSize: 12.5, color: 'var(--danger, #c0392b)' }}>{msg}</span>}
    </div>
  );
}

function ActivityRow({ stageKey, activity: a, ov, last, onSaved }: { stageKey: string; activity: Activity; ov: Overview; last: boolean; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(a.enabled);
  const [delay, setDelay] = useState(String(a.delayMinutes));
  const [upshotEvent, setUpshotEvent] = useState(a.upshotEvent);
  const [waTemplate, setWaTemplate] = useState(a.whatsapp?.template ?? '');
  const [waLanguage, setWaLanguage] = useState(a.whatsapp?.language ?? 'en');
  const [waVars, setWaVars] = useState((a.whatsapp?.placeholders ?? []).join('\n'));
  const [smsId, setSmsId] = useState(a.sms?.templateId ?? '');
  const [smsBody, setSmsBody] = useState(a.sms?.body ?? '');
  const [role, setRole] = useState(a.call?.agentRole ?? '');
  const [assistantId, setAssistantId] = useState(a.call?.assistantId ?? '');
  const [brief, setBrief] = useState(a.call?.brief ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const waRef = useRef<HTMLTextAreaElement>(null);

  const touch = () => setMsg(null);
  const delayNum = Number(delay);
  const delayValid = delay.trim() !== '' && Number.isInteger(delayNum) && delayNum >= 1 && delayNum <= 20160;
  const isUpshot = a.channel === 'email' || a.channel === 'push';

  const ruleDirty = enabled !== a.enabled || delayNum !== a.delayMinutes || (isUpshot && upshotEvent.trim() !== a.upshotEvent);
  const waVarList = waVars.split('\n').map((s) => s.trim()).filter(Boolean);
  const waDirty = a.channel === 'whatsapp' && (waTemplate.trim() !== (a.whatsapp?.template ?? '') || waLanguage.trim() !== (a.whatsapp?.language ?? 'en') || waVarList.join('\n') !== (a.whatsapp?.placeholders ?? []).join('\n'));
  const smsDirty = a.channel === 'sms' && (smsId.trim() !== (a.sms?.templateId ?? '') || smsBody.trim() !== (a.sms?.body ?? '').trim());
  const callDirty = a.channel === 'voice' && (role !== (a.call?.agentRole ?? '') || assistantId.trim() !== (a.call?.assistantId ?? '') || brief.trim() !== (a.call?.brief ?? ''));
  const dirty = ruleDirty || waDirty || smsDirty || callDirty;
  const upshotValid = !isUpshot || upshotEvent.trim().length > 0;

  function insertInto(ref: React.RefObject<HTMLTextAreaElement>, value: string, set: (v: string) => void, token: string, sep = '') {
    const el = ref.current;
    if (!el) { set(`${value}${sep}${token}`); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    set(value.slice(0, start) + token + value.slice(end));
    touch();
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      if (ruleDirty) {
        await apiFetch(`/api/admin/stall-rules/${a.ruleId}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled, delayMinutes: delayNum, ...(isUpshot ? { upshotEvent: upshotEvent.trim() } : {}) }),
        });
      }
      if (waDirty) await apiFetch(`${KEY}/${stageKey}/whatsapp`, { method: 'PUT', body: JSON.stringify({ template: waTemplate.trim(), language: waLanguage.trim() || 'en', placeholders: waVarList }) });
      if (smsDirty) await apiFetch(`${KEY}/${stageKey}/sms`, { method: 'PUT', body: JSON.stringify({ templateId: smsId.trim(), body: smsBody }) });
      if (callDirty) await apiFetch(`${KEY}/${stageKey}/call`, { method: 'PUT', body: JSON.stringify({ agentRole: role || null, assistantId: assistantId.trim(), brief }) });
      setMsg({ ok: true, text: 'Saved' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove the ${CHANNEL_LABEL[a.channel]} follow-up from this stage? It stops going out. Customers already contacted are not affected.`)) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/stall-rules/${a.ruleId}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 16, padding: '16px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div>
        <span className={`badge ${CHANNEL_TONE[a.channel]}`}>{CHANNEL_LABEL[a.channel]}</span>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{a.firedCount ? `${a.firedCount} sent so far` : 'Not sent yet'}</div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); touch(); }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{enabled ? 'On' : 'Off'}</span>
          </label>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Goes out after</span>
            <input className="input" style={{ width: 90 }} inputMode="numeric" value={delay}
              onChange={(e) => { setDelay(e.target.value.replace(/[^0-9]/g, '')); touch(); }} aria-label="Minutes after the customer stops" />
            <span style={{ fontSize: 13 }}>min</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{delayValid ? `= ${duration(delayNum)} after they stop` : 'Enter 1 or more minutes'}</span>
          </div>
        </div>

        {a.channel === 'whatsapp' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 6, minWidth: 240 }}>
                <span className="field-label">Approved WhatsApp template name</span>
                <input className="input mono" value={waTemplate} placeholder="e.g. offers_ready"
                  onChange={(e) => { setWaTemplate(e.target.value); touch(); }} />
              </label>
              <label style={{ display: 'grid', gap: 6, width: 100 }}>
                <span className="field-label">Language</span>
                <input className="input mono" value={waLanguage} onChange={(e) => { setWaLanguage(e.target.value); touch(); }} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="field-label">Variables, one per line, in order ({'{{1}}'}, {'{{2}}'}…)</span>
              <textarea ref={waRef} className="input mono" rows={Math.max(2, Math.min(6, waVarList.length + 1))} value={waVars}
                placeholder={'{name}\n{offerCount}\n{ref}'} onChange={(e) => { setWaVars(e.target.value); touch(); }} />
            </label>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="field-label">Add:</span>
              {ov.whatsappTokens.map((t) => (
                <button key={t} type="button" className="btn" style={{ padding: '2px 8px', fontSize: 11.5, fontFamily: 'monospace' }}
                  onClick={() => insertInto(waRef, waVars, setWaVars, waVars && !waVars.endsWith('\n') ? `\n${t}` : t)}>{t}</button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {waTemplate.trim() === '' ? 'No template: this step falls back to the Upshot event.' : 'A customer missing one of these values is skipped, never sent a blank. Leave the template empty to hand this step back to Upshot.'}
              {a.whatsapp?.customised ? '' : ' Showing the shipped default.'}
            </div>
          </div>
        )}

        {a.channel === 'sms' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, maxWidth: 320 }}>
              <span className="field-label">DLT template ID</span>
              <input className="input mono" value={smsId} onChange={(e) => { setSmsId(e.target.value); touch(); }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="field-label">Exact registered text</span>
              <textarea className="input" rows={4} maxLength={1000} value={smsBody} onChange={(e) => { setSmsBody(e.target.value); touch(); }} />
            </label>
            <div className="muted" style={{ fontSize: 12 }}>
              India SMS must match the DLT registration character for character, so no variables are added. {a.sms?.customised ? 'This stage has its own text.' : 'This is the default text used at every stage; change it here to give this stage its own.'}
            </div>
          </div>
        )}

        {isUpshot && (
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'grid', gap: 6, maxWidth: 420 }}>
              <span className="field-label">Upshot event to fire</span>
              <input className="input mono" value={upshotEvent} onChange={(e) => { setUpshotEvent(e.target.value); touch(); }} />
            </label>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {a.channel === 'email' ? 'Email' : 'Push'} is sent through Upshot. Write the message there and attach it to this event. These details go with the event: name, phone, city, source, campaign, stage and minutes stuck.
            </div>
          </div>
        )}

        {a.channel === 'voice' && a.call && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                <span className="field-label">Ello agent</span>
                <select className="input" value={role} onChange={(e) => { setRole(e.target.value); touch(); }}>
                  <option value="">Website lead callback (default)</option>
                  {ov.agentRoles.filter((r) => r.direction === 'outbound' && r.role !== 'leadCallback').map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                <span className="field-label">Or a specific agent ID (optional)</span>
                <input className="input mono" value={assistantId} placeholder="Overrides the agent above"
                  onChange={(e) => { setAssistantId(e.target.value); touch(); }} />
              </label>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Calls agent: <span className="mono">{assistantId.trim() || a.call.effectiveAgentId || 'none configured'}</span>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="field-label">What the agent should talk about at this stage</span>
              <textarea ref={briefRef} className="input" rows={4} maxLength={ov.maxBriefLength} value={brief}
                placeholder="e.g. Greet {lead_first_name}. They {stall_reason}. Offer to {stall_help}."
                onChange={(e) => { setBrief(e.target.value); touch(); }} />
              <span className="muted" style={{ fontSize: 12 }}>
                {brief.length}/{ov.maxBriefLength}. Sent to the agent as <span className="mono">stage_brief</span>, with each {'{variable}'} replaced by the customer&apos;s real value.
              </span>
            </label>

            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Variables sent with this call ({ov.variables.length}). Click one to add it to the text above.</summary>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {ov.variables.map((v) => (
                  <button key={v.name} type="button" className="btn" title={`${v.description}. Example: ${v.example}`}
                    style={{ padding: '2px 8px', fontSize: 11.5, fontFamily: 'monospace' }} onClick={() => insertInto(briefRef, brief, setBrief, `{${v.name}}`)}>
                    {v.name}
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}

        <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!dirty || saving || !delayValid || !upshotValid} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn" disabled={saving} onClick={remove}>Remove</button>
          {dirty && !msg && <span className="muted" style={{ fontSize: 12.5 }}>Unsaved changes</span>}
          {msg && <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--ok, #0d7a6f)' : 'var(--danger, #c0392b)' }}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}

function VariableReference({ variables }: { variables: Variable[] }) {
  const groups = Array.from(new Set(variables.map((v) => v.group)));
  return (
    <Card title="Every variable the Ello agent receives" sub="Sent with each call. The agent's prompt must use these exact names; run the agent sync after a new one is added.">
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Show all {variables.length} variables with examples</summary>
        <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          {groups.map((g) => (
            <div key={g}>
              <div className="field-label" style={{ marginBottom: 6 }}>{g}</div>
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
    </Card>
  );
}
