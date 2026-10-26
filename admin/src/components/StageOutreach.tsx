'use client';
// One screen for "what happens at each journey stage": every follow-up the
// customer gets (WhatsApp, SMS, Ello call), when it goes out, whether it is on,
// what it says and which variables travel with it. Timing and on/off live on the
// stall rules (same rows as Notification Rules); the call's agent and brief live
// in the Ello integration settings.
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
  firedCount: number;
  whatsapp?: { template: string; language: string; placeholders: string[] } | null;
  push?: { upshotEvent: string };
  call?: { agentRole: string | null; assistantId: string; brief: string; effectiveAgentId: string | null };
}
interface Stage { key: string; label: string; description: string; activities: Activity[] }
interface Variable { name: string; group: string; description: string; example: string }
interface AgentRole { role: string; label: string; direction: string; purpose: string }
interface Overview {
  stages: Stage[];
  variables: Variable[];
  agentRoles: AgentRole[];
  maxBriefLength: number;
  gates: { callsAutomatic: boolean; testNumbersOnly: number; nudgesDisabled: boolean; elloConnected: boolean; whatsappConnected: boolean };
}

const KEY = '/api/admin/stage-outreach';
const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: 'WhatsApp', sms: 'SMS', voice: 'Call (Ello)', push: 'Push', email: 'Email' };
const CHANNEL_TONE: Record<Channel, string> = { whatsapp: 'tone-green', sms: 'tone-blue', voice: 'tone-teal', push: 'tone-grey', email: 'tone-grey' };

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

  if (error) return <Card><div className="empty">Could not load stage outreach — {(error as Error).message}</div></Card>;
  if (isLoading || !ov) return <Card><TableSkeleton rows={6} cols={2} /></Card>;

  const { gates } = ov;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="What happens at each stage" sub="Each stage lists every follow-up in the order it goes out. Change when it happens, switch it on or off, and see the variables that travel with it.">
        <div style={{ display: 'grid', gap: 8 }}>
          {!gates.elloConnected && <Callout tone="amber">Ello voice is not connected, so calls cannot be placed. Connect it on the Voice calling tab.</Callout>}
          {!gates.whatsappConnected && <Callout tone="amber">No WhatsApp provider is turned on (Vox or Meta), so WhatsApp steps will not send.</Callout>}
          {!gates.callsAutomatic && <Callout tone="blue">Automatic drop-off calls are switched off (Timings → calls.nudgeEnabled). Nothing here rings a customer until that is on.</Callout>}
          {gates.callsAutomatic && gates.testNumbersOnly > 0 && <Callout tone="blue">Test mode: only {gates.testNumbersOnly} allowed test number{gates.testNumbersOnly === 1 ? '' : 's'} will be called.</Callout>}
          {gates.nudgesDisabled && <Callout tone="red">NUDGES_DISABLED is set on this server, so stage follow-ups are paused here.</Callout>}
        </div>
      </Card>

      {ov.stages.map((stage, i) => (
        <StageCard key={stage.key} index={i + 1} stage={stage} ov={ov} onSaved={() => mutate()} />
      ))}

      <VariableReference variables={ov.variables} />
    </div>
  );
}

function StageCard({ index, stage, ov, onSaved }: { index: number; stage: Stage; ov: Overview; onSaved: () => void }) {
  const on = stage.activities.filter((a) => a.enabled).length;
  return (
    <Card
      title={`${index}. ${stage.label}`}
      sub={stage.description}
      right={<span className={`badge ${on ? 'tone-green' : 'tone-grey'}`}>{on} of {stage.activities.length} on</span>}
    >
      {stage.activities.length === 0 ? (
        <div className="empty">No follow-ups are set up for this stage yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 0 }}>
          {stage.activities.map((a, i) => (
            <ActivityRow key={a.ruleId} stageKey={stage.key} activity={a} ov={ov} last={i === stage.activities.length - 1} onSaved={onSaved} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ActivityRow({ stageKey, activity: a, ov, last, onSaved }: { stageKey: string; activity: Activity; ov: Overview; last: boolean; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(a.enabled);
  const [delay, setDelay] = useState(String(a.delayMinutes));
  const [role, setRole] = useState(a.call?.agentRole ?? '');
  const [assistantId, setAssistantId] = useState(a.call?.assistantId ?? '');
  const [brief, setBrief] = useState(a.call?.brief ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);

  const delayNum = Number(delay);
  const delayValid = delay.trim() !== '' && Number.isInteger(delayNum) && delayNum >= 0 && delayNum <= 43200;
  const ruleDirty = enabled !== a.enabled || delayNum !== a.delayMinutes;
  const callDirty = a.channel === 'voice' && (role !== (a.call?.agentRole ?? '') || assistantId.trim() !== (a.call?.assistantId ?? '') || brief.trim() !== (a.call?.brief ?? ''));
  const dirty = ruleDirty || callDirty;

  function insertVariable(name: string) {
    const el = briefRef.current;
    const token = `{${name}}`;
    if (!el) { setBrief((b) => `${b}${token}`); return; }
    const start = el.selectionStart ?? brief.length;
    const end = el.selectionEnd ?? brief.length;
    setBrief(brief.slice(0, start) + token + brief.slice(end));
    setMsg(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      if (ruleDirty) {
        await apiFetch(`/api/admin/stall-rules/${a.ruleId}`, { method: 'PATCH', body: JSON.stringify({ enabled, delayMinutes: delayNum }) });
      }
      if (callDirty) {
        await apiFetch(`${KEY}/${stageKey}/call`, {
          method: 'PUT',
          body: JSON.stringify({ agentRole: role || null, assistantId: assistantId.trim(), brief }),
        });
      }
      setMsg({ ok: true, text: 'Saved' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setSaving(false);
    }
  }

  const stageVars = ov.variables;
  const placeholders = a.whatsapp?.placeholders ?? [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 16, padding: '16px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div>
        <span className={`badge ${CHANNEL_TONE[a.channel]}`}>{CHANNEL_LABEL[a.channel]}</span>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{a.firedCount ? `${a.firedCount} sent so far` : 'Not sent yet'}</div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setMsg(null); }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{enabled ? 'On' : 'Off'}</span>
          </label>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Goes out after</span>
            <input className="input" style={{ width: 90 }} inputMode="numeric" value={delay}
              onChange={(e) => { setDelay(e.target.value.replace(/[^0-9]/g, '')); setMsg(null); }} aria-label="Minutes after the customer stops" />
            <span style={{ fontSize: 13 }}>min</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{delayValid ? `= ${duration(delayNum)} after they stop` : 'Enter minutes'}</span>
          </div>
        </div>

        {a.channel === 'whatsapp' && (
          a.whatsapp ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 13 }}>Sends template <span className="mono">{a.whatsapp.template}</span> ({a.whatsapp.language})</div>
              <Chips label="Variables sent" items={placeholders.length ? placeholders : ['none']} />
              <div className="muted" style={{ fontSize: 12 }}>Template and variables are set on the WhatsApp (Vox) tab.</div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>No WhatsApp template is set for this stage. Add one on the WhatsApp (Vox) tab.</div>
          )
        )}

        {a.channel === 'sms' && (
          <div className="muted" style={{ fontSize: 13 }}>Sends the DLT-registered SMS text. The wording is fixed by the registration, so no variables are added.</div>
        )}

        {a.channel === 'push' && a.push && (
          <div className="muted" style={{ fontSize: 13 }}>Fires the Upshot event <span className="mono">{a.push.upshotEvent}</span>; the copy is written in Upshot.</div>
        )}

        {a.channel === 'voice' && a.call && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                <span className="field-label">Ello agent</span>
                <select className="input" value={role} onChange={(e) => { setRole(e.target.value); setMsg(null); }}>
                  <option value="">Website lead callback (default)</option>
                  {ov.agentRoles.filter((r) => r.direction === 'outbound' && r.role !== 'leadCallback').map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                <span className="field-label">Or a specific agent ID (optional)</span>
                <input className="input mono" value={assistantId} placeholder="Overrides the agent above"
                  onChange={(e) => { setAssistantId(e.target.value); setMsg(null); }} />
              </label>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Calls agent: <span className="mono">{assistantId.trim() || a.call.effectiveAgentId || 'none configured'}</span>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="field-label">What the agent should talk about at this stage</span>
              <textarea ref={briefRef} className="input" rows={4} maxLength={ov.maxBriefLength} value={brief}
                placeholder="e.g. Greet {lead_first_name}. They {stall_reason}. Offer to {stall_help}."
                onChange={(e) => { setBrief(e.target.value); setMsg(null); }} />
              <span className="muted" style={{ fontSize: 12 }}>
                {brief.length}/{ov.maxBriefLength}. Sent to the agent as <span className="mono">stage_brief</span>, with each {'{variable}'} replaced by the customer&apos;s real value.
              </span>
            </label>

            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>Variables sent with this call. Click one to add it to the text above.</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {stageVars.map((v) => (
                  <button key={v.name} type="button" className="btn" title={`${v.description}. Example: ${v.example}`}
                    style={{ padding: '2px 8px', fontSize: 11.5, fontFamily: 'monospace' }} onClick={() => insertVariable(v.name)}>
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <button className="btn btn-primary" disabled={!dirty || saving || !delayValid} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          {dirty && !msg && <span className="muted" style={{ fontSize: 12.5 }}>Unsaved changes</span>}
          {msg && <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--ok, #0d7a6f)' : 'var(--danger, #c0392b)' }}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="field-label">{label}:</span>
      {items.map((it) => <span key={it} className="badge tone-grey" style={{ fontFamily: 'monospace' }}>{it}</span>)}
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
