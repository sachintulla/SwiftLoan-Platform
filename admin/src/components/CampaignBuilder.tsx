'use client';
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { Card, StatusBadge, Empty } from '@/components/ui';
import {
  CampaignForm, EMPTY_FORM, Campaign, RETRY_OPTIONS, RetryStrategy, CAMPAIGN_TIMEZONE, DAY_LABELS,
  campaignToForm, formToPayload, validate, summarise, timeToMinutes, tzAbbrev,
} from '@/lib/campaign';

const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600 };

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && !error && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{hint}</div>}
      {error && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

interface Agent { id: string; name?: string; type?: string; status?: string; voiceEngine?: string; phoneNumber?: string | null }

export default function CampaignBuilder({ campaign, onSaved, onCancel }: {
  campaign?: Campaign;
  onSaved: (id: string) => void;
  onCancel?: () => void;
}) {
  const editing = !!campaign?.id;
  const [form, setForm] = useState<CampaignForm>(() => (campaign ? campaignToForm(campaign) : EMPTY_FORM));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [manualAgent, setManualAgent] = useState(false);

  const set = <K extends keyof CampaignForm>(k: K, v: CampaignForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFormError(null);
    if (k === 'code') setCodeError(null);
  };

  const errs = useMemo(() => validate(form), [form]);

  // Validation messages are withheld until the operator actually tries to save.
  // Showing "Give the campaign a name" on a form nobody has touched yet reads as
  // if something is already broken.
  const [attempted, setAttempted] = useState(false);
  const show: Record<string, string | undefined> = attempted ? errs : {};
  const payload = useMemo(() => formToPayload(form), [form]);

  // Agent list — this endpoint legitimately fails when the Ello integration is
  // off or misconfigured, so we surface the error and fall back to manual entry
  // instead of blocking campaign creation.
  const { data: agentRes, error: agentErr, isLoading: agentsLoading, mutate: refetchAgents } =
    useSWR('/api/admin/agents', swrFetcher);
  const agentPayload = agentRes?.data as Agent[] | { agents?: Agent[]; error?: string } | undefined;
  const agents: Agent[] = Array.isArray(agentPayload) ? agentPayload : (agentPayload?.agents ?? []);
  const agentErrorText = (!Array.isArray(agentPayload) ? agentPayload?.error : null)
    || (agentErr ? (agentErr as Error).message : null);
  const useManual = manualAgent || (!agentsLoading && agents.length === 0);

  const summary = summarise({
    scheduleType: form.scheduleType,
    dailyStartMinute: payload.dailyStartMinute as number,
    dailyEndMinute: payload.dailyEndMinute as number,
    daysOfWeek: form.daysOfWeek,
    timezone: form.timezone,
    retryStrategy: form.retryStrategy,
    maxAttemptsPerContact: Number(form.maxAttemptsPerContact),
    attemptsPerDay: Number(form.attemptsPerDay),
    retryIntervalDays: Number(form.retryIntervalDays),
    retryIntervalMinutes: Number(form.retryIntervalMinutes),
    stopOnAnswer: form.stopOnAnswer,
    startAtIso: payload.startAt as string | null,
    endAtIso: payload.endAt as string | null,
  });

  const startMin = timeToMinutes(form.dailyStart);
  const endMin = timeToMinutes(form.dailyEnd);
  const wraps = startMin != null && endMin != null && endMin < startMin;
  const tz = tzAbbrev(form.timezone);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true); // from here on, surface any validation messages
    if (Object.keys(errs).length > 0) { setFormError('Fix the highlighted fields first.'); return; }
    setBusy(true); setFormError(null); setCodeError(null);
    try {
      const res = await apiFetch<{ id?: string; campaign?: { id: string } }>(
        editing ? `/api/admin/campaigns/${campaign!.id}` : '/api/admin/campaigns',
        { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      );
      const d = res.data as { id?: string; campaign?: { id: string } } | undefined;
      onSaved(d?.id || d?.campaign?.id || campaign?.id || '');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setCodeError(err.message || 'That code is already in use');
      else setFormError((err as Error).message);
    } finally { setBusy(false); }
  }

  const showCadence = true; // retries apply to both types; recurring gets the full set
  const grid: React.CSSProperties = { gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', alignItems: 'start' };

  return (
    <form onSubmit={submit}>
      {/* a. Basics + schedule window — merged: four short fields did not warrant
          two separate cards, and the page read as longer than the work it asks for. */}
      <Card title="1 · Campaign" sub={`Name it and set the overall run. All times are ${tz}.`}>
        <div className="grid" style={grid}>
          <Field label="Name *" error={show.name}>
            <input className="input" style={{ marginTop: 6, borderColor: show.name ? 'var(--red)' : undefined }}
              value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Diwali personal-loan push" />
          </Field>
          <Field label={`Starts (${tz})`}>
            <input className="input" type="datetime-local" style={{ marginTop: 6 }}
              value={form.startAt} onChange={(e) => set('startAt', e.target.value)} />
          </Field>
          <Field label={`Ends (${tz})`} error={show.endAt}>
            <input className="input" type="datetime-local"
              style={{ marginTop: 6, borderColor: show.endAt ? 'var(--red)' : undefined }}
              value={form.endAt} onChange={(e) => set('endAt', e.target.value)} />
          </Field>
        </div>
        {codeError && <p className="err" style={{ marginTop: 10 }}>{codeError}</p>}
      </Card>

      {/* c. Campaign type */}
      <Card title="2 · Type & calling window" sub="One-time campaigns dial once through the list; recurring campaigns keep working the list on a cadence.">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {([['one_time', 'One-time', 'Dial within the window, then drop off.'],
             ['recurring', 'Recurring', 'Keep dialling on a repeating cadence.']] as const).map(([key, label, hint]) => (
            <button key={key} type="button"
              className={`btn ${form.scheduleType === key ? 'btn-primary' : ''}`}
              style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600 }}
              title={hint}
              onClick={() => set('scheduleType', key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          {form.scheduleType === 'recurring'
            ? 'Keep dialling on a repeating cadence.'
            : 'Dial within the window, then drop off.'}
        </div>

        <div className="nav-section" style={{ padding: 0, margin: '20px 0 8px' }}>Daily calling window</div>
        <div className="grid" style={grid}>
          <Field label={`From (${tz})`} error={show.dailyStart}>
            <input className="input" type="time" style={{ marginTop: 6 }}
              value={form.dailyStart} onChange={(e) => set('dailyStart', e.target.value)} />
          </Field>
          <Field label={`To (${tz})`} error={show.dailyEnd}>
            <input className="input" type="time" style={{ marginTop: 6 }}
              value={form.dailyEnd} onChange={(e) => set('dailyEnd', e.target.value)} />
          </Field>
        </div>
        {wraps && (
          <div className="empty" style={{ textAlign: 'left', color: 'var(--amber)', marginTop: 10 }}>
            This window wraps past midnight — calls run {form.dailyStart} → {form.dailyEnd} the next day ({tz}).
          </div>
        )}

        <div className="nav-section" style={{ padding: 0, margin: '20px 0 8px' }}>Days of week</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {DAY_LABELS.map((d, i) => {
            const on = form.daysOfWeek.includes(i);
            return (
              <button key={d} type="button" className={`btn ${on ? 'btn-primary' : ''}`}
                style={{ minWidth: 54 }}
                onClick={() => set('daysOfWeek', on ? form.daysOfWeek.filter((x) => x !== i) : [...form.daysOfWeek, i])}>
                {d}
              </button>
            );
          })}
          {form.daysOfWeek.length > 0 && (
            <button type="button" className="btn" onClick={() => set('daysOfWeek', [])}>Clear</button>
          )}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          {form.daysOfWeek.length === 0 ? 'No days selected = dial every day.' : 'Only the selected days are dialled.'}
        </div>
      </Card>

      {/* d. Cadence / retries */}
      {showCadence && (
        <Card title="3 · Cadence & retries" sub="How persistently each customer is called.">
          {/* Compact chips rather than full-width cards: four stretched blocks
              dominated the section. The description moves to a single line under
              the selected option, so the explanation is still there without
              every choice shouting it. */}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {RETRY_OPTIONS.map((o) => (
              <button key={o.key} type="button"
                className={`btn ${form.retryStrategy === o.key ? 'btn-primary' : ''}`}
                style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600 }}
                title={o.hint}
                onClick={() => set('retryStrategy', o.key as RetryStrategy)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            {RETRY_OPTIONS.find((o) => o.key === form.retryStrategy)?.hint}
          </div>

          <div className="grid" style={{ ...grid, marginTop: 18 }}>
            {(form.retryStrategy === 'n_per_day' || form.retryStrategy === 'until_answered') && (
              <Field label="Attempts per day" error={show.attemptsPerDay}>
                <input className="input mono" type="number" min={1} style={{ marginTop: 6 }}
                  value={form.attemptsPerDay} onChange={(e) => set('attemptsPerDay', e.target.value)} />
              </Field>
            )}
            {form.retryStrategy === 'every_n_days' && (
              <Field label="Retry every (days)" error={show.retryIntervalDays}>
                <input className="input mono" type="number" min={1} style={{ marginTop: 6 }}
                  value={form.retryIntervalDays} onChange={(e) => set('retryIntervalDays', e.target.value)} />
              </Field>
            )}
            <Field label="Max attempts per contact" error={show.maxAttemptsPerContact}>
              <input className="input mono" type="number" min={1} style={{ marginTop: 6 }}
                value={form.maxAttemptsPerContact} onChange={(e) => set('maxAttemptsPerContact', e.target.value)} />
            </Field>
            <Field label="Minimum gap between attempts (minutes)">
              <input className="input mono" type="number" min={0} style={{ marginTop: 6 }}
                value={form.retryIntervalMinutes} onChange={(e) => set('retryIntervalMinutes', e.target.value)} />
            </Field>
          </div>

          <label className="row" style={{ gap: 8, marginTop: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.stopOnAnswer} onChange={(e) => set('stopOnAnswer', e.target.checked)} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Stop calling once the customer answers</span>
          </label>

          <div style={{
            marginTop: 18, padding: 14, borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--grey-bg)',
          }}>
            <div className="nav-section" style={{ padding: 0, marginBottom: 6 }}>In plain English</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, fontWeight: 600 }}>{summary}</div>
          </div>
        </Card>
      )}

      {/* e. Agent */}
      <Card title="4 · Agent" sub="The Ello voice assistant that will place these calls.">
        {agentErrorText && (
          <div className="empty" style={{ textAlign: 'left', color: 'var(--amber)', marginBottom: 12 }}>
            Could not load the agent list — {agentErrorText}
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => refetchAgents()}>Retry</button>
              <button type="button" className="btn" onClick={() => setManualAgent(true)}>Enter an agent id manually</button>
            </div>
          </div>
        )}
        {agentsLoading && !agentErrorText ? (
          <Empty label="Loading agents…" />
        ) : useManual ? (
          <div className="grid" style={grid}>
            <Field label="Assistant ID" hint="Paste the agent id from the Ello dashboard.">
              <input className="input mono" style={{ marginTop: 6 }} value={form.assistantId}
                onChange={(e) => set('assistantId', e.target.value)} placeholder="asst_…" />
            </Field>
            <Field label="Assistant name" hint="Shown on the campaign for humans.">
              <input className="input" style={{ marginTop: 6 }} value={form.assistantName}
                onChange={(e) => set('assistantName', e.target.value)} placeholder="Ello — Collections" />
            </Field>
            {agents.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <button type="button" className="btn" onClick={() => setManualAgent(false)}>Pick from the list instead</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Field label="Assistant">
              <select className="input" style={{ marginTop: 6 }} value={form.assistantId}
                onChange={(e) => {
                  const a = agents.find((x) => x.id === e.target.value);
                  setForm((f) => ({ ...f, assistantId: e.target.value, assistantName: a?.name || '' }));
                }}>
                <option value="">— none —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.id}{a.type ? ` · ${a.type}` : ''}{a.phoneNumber ? ` · ${a.phoneNumber}` : ' · no phone number'}
                  </option>
                ))}
              </select>
            </Field>
            {form.assistantId && (() => {
              const a = agents.find((x) => x.id === form.assistantId);
              if (!a) return null;
              return (
                <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
                  <StatusBadge status={a.status || 'not_started'} />
                  {a.voiceEngine && <span className="muted">voice · {a.voiceEngine}</span>}
                  <StatusBadge status={a.phoneNumber ? 'completed' : 'pending'} label={a.phoneNumber ? `☎ ${a.phoneNumber}` : 'No phone number attached'} />
                </div>
              );
            })()}
            <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => setManualAgent(true)}>
              Enter an agent id manually
            </button>
          </>
        )}

        {/* Concurrency lives here rather than in its own card — a single number
            did not justify a whole section, and it belongs with the agent that
            will be placing those simultaneous calls. */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', maxWidth: 260 }}>
          <Field label="Concurrent calls" hint="How many calls may be in flight at once (1–50)." error={show.concurrency}>
            <input className="input mono" type="number" min={1} max={50} style={{ marginTop: 6 }}
              value={form.concurrency} onChange={(e) => set('concurrency', e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="row" style={{ gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create campaign'}
        </button>
        {onCancel && <button className="btn" type="button" onClick={onCancel}>Cancel</button>}
        {formError && <span style={{ color: 'var(--red)', fontSize: 12.5 }}>{formError}</span>}
      </div>
    </form>
  );
}
