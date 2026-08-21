'use client';
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, apiUpload, ApiError } from '@/lib/api';
import { Card, StatusBadge, Empty } from '@/components/ui';
import { num } from '@/lib/format';
import {
  CampaignForm, EMPTY_FORM, Campaign, RETRY_OPTIONS, RetryStrategy, DAY_LABELS,
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

// `status` is a real boolean on the wire (server/src/lib/integrations.ts's
// listElloAgents coerces Ello's raw field with Boolean(a.status)) — it is NOT
// a status string like the rest of the dashboard's `status` fields, despite
// the name. Do not `status || 'fallback'` this: `true || 'fallback'` is
// `true`, not the fallback, which fed a boolean straight into humanStatus()
// and crashed it.
interface Agent { id: string; name?: string; type?: string; status?: boolean; voiceEngine?: string; phoneNumber?: string | null }
interface Segment { key: string; label: string; description: string; count: number }
type ContactMode = 'none' | 'segments' | 'upload';

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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Contacts — gathered here and added in the same submit as the campaign
  // itself, rather than a separate step on a separate page after creating.
  const [contactMode, setContactMode] = useState<ContactMode>('none');
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const { data: segmentsRes, error: segmentsErr } = useSWR(
    contactMode === 'segments' ? '/api/admin/segments' : null,
    swrFetcher,
  );
  const segments: Segment[] = (segmentsRes?.data as { segments?: Segment[] } | undefined)?.segments ?? [];

  const set = <K extends keyof CampaignForm>(k: K, v: CampaignForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFormError(null);
    if (k === 'code') setCodeError(null);
  };

  function toggleSegment(key: string) {
    setSelectedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

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

    // One real-world-effect confirmation, right before it happens — matches
    // the same pattern used elsewhere in the dashboard for placing a real
    // call. Only needed for segments: picking and uploading a spreadsheet is
    // already a deliberate enough action on its own.
    if (contactMode === 'segments' && selectedSegments.size > 0) {
      const chosen = segments.filter((s) => selectedSegments.has(s.key));
      const upperBound = chosen.reduce((a, s) => a + s.count, 0);
      const confirmed = window.confirm(
        `${editing ? 'Save changes and add' : 'Create this campaign with'} contacts from ` +
        `${chosen.map((s) => s.label).join(', ')}?\n\n` +
        `Up to ${upperBound} people (overlap between segments is merged automatically by phone number). ` +
        `Once this campaign is started, everyone added will be called.`,
      );
      if (!confirmed) return;
    }

    setBusy(true); setFormError(null); setCodeError(null);
    try {
      const res = await apiFetch<{ id?: string; campaign?: { id: string } }>(
        editing ? `/api/admin/campaigns/${campaign!.id}` : '/api/admin/campaigns',
        { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      );
      const d = res.data as { id?: string; campaign?: { id: string } } | undefined;
      const id = d?.id || d?.campaign?.id || campaign?.id || '';

      if (id && contactMode === 'segments' && selectedSegments.size > 0) {
        await apiFetch(`/api/admin/campaigns/${id}/contacts/from-segments`, {
          method: 'POST',
          body: JSON.stringify({ segments: Array.from(selectedSegments) }),
        });
      } else if (id && contactMode === 'upload' && uploadFile) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        await apiUpload(`/api/admin/campaigns/${id}/contacts/upload`, fd);
      }

      onSaved(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setCodeError(err.message || 'That code is already in use');
      else setFormError((err as Error).message);
    } finally { setBusy(false); }
  }

  const grid: React.CSSProperties = { gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', alignItems: 'start' };

  return (
    <form onSubmit={submit}>
      <Card title="Campaign" sub="Everything here happens in one step — contacts are added the moment you save.">
        <div className="grid" style={grid}>
          <Field label="Name *" error={show.name}>
            <input className="input" style={{ marginTop: 6, borderColor: show.name ? 'var(--red)' : undefined }}
              value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Diwali personal-loan push" />
          </Field>
        </div>
        {codeError && <p className="err" style={{ marginTop: 10 }}>{codeError}</p>}
      </Card>

      {/* Contacts — chosen here, added automatically on save. No separate
          "now go configure contacts" step on another page. */}
      <Card title="Contacts" sub="Who should this campaign call?">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {([['segments', 'Pick a segment'], ['upload', 'Upload a spreadsheet']] as const).map(([key, label]) => (
            <button key={key} type="button"
              className={`btn ${contactMode === key ? 'btn-primary' : ''}`}
              style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600 }}
              onClick={() => setContactMode(contactMode === key ? 'none' : key)}>
              {label}
            </button>
          ))}
        </div>

        {contactMode === 'segments' && (
          <div style={{ marginTop: 14 }}>
            {segmentsErr ? (
              <div className="empty" style={{ color: 'var(--red)' }}>Could not load segments — {(segmentsErr as Error).message}</div>
            ) : !segmentsRes ? (
              <span className="muted" style={{ fontSize: 12.5 }}>Loading segments…</span>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
                {segments.map((s) => (
                  <label key={s.key}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12,
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', background: selectedSegments.has(s.key) ? 'var(--grey-bg)' : 'transparent',
                    }}
                  >
                    <input type="checkbox" checked={selectedSegments.has(s.key)} onChange={() => toggleSegment(s.key)} style={{ marginTop: 3 }} />
                    <div>
                      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                        <b style={{ fontSize: 13.5 }}>{s.label}</b>
                        <span className="muted" style={{ fontSize: 12 }}>{num(s.count)} people</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{s.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Anyone who ever said don&apos;t call is always excluded.</p>
          </div>
        )}

        {contactMode === 'upload' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setUploadFile(f); }}
            style={{ marginTop: 14, border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: 26, textAlign: 'center' }}
          >
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              {uploadFile ? `Selected: ${uploadFile.name}` : 'Drop a spreadsheet here, or'}
            </div>
            <input type="file" accept=".xlsx,.xls,.csv"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12.5 }} />
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>.xlsx, .xls or .csv — added when you save.</p>
          </div>
        )}

        {contactMode === 'none' && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
            {editing ? 'No new contacts will be added.' : "You can also skip this and add contacts after creating."}
          </p>
        )}
      </Card>

      {/* Agent */}
      <Card title="Agent" sub="The Ello voice assistant that will place these calls.">
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
                  <StatusBadge status={a.status ? 'active' : 'not_started'} />
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
      </Card>

      {/* Advanced — schedule, cadence, concurrency. Hidden by default: every
          field here already has a sane default (see EMPTY_FORM), so most
          campaigns never need to open this. */}
      <Card title="Advanced settings" sub={showAdvanced ? undefined : 'Schedule, retries and call concurrency — sensible defaults are already applied.'}>
        <button type="button" className="btn" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? '▾ Hide advanced settings' : '▸ Show advanced settings'}
        </button>

        {showAdvanced && (
          <div style={{ marginTop: 18 }}>
            <div className="grid" style={grid}>
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

            <div className="nav-section" style={{ padding: 0, margin: '20px 0 8px' }}>Type & calling window</div>
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

            <div className="grid" style={{ ...grid, marginTop: 14 }}>
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

            <div className="nav-section" style={{ padding: 0, margin: '20px 0 8px' }}>Cadence & retries</div>
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
              <Field label="Concurrent calls" hint="1–50 at once." error={show.concurrency}>
                <input className="input mono" type="number" min={1} max={50} style={{ marginTop: 6 }}
                  value={form.concurrency} onChange={(e) => set('concurrency', e.target.value)} />
              </Field>
            </div>

            <label className="row" style={{ gap: 8, marginTop: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.stopOnAnswer} onChange={(e) => set('stopOnAnswer', e.target.checked)} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Stop calling once the customer answers</span>
            </label>
          </div>
        )}

        <div style={{
          marginTop: 18, padding: 14, borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--grey-bg)',
        }}>
          <div className="nav-section" style={{ padding: 0, marginBottom: 6 }}>In plain English</div>
          <div style={{ fontSize: 14, lineHeight: 1.55, fontWeight: 600 }}>{summary}</div>
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
