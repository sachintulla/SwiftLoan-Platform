'use client';
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { Card, StatCard, StatusBadge, TableSkeleton, Empty } from '@/components/ui';
import { timeAgo, num, StatusTone } from '@/lib/format';
import { NUDGES_DISABLED } from '@/lib/flags';
import StageOutreach from '@/components/StageOutreach';

type Channel = 'push' | 'whatsapp' | 'sms' | 'email' | 'voice';

interface StallRule {
  id: string;
  name: string;
  triggerEvent: string;
  expectedEvent: string;
  delayMinutes: number;
  upshotEvent: string;
  channel: Channel;
  cooldownMinutes: number;
  enabled: boolean;
  lastFiredAt: string | null;
  firedCount: number;
  createdAt: string;
}

interface OutboundRequest {
  id: string;
  customerId: string | null;
  channel: string;
  kind: string;
  idempotencyKey: string;
  payload: { eventName?: string; properties?: Record<string, unknown> } | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

const CHANNELS: Channel[] = ['push', 'whatsapp', 'sms', 'email', 'voice'];
const QUEUE_KEY = '/api/admin/stall-rules/queue';

const QUEUE_TONE: Record<string, StatusTone> = {
  pending: 'amber', sent: 'green', failed: 'red', cancelled: 'grey',
};

function durationLabel(mins: number) {
  if (!mins || mins < 0) return '0 minutes';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  if (mins % 60 === 0) {
    const h = mins / 60;
    if (h % 24 === 0 && h >= 24) { const d = h / 24; return `${d} day${d === 1 ? '' : 's'}`; }
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** What each journey event means, in the words an operator would use. The codes stay on the server. */
const EVENT_LABEL: Record<string, string> = {
  lead_captured: 'Left their number on the website',
  website_visit: 'Visited the website',
  website_form_started: 'Started the website form',
  phone_verified: 'Verified their phone on the website',
  app_installed: 'Installed the app',
  app_opened: 'Opened the app',
  language_selected: 'Chose a language',
  otp_requested: 'Asked for an OTP',
  otp_verified: 'Verified the OTP',
  eligibility_started: 'Started the application',
  eligibility_completed: 'Finished the eligibility check',
  offers_not_received: 'Got no offers',
  offer_viewed: 'Viewed their offers',
  offer_selected: 'Chose an offer',
  kyc_started: 'Started KYC',
  kyc_completed: 'Finished KYC',
  application_submitted: 'Submitted the application',
  loan_approved: 'Was approved',
  loan_rejected: 'Was rejected',
  loan_disbursed: 'Received the loan',
  call_completed: 'Finished a call with an agent',
  callback_requested: 'Asked for a callback',
};
const eventLabel = (code: string) => EVENT_LABEL[code] ?? (code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' '));

interface FormState {
  name: string;
  triggerEvent: string;
  expectedEvent: string;
  delayMinutes: string;
  upshotEvent: string;
  channel: Channel;
  cooldownMinutes: string;
  enabled: boolean;
}

const BLANK: FormState = {
  name: '', triggerEvent: '', expectedEvent: '', delayMinutes: '15',
  upshotEvent: '', channel: 'push', cooldownMinutes: '1440', enabled: true,
};

function StallRulesView() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/stall-rules', swrFetcher);
  const queue = useSWR(QUEUE_KEY, swrFetcher);

  // Defensive read: the API nests under `data.rules`, but tolerate a bare array
  // so a shape change degrades to an empty table rather than `rows.map` blowing up.
  const payload = data?.data as StallRule[] | { rules?: StallRule[]; events?: string[] } | undefined;
  const rules: StallRule[] = Array.isArray(payload) ? payload : (payload?.rules ?? []);
  const events: string[] = Array.isArray(payload) ? [] : (Array.isArray(payload?.events) ? payload!.events! : []);

  // The nine journey stages are configured in the event editor above. Only rules outside them are listed below.
  const outreach = useSWR('/api/admin/stage-outreach', swrFetcher);
  const stageKeys = new Set(((outreach.data?.data as { stages?: Array<{ key: string }> } | undefined)?.stages ?? []).map((s) => s.key));
  const otherRules = stageKeys.size ? rules.filter((r) => !stageKeys.has(r.triggerEvent)) : [];

  const [editing, setEditing] = useState<StallRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const [runningAll, setRunningAll] = useState(false);
  const [runAllMsg, setRunAllMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [seeding, setSeeding] = useState(false);
  const [seedErr, setSeedErr] = useState<string | null>(null);

  function errText(e: unknown) {
    return e instanceof ApiError ? e.message : (e as Error).message;
  }

  async function toggleEnabled(r: StallRule) {
    setBusyId(r.id);
    setRowMsg(null);
    try {
      await apiFetch(`/api/admin/stall-rules/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !r.enabled }),
      });
      await mutate();
    } catch (e) {
      setRowMsg({ id: r.id, ok: false, text: errText(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function runOne(r: StallRule) {
    setBusyId(r.id);
    setRowMsg(null);
    try {
      const res = await apiFetch<{ fired?: number }>(`/api/admin/stall-rules/${r.id}/run`, { method: 'POST' });
      const fired = res.data?.fired ?? 0;
      setRowMsg({ id: r.id, ok: true, text: res.message || (fired ? `Queued ${fired} event(s)` : 'Nobody is currently stuck on this rule') });
      await mutate();
      queue.mutate();
    } catch (e) {
      setRowMsg({ id: r.id, ok: false, text: errText(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setRowMsg(null);
    try {
      await apiFetch(`/api/admin/stall-rules/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      if (editing?.id === id) setEditing(null);
      await mutate();
    } catch (e) {
      setRowMsg({ id, ok: false, text: errText(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function runAll() {
    setRunningAll(true);
    setRunAllMsg(null);
    try {
      const res = await apiFetch<{ fired?: number }>('/api/admin/stall-rules/run-all', { method: 'POST' });
      const fired = res.data?.fired ?? 0;
      setRunAllMsg({ ok: true, text: res.message || (fired ? `Queued ${fired} event(s)` : 'Nobody is currently stuck on any rule') });
      await mutate();
      queue.mutate();
    } catch (e) {
      setRunAllMsg({ ok: false, text: errText(e) });
    } finally {
      setRunningAll(false);
    }
  }

  async function seedDefaults() {
    setSeeding(true);
    setSeedErr(null);
    try {
      await apiFetch<{ created?: number }>('/api/admin/stall-rules/seed', { method: 'POST' });
      await mutate();
    } catch (e) {
      setSeedErr(errText(e));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="page">
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Notification Rules</h1>
          <p className="page-sub">
            Decide what a customer receives when they stop at a step. Pick the event below, then set push,
            WhatsApp, SMS, email and call together: when each goes out, what it says, and whether it is on.
            Nothing is sent until you switch a channel on.
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn" disabled={runningAll || rules.length === 0} onClick={runAll} title="Check right now who is stuck and queue their messages">
            {runningAll ? 'Running…' : 'Run all rules now'}
          </button>
        </div>
      </div>

      {runAllMsg && (
        <div className="card card-pad" style={{ marginTop: 16, color: runAllMsg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
          {runAllMsg.text}
        </div>
      )}

      {(creating || editing) && (
        <RuleForm
          key={editing?.id ?? 'new'}
          rule={editing}
          events={events}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); mutate(); }}
        />
      )}

      {/* ---- the event editor: every channel for one event, one Save ---- */}
      <div style={{ marginTop: 16 }}>
        <StageOutreach compact startInAllChannels />
      </div>

      {/* ---- rules outside the journey stages ---- */}
      {/* .card has no margin of its own and .page has no gap — every block spaces itself. */}
      <div style={{ marginTop: 24 }}>
      <Card
        title="Other rules"
        sub="Rules for steps that are not one of the journey stages above. Each fires one Upshot event, and the message itself is written in Upshot."
        right={<button className="btn" onClick={() => { setCreating(true); setEditing(null); }}>+ Custom rule</button>}
      >
        {error ? (
          <div className="empty">
            Could not load rules — {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading ? (
          <TableSkeleton rows={5} cols={8} />
        ) : rules.length === 0 ? (
          <div className="empty">
            <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'left' }}>
              <b>No rules exist yet.</b>
              <p style={{ marginTop: 8 }}>
                The standard rules for every journey stage can be created in one click. After that,
                use the event editor above to switch channels on and set what they say.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" disabled={seeding} onClick={seedDefaults}>
                  {seeding ? 'Creating…' : 'Create the standard rules'}
                </button>
              </div>
              {seedErr && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{seedErr}</div>}
            </div>
          </div>
        ) : otherRules.length === 0 ? (
          <div className="empty" style={{ padding: '24px 20px' }}>
            Every rule is already set up in the event editor above. Use <b>+ Custom rule</b> for a step that is not one of the journey stages.
          </div>
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>On</th><th>Name</th><th>Rule</th><th>Delay</th><th>Upshot event</th>
              <th>Channel</th><th>Fired</th><th>Last fired</th><th></th>
            </tr></thead>
            <tbody>{otherRules.map((r) => (
              <React.Fragment key={r.id}>
                <tr>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      disabled={busyId === r.id}
                      title={r.enabled ? 'Enabled — click to pause' : 'Paused — click to enable'}
                      onChange={() => toggleEnabled(r)}
                    />
                  </td>
                  <td><b>{r.name}</b></td>
                  <td style={{ fontSize: 13 }}>
                    <b>{eventLabel(r.triggerEvent)}</b>
                    <span className="muted">, but has not</span>{' '}
                    <b>{eventLabel(r.expectedEvent).toLowerCase()}</b>
                  </td>
                  <td className="mono">{durationLabel(r.delayMinutes)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.upshotEvent}</td>
                  <td><StatusBadge status="active" label={r.channel} /></td>
                  <td className="mono">{num(r.firedCount)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.lastFiredAt ? timeAgo(r.lastFiredAt) : '—'}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} disabled={busyId === r.id} onClick={() => runOne(r)}>
                        {busyId === r.id ? '…' : 'Run now'}
                      </button>
                      <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => { setEditing(r); setCreating(false); }}>Edit</button>
                      {confirmDelete === r.id ? (
                        <>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5, color: 'var(--red)', borderColor: 'var(--red)' }} disabled={busyId === r.id} onClick={() => remove(r.id)}>Confirm</button>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setConfirmDelete(r.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
                {rowMsg?.id === r.id && (
                  <tr>
                    <td colSpan={9} style={{ fontSize: 12, color: rowMsg.ok ? 'var(--green)' : 'var(--red)' }}>{rowMsg.text}</td>
                  </tr>
                )}
              </React.Fragment>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      </div>

      <QueuePanel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create / edit form                                                  */
/* ------------------------------------------------------------------ */

function RuleForm({ rule, events, onClose, onSaved }: {
  rule: StallRule | null;
  events: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => rule ? {
    name: rule.name,
    triggerEvent: rule.triggerEvent,
    expectedEvent: rule.expectedEvent,
    delayMinutes: String(rule.delayMinutes),
    upshotEvent: rule.upshotEvent,
    channel: rule.channel,
    cooldownMinutes: String(rule.cooldownMinutes),
    enabled: rule.enabled,
  } : BLANK);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Field-level errors, so a 400 (same trigger/expected) or 409 (duplicate pair)
  // lands next to the input it is about instead of in a bare toast.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setFormError(null);
    setFieldErrors((e) => ({ ...e, [k]: undefined }));
  }

  const delay = Number(form.delayMinutes) || 0;
  const cooldown = Number(form.cooldownMinutes) || 0;

  const sameEvent = !!form.triggerEvent && form.triggerEvent === form.expectedEvent;

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!form.name.trim()) m.push('Name');
    if (!form.triggerEvent) m.push('When the customer has');
    if (!form.expectedEvent) m.push('but has not yet');
    if (!form.upshotEvent.trim()) m.push('Upshot event name');
    if (delay <= 0) m.push('How long to wait');
    return m;
  }, [form, delay]);

  const canSave = missing.length === 0 && !sameEvent && !saving;

  async function save() {
    if (sameEvent) {
      setFieldErrors({ expectedEvent: 'Choose a different step from the first one.' });
      return;
    }
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const body = {
        name: form.name.trim(),
        triggerEvent: form.triggerEvent,
        expectedEvent: form.expectedEvent,
        delayMinutes: delay,
        upshotEvent: form.upshotEvent.trim(),
        channel: form.channel,
        cooldownMinutes: cooldown,
        enabled: form.enabled,
      };
      if (rule) {
        await apiFetch(`/api/admin/stall-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/admin/stall-rules', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 409) {
        setFieldErrors({ expectedEvent: msg || 'A rule for this trigger → expected pair already exists.' });
      } else if (status === 400 && /same|equal|differ/i.test(msg)) {
        setFieldErrors({ expectedEvent: msg });
      } else {
        setFormError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  // Fall back to a free-text input when the server did not advertise a vocabulary,
  // so the form is still usable rather than showing two empty selects.
  const hasVocab = events.length > 0;

  function EventPicker({ k, label }: { k: 'triggerEvent' | 'expectedEvent'; label: string }) {
    const err = fieldErrors[k];
    return (
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>{label} <span style={{ color: 'var(--red)' }}>*</span></label>
        {hasVocab ? (
          <select
            className="input"
            style={{ marginTop: 6, borderColor: err ? 'var(--red)' : undefined }}
            value={form[k]}
            onChange={(e) => set(k, e.target.value)}
          >
            <option value="">Choose a step…</option>
            {events.map((ev) => <option key={ev} value={ev}>{eventLabel(ev)}</option>)}
          </select>
        ) : (
          <input
            className="input mono"
            style={{ marginTop: 6, borderColor: err ? 'var(--red)' : undefined }}
            value={form[k]}
            onChange={(e) => set(k, e.target.value)}
            placeholder="event_name"
          />
        )}
        {err && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{err}</div>}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
    <Card
      title={rule ? `Edit rule: ${rule.name}` : 'New custom rule'}
      sub="Fires one Upshot event when a customer stops at a step. The message itself is written in Upshot."
      right={<button className="btn" onClick={onClose}>Close</button>}
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Name <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="input" style={{ marginTop: 6 }} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="OTP requested but not verified" />
        </div>

        <EventPicker k="triggerEvent" label="When the customer has" />
        <EventPicker k="expectedEvent" label="but has not yet" />

        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Wait (minutes) <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="input mono" type="number" min={1} style={{ marginTop: 6 }} value={form.delayMinutes} onChange={(e) => set('delayMinutes', e.target.value)} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>How long after they stop before this is sent.</div>
        </div>

        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Upshot event name <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="input mono" style={{ marginTop: 6 }} value={form.upshotEvent} onChange={(e) => set('upshotEvent', e.target.value)} placeholder="swiftloan_otp_not_verified" />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Must match the event configured on the Upshot dashboard.</div>
        </div>

        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Channel</label>
          <select className="input" style={{ marginTop: 6 }} value={form.channel} onChange={(e) => set('channel', e.target.value as Channel)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Do not repeat for (minutes)</label>
          <input className="input mono" type="number" min={0} style={{ marginTop: 6 }} value={form.cooldownMinutes} onChange={(e) => set('cooldownMinutes', e.target.value)} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>The same customer is not sent this again inside this window.</div>
        </div>
      </div>

      <label className="row" style={{ gap: 8, marginTop: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Enabled</span>
        <span className="muted" style={{ fontSize: 12 }}>· switched off, nothing is sent</span>
      </label>

      {/* live plain-English summary */}
      <div style={{ marginTop: 16, padding: 14, background: 'var(--grey-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, lineHeight: 1.6 }}>
        After a customer <b>{form.triggerEvent ? eventLabel(form.triggerEvent).toLowerCase() : '…'}</b>{' '}
        and has not <b>{form.expectedEvent ? eventLabel(form.expectedEvent).toLowerCase() : '…'}</b>{' '}
        for <b>{durationLabel(delay)}</b>, send the Upshot event{' '}
        <span className="mono">{form.upshotEvent || '…'}</span> ({form.channel}).
        {cooldown > 0 && <> It is not repeated for {durationLabel(cooldown)}.</>}
      </div>

      {sameEvent && (
        <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>
          The two steps must be different.
        </div>
      )}
      {missing.length > 0 && (
        <div className="empty" style={{ marginTop: 12, padding: '10px 0', textAlign: 'left', color: 'var(--amber)', fontSize: 12.5 }}>
          Still needed: {missing.join(', ')}
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" disabled={!canSave} onClick={save}>{saving ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        {formError && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{formError}</span>}
      </div>
    </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Outbound queue                                                      */
/* ------------------------------------------------------------------ */

// Shares the SWR cache key with the parent, so the parent's `queue.mutate()`
// after a manual run refreshes this panel too.
function QueuePanel() {
  const { data, error, isLoading, mutate } = useSWR(QUEUE_KEY, swrFetcher, { refreshInterval: 15000 });

  const payload = data?.data as
    | { recent?: OutboundRequest[]; counts?: Record<string, number> }
    | OutboundRequest[]
    | undefined;

  const recent: OutboundRequest[] = Array.isArray(payload) ? payload : (Array.isArray(payload?.recent) ? payload!.recent! : []);
  const counts: Record<string, number> = (!Array.isArray(payload) && payload?.counts && typeof payload.counts === 'object') ? payload.counts : {};

  const statuses = ['pending', 'sent', 'failed', 'cancelled'];

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 16 }}>
        {isLoading && !data ? (
          statuses.map((s) => <div key={s} className="stat"><div className="skeleton" style={{ height: 46 }} /></div>)
        ) : (
          statuses.map((s) => (
            <StatCard
              key={s}
              label={`Queue — ${s}`}
              value={num(counts[s] ?? 0)}
              tone={QUEUE_TONE[s] ?? 'grey'}
              icon={s === 'sent' ? '✓' : s === 'failed' ? '!' : s === 'pending' ? '◔' : '–'}
            />
          ))
        )}
      </div>

      <div style={{ marginTop: 16 }}>
      <Card
        title="Outbound queue"
        sub="The 20 most recent events handed to Upshot. Refreshes every 15 seconds — this is how you confirm an event actually left SwiftLoan."
        right={<button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => mutate()}>Refresh</button>}
      >
        {error ? (
          <div className="empty">
            Could not load the outbound queue — {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading && !data ? (
          <TableSkeleton rows={6} cols={6} />
        ) : recent.length === 0 ? (
          <Empty label="Nothing sent yet — run a rule to queue your first event" />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Created</th><th>Channel</th><th>Event</th><th>Status</th><th>Attempts</th><th>Error</th>
            </tr></thead>
            <tbody>{recent.slice(0, 20).map((o) => (
              <tr key={o.id}>
                <td className="muted" style={{ fontSize: 12 }}>{timeAgo(o.createdAt)}</td>
                <td>{o.channel}</td>
                <td className="mono" style={{ fontSize: 12 }}>{o.payload?.eventName ?? '—'}</td>
                <td><StatusBadge status={o.status === 'sent' ? 'completed' : o.status} label={o.status} /></td>
                <td className="mono">{num(o.attempts)}</td>
                <td style={{ fontSize: 12, color: o.lastError ? 'var(--red)' : undefined, maxWidth: 320, overflowWrap: 'anywhere' }}>
                  {o.lastError || <span className="muted">—</span>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      </div>
    </>
  );
}

export default function StallRulesPage() {
  if (NUDGES_DISABLED) {
    return (
      <Card title="Notification rules disabled">
        <Empty label="Outbound nudges are turned off for this environment." />
      </Card>
    );
  }
  return <StallRulesView />;
}
