'use client';
// "Reach out now": send the stage-appropriate WhatsApp, SMS or push, or place a call,
// to one customer, on demand. Used on the customer page (variant "panel", under the
// Milestones stepper) and in table rows such as App Downloads (variant "compact").
//
// What is sent is never typed here. It is the per-stage message already set up in
// Stage outreach, and the server enforces every rule (do-not-contact, test list,
// calling hours, repeat window, daily cap). This component only shows what the server
// says and asks the admin to confirm, so a rule can never depend on this file.
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import './sendActions.css';
import { apiFetch, getAdmin, swrFetcher } from '@/lib/api';
import { STAGE_CALL_STEPS, stageLabel as journeyStageLabel } from '@/components/journey';
import {
  CHANNEL_LABEL, DNC_NOTE, FINISHED_NOTE, NEEDS_ADMIN, NEEDS_SUPER_ADMIN, buttonState, canCallRole, canMessageRole,
  confirmCopy, deliveryBadge, failureText, formatPhone, isFinishedStage, kindLabel, manualSendLine, parseSendError,
  repeatNote, sectionLabel, successText, timeAgoText,
  type ButtonState, type OutreachChannel, type OutreachOptions,
} from '@/lib/outreach';

/* ───────────────────────────── icons ───────────────────────────── */

// The same paths Stage outreach draws for each channel (components/StageOutreach.tsx), 24 box, 2px stroke.
const ICON_PATHS: Record<OutreachChannel, string[]> = {
  whatsapp: ['M21 11.5a8.4 8.4 0 0 1-1.1 4.2A8.5 8.5 0 0 1 8.4 19.5L3 21l1.6-5.1A8.5 8.5 0 1 1 21 11.5z'],
  sms: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  call: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'],
  push: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
};
const CHANNEL_COLOUR: Record<OutreachChannel, string> = {
  whatsapp: 'var(--so-whatsapp)', sms: 'var(--so-sms)', call: 'var(--so-voice)', push: 'var(--so-push)',
};

function ChannelIcon({ channel }: { channel: OutreachChannel }) {
  return (
    <svg className="adm-send-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ color: CHANNEL_COLOUR[channel] }}>
      {ICON_PATHS[channel].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/* ───────────────────────────── types ───────────────────────────── */

export interface SendActionsProps {
  customerId: string | null;
  customerName?: string | null;
  /** The customer's current journey stage key (for example kyc_started). */
  stage?: string | null;
  variant?: 'panel' | 'compact';
  /** A reason to disable every button, shown as visible text. */
  disabledReason?: string | null;
  /** App Downloads: the install this follow-up is about. The server refuses a guessed match. */
  installId?: string | null;
  /** Called after something was sent, so the page can refresh itself. */
  onDone?: () => void;
}

const optionsPath = (id: string) => `/api/admin/outreach/customers/${id}/options`;
const PANEL_ORDER: OutreachChannel[] = ['push', 'sms', 'whatsapp', 'call']; // least to most disruptive
const RESULT_MS = 60_000;

interface Pending {
  channel: OutreachChannel;
  options: OutreachOptions;
  /** Resend although this channel was used recently. Set once the admin has seen the warning. */
  confirmRepeat: boolean;
  overrideHours: boolean;
  repeatAt: string | null;
  error: string | null;
}

interface Result { id: number; channel: OutreachChannel; ok: boolean; text: string }

/* ───────────────────────────── confirmation dialog ───────────────────────────── */

function SendDialog({ pending, busy, onConfirm, onCancel }: {
  pending: Pending;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { channel, options } = pending;
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const state = channel === 'call' ? null : options.channels[channel];
  const copy = confirmCopy(channel, { name: options.customer.name, phone: options.customer.phone, stageLabel: options.customer.stageLabel });
  const repeating = channel !== 'call' && pending.confirmRepeat;
  const confirmLabel = repeating ? 'Send again' : copy.confirmLabel;
  const age = timeAgoText(options.customer.stageEnteredAt);

  // Focus starts on Cancel, so pressing Enter by reflex never sends. Focus goes back to the button that opened this.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busyRef.current) { e.stopPropagation(); onCancel(); return; }
      if (e.key !== 'Tab') return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
      if (!nodes || !nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (!dialogRef.current?.contains(active)) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const preview = state?.preview ?? null;
  return (
    <div className="adm-send-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div ref={dialogRef} className="so adm-send-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <h3 id={titleId}>{copy.title}</h3>
        <dl className="adm-send-facts">
          <div><dt>To</dt><dd className="mono">{formatPhone(options.customer.phone)}</dd></div>
          <div>
            <dt>Stage</dt>
            <dd>{options.customer.stageLabel}.{age && age !== 'just now' ? ` They stopped here ${age}.` : ''}</dd>
          </div>
        </dl>

        {preview?.kind === 'sms' && (
          <div className="so-preview adm-send-preview">
            <div className="so-preview-label">SMS text</div>
            {preview.text}
          </div>
        )}
        {preview?.kind === 'whatsapp' && (
          <div className="so-preview adm-send-preview">
            <div className="so-preview-label">WhatsApp template</div>
            <span className="mono">{preview.template}</span>
            {preview.values.length > 0 && (
              <>
                <div className="so-preview-label" style={{ marginTop: 8 }}>Values, in order</div>
                <ol>{preview.values.map((v, i) => <li key={i}>{v}</li>)}</ol>
              </>
            )}
            <span className="adm-send-muted">The wording is held by WhatsApp. This is the template and the values that fill it.</span>
          </div>
        )}
        {preview?.kind === 'push' && (
          <div className="so-preview adm-send-preview">
            <div className="so-preview-label">Push notification</div>
            {preview.summary}
          </div>
        )}

        {repeating && state && (
          <div className="adm-send-banner amber" role="note">
            <span>{repeatNote(channel as 'whatsapp' | 'sms' | 'push', pending.repeatAt ?? state.lastSentAt)} Send it again?</span>
          </div>
        )}
        {pending.overrideHours && (
          <div className="adm-send-banner amber" role="note">
            <span>It is outside calling hours. As a super admin you can send anyway.</span>
          </div>
        )}

        <p id={bodyId} className="adm-send-consequence">{copy.consequence}</p>
        {pending.error && <p className="adm-send-error" role="alert">{pending.error}</p>}

        <div className="adm-send-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={`btn btn-primary${copy.tone === 'red' ? ' btn-red' : ''}`}
            onClick={onConfirm}
            disabled={busy || !!(pending.error && repeating)}
            aria-busy={busy}
          >
            {busy ? 'Sending...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── the flow shared by both variants ───────────────────────────── */

function useSendFlow(props: SendActionsProps, options: OutreachOptions | null, loadOptions: () => Promise<OutreachOptions | null>, afterSend: () => void) {
  const { customerId, installId, onDone } = props;
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<{ channel: OutreachChannel; kind: 'checking' | 'sending' } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const counter = useRef(0);

  const show = useCallback((channel: OutreachChannel, ok: boolean, text: string) => {
    counter.current += 1;
    setResult({ id: counter.current, channel, ok, text });
  }, []);

  // The line clears itself after a minute, so an old result is never mistaken for a new one.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult((r) => (r && r.id === result.id ? null : r)), RESULT_MS);
    return () => clearTimeout(t);
  }, [result]);

  /** Open the confirmation for a channel, fetching the options first when they are not loaded. */
  const request = useCallback(async (channel: OutreachChannel) => {
    if (!customerId) return;
    setResult(null);
    let o = options;
    if (!o) {
      setBusy({ channel, kind: 'checking' });
      try { o = await loadOptions(); } finally { setBusy(null); }
    }
    if (!o) { show(channel, false, `${CHANNEL_LABEL[channel]} not sent. Could not check this customer. Try again.`); return; }

    if (channel === 'call') {
      if (o.doNotContact.blocked) { show(channel, false, 'Call not placed. This customer asked not to be called.'); return; }
      if (!o.customer.phone) { show(channel, false, 'Call not placed. No phone number on file.'); return; }
      setPending({ channel, options: o, confirmRepeat: false, overrideHours: false, repeatAt: null, error: null });
      return;
    }
    const s = o.channels[channel];
    if (!s.available) { show(channel, false, failureText(channel, { status: 0, code: s.code, message: s.reason || 'Not available' })); return; }
    setPending({
      channel, options: o, error: null,
      confirmRepeat: s.recentlySent,
      overrideHours: s.code === 'outside_calling_hours',
      repeatAt: s.lastSentAt,
    });
  }, [customerId, options, loadOptions, show]);

  const cancel = useCallback(() => setPending(null), []);

  const confirm = useCallback(async () => {
    if (!pending || !customerId) return;
    const { channel, options: o } = pending;
    setBusy({ channel, kind: 'sending' });
    setResult(null);
    setPending((p) => (p ? { ...p, error: null } : p));
    try {
      if (channel === 'call') {
        // Same body the Milestones Call button has always sent: the stage becomes the agent's opening line.
        const steps = STAGE_CALL_STEPS[o.customer.currentStage];
        const res = await apiFetch<{ status?: string; error?: string }>('/api/admin/calls/trigger', {
          method: 'POST',
          body: JSON.stringify({ customerId, ...(steps ?? {}) }),
        });
        // A provider failure still returns the call row, with status failed, so a 2xx is not proof of a call.
        if (res.data?.status === 'failed') {
          show(channel, false, `Call failed: ${res.data.error || 'the provider rejected it'}. Nothing was dialled.`);
        } else {
          show(channel, true, successText('call', o.customer.phone, new Date()));
        }
      } else {
        const res = await apiFetch<{ status: 'sent' | 'queued'; sentAt: string | null; installLink?: string }>(
          `/api/admin/outreach/customers/${customerId}/send`,
          {
            method: 'POST',
            body: JSON.stringify({
              channel,
              ...(pending.confirmRepeat ? { confirmRepeat: true } : {}),
              ...(pending.overrideHours ? { overrideHours: true } : {}),
              ...(installId ? { installId } : {}),
            }),
          },
        );
        const at = res.data?.sentAt ? new Date(res.data.sentAt) : new Date();
        show(channel, true, `${successText(channel, o.customer.phone, at, res.data?.status ?? 'sent')}${res.data?.installLink ? ' A tracked app link was added.' : ''}`);
      }
      setPending(null);
      afterSend();
      onDone?.();
    } catch (e) {
      const f = parseSendError(e);
      if (channel !== 'call' && f.code === 'recently_sent' && !pending.confirmRepeat) {
        // The page was stale: it has been sent since. Turn the dialog into the repeat warning instead of failing.
        setPending((p) => (p ? { ...p, confirmRepeat: true, repeatAt: f.lastSentAt ?? p.repeatAt, error: null } : p));
      } else if (channel !== 'call' && f.code === 'recently_sent') {
        // Confirmed already, and the server still says a moment ago: show why, do not loop.
        setPending((p) => (p ? { ...p, error: f.message } : p));
      } else {
        setPending(null);
        show(channel, false, failureText(channel, f));
        afterSend(); // the answer may have changed what is allowed (a cap, a new do-not-contact)
      }
    } finally {
      setBusy(null);
    }
  }, [pending, customerId, installId, show, afterSend, onDone]);

  return { pending, busy, result, request, confirm, cancel, show };
}

/* ───────────────────────────── role ───────────────────────────── */

function useRole(): string | null | undefined {
  // undefined until the browser has answered, so the first paint never flashes a wrong "Needs ..." note.
  const [role, setRole] = useState<string | null | undefined>(undefined);
  useEffect(() => { setRole(getAdmin()?.role ?? null); }, []);
  return role;
}

/* ───────────────────────────── panel ───────────────────────────── */

function Panel(props: SendActionsProps) {
  const { customerId, stage, disabledReason } = props;
  const role = useRole();
  const { data, error, isLoading, mutate } = useSWR(customerId ? optionsPath(customerId) : null, swrFetcher, { revalidateOnFocus: false });
  const options = (data?.data as OutreachOptions | undefined) ?? null;
  const [showAll, setShowAll] = useState(false);

  const loadOptions = useCallback(async () => {
    const res = await mutate();
    return (res?.data as OutreachOptions | undefined) ?? null;
  }, [mutate]);
  const afterSend = useCallback(() => { void mutate(); }, [mutate]);
  const flow = useSendFlow(props, options, loadOptions, afterSend);
  const lastRequested = useRef<OutreachChannel | null>(null);

  const stageKey = options?.customer.currentStage ?? stage ?? null;
  const finished = options ? options.terminal : isFinishedStage(stageKey);
  const hasCallSteps = !!(stageKey && STAGE_CALL_STEPS[stageKey]);
  const label = options?.customer.stageLabel ?? (stageKey ? journeyStageLabel(stageKey) : null);
  const blocked = !!options?.doNotContact.blocked;

  const stateOf = (ch: OutreachChannel): ButtonState => {
    if (role === undefined) return { disabled: true, note: 'Checking', tone: 'muted' };
    return buttonState(ch, {
      role, options, optionsError: !!error && !options, finished, hasCallSteps,
      disabledReason: disabledReason ?? (blocked ? DNC_NOTE : null),
    });
  };

  const recent = options?.recent ?? [];
  const shown = showAll ? recent : recent.slice(0, 5);

  return (
    <div className="so adm-send">
      <div className="so-section">{sectionLabel(label)}</div>
      <p className="adm-send-help">Sends now, outside the automatic schedule. Each send is recorded on this customer&apos;s activity log.</p>

      {error && !options && !isLoading && (
        <div className="adm-send-banner red" role="alert">
          <span>Could not check what can be sent. {(error as Error).message}.{' '}
            <button type="button" className="adm-send-link" onClick={() => { void mutate(); }}>Retry</button>
          </span>
        </div>
      )}
      {finished && <div className="adm-send-banner grey" role="note"><span>{FINISHED_NOTE}</span></div>}
      {!finished && blocked && (
        <div className="adm-send-banner red" role="note">
          <span>{DNC_NOTE}. Messages and calls are switched off for them.</span>
        </div>
      )}
      {!finished && options?.onReminderSchedule && (
        <div className="adm-send-banner blue" role="note">
          <span>This customer is on the automatic app-link reminder schedule. Sending from here does not stop it.</span>
        </div>
      )}

      <div className="adm-send-row" role="group" aria-label="Reach out channels">
        {PANEL_ORDER.map((ch) => {
          const st = stateOf(ch);
          const isBusy = flow.busy?.channel === ch;
          return (
            <div key={ch} className="adm-send-cell">
              <button
                type="button"
                className="btn adm-send-btn"
                disabled={st.disabled || flow.busy?.channel === ch}
                aria-busy={isBusy}
                onClick={() => { lastRequested.current = ch; void flow.request(ch); }}
              >
                <ChannelIcon channel={ch} />
                <span>{isBusy ? (flow.busy?.kind === 'sending' ? 'Sending...' : 'Checking...') : CHANNEL_LABEL[ch]}</span>
              </button>
              {!finished && <span className={`adm-send-note${st.tone === 'warn' ? ' warn' : ''}`}>{st.note}</span>}
            </div>
          );
        })}
      </div>

      {/* Always in the page, so a screen reader announces the text when it appears. */}
      <div className={`so-msg adm-send-result${flow.result ? (flow.result.ok ? ' ok' : ' err') : ''}`} role="status" aria-live="polite">
        {flow.result && (
          <>
            <span>{flow.result.text}</span>
            {!flow.result.ok && !finished && (
              <button type="button" className="adm-send-link" onClick={() => { void flow.request(flow.result!.channel); }}>Try again</button>
            )}
          </>
        )}
      </div>

      <p className="adm-send-help tight">
        To put a tracked app link in a WhatsApp message, add <code>{'{appLink}'}</code> to that stage&apos;s template in Stage outreach.
      </p>

      {options && (recent.length > 0 || options.manualSends.length > 0) && (
        <section className="adm-send-recent" aria-label="Recent messages">
          <h4>Recent messages</h4>
          {recent.length === 0 ? (
            <p className="adm-send-muted" style={{ margin: 0 }}>No WhatsApp or SMS has been sent to this number yet.</p>
          ) : (
            <ul>
              {shown.map((r) => {
                const b = deliveryBadge(r.status);
                const why = kindLabel(r.kind);
                return (
                  <li key={r.id}>
                    <b>{CHANNEL_LABEL[r.channel]}</b>
                    {r.template && <span className="mono adm-send-muted">{r.template}</span>}
                    <span className={`badge tone-${b.tone}`}>{b.label}</span>
                    <span className="adm-send-muted">{[timeAgoText(r.sentAt), why].filter(Boolean).join(', ')}</span>
                    {r.status === 'failed' && r.failureReason && <span className="adm-send-fail">{r.failureReason}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {recent.length > 5 && (
            <button type="button" className="adm-send-link" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `Show all ${recent.length}`}
            </button>
          )}
          {options.manualSends.length > 0 && (
            <div className="adm-send-manual">
              {options.manualSends.slice(0, 5).map((m, i) => <span key={i}>{manualSendLine(m)}</span>)}
            </div>
          )}
        </section>
      )}

      {flow.pending && (
        <SendDialog pending={flow.pending} busy={!!flow.busy && flow.busy.kind === 'sending'} onConfirm={flow.confirm} onCancel={flow.cancel} />
      )}
    </div>
  );
}

/* ───────────────────────────── compact ───────────────────────────── */

function Compact(props: SendActionsProps) {
  const { customerId, stage, disabledReason } = props;
  const role = useRole();
  const [options, setOptions] = useState<OutreachOptions | null>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);

  // The options are fetched when a button is pressed, never on render: a table can hold twenty of these.
  const loadOptions = useCallback(async () => {
    if (!customerId) return null;
    try {
      const res = await apiFetch<OutreachOptions>(optionsPath(customerId));
      setOptions(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, [customerId]);
  const afterSend = useCallback(() => { setOptions(null); }, []);
  const flow = useSendFlow(props, options, loadOptions, afterSend);

  // Close the follow-up menu on an outside click or Escape.
  useEffect(() => {
    function close(e: Event) {
      const m = menuRef.current;
      if (!m || !m.open) return;
      if (e instanceof KeyboardEvent) { if (e.key === 'Escape') m.open = false; return; }
      if (!m.contains(e.target as Node)) m.open = false;
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, []);

  const finished = isFinishedStage(stage);
  const hasCallSteps = !!(stage && STAGE_CALL_STEPS[stage]);
  const channels: OutreachChannel[] = ['whatsapp', 'sms', 'call'];
  const reason = disabledReason ?? (!customerId ? 'Not matched to a customer' : finished ? 'Finished the journey' : null);

  const stateOf = (ch: OutreachChannel): ButtonState => {
    if (role === undefined) return { disabled: true, note: '', tone: 'muted' };
    if (reason) return { disabled: true, note: reason, tone: 'muted' };
    if (ch === 'call') {
      if (!canCallRole(role)) return { disabled: true, note: NEEDS_SUPER_ADMIN, tone: 'muted' };
      if (!hasCallSteps) return { disabled: true, note: 'No call is set up for this stage', tone: 'muted' };
      return { disabled: false, note: '', tone: 'muted' };
    }
    if (!canMessageRole(role)) return { disabled: true, note: NEEDS_ADMIN, tone: 'muted' };
    return { disabled: false, note: '', tone: 'muted' };
  };

  // One visible line under the buttons: why they are off, or what just happened.
  const note = flow.result
    ? { text: flow.result.text, cls: flow.result.ok ? 'ok' : 'err' }
    : reason
      ? { text: reason, cls: '' }
      : role !== undefined && !canMessageRole(role)
        ? { text: NEEDS_ADMIN, cls: '' }
        : role !== undefined && !canCallRole(role)
          ? { text: 'Calling needs a super admin', cls: '' }
          : null;

  const label = (ch: OutreachChannel) => {
    const b = flow.busy?.channel === ch;
    return b ? (flow.busy?.kind === 'sending' ? 'Sending...' : 'Checking...') : CHANNEL_LABEL[ch];
  };

  return (
    <div className="so adm-send adm-send-compact">
      <div className="adm-send-inline" role="group" aria-label="Follow up">
        {channels.map((ch) => {
          const st = stateOf(ch);
          return (
            <button
              key={ch}
              type="button"
              className="btn adm-send-small"
              disabled={st.disabled || flow.busy?.channel === ch}
              aria-busy={flow.busy?.channel === ch}
              onClick={() => { void flow.request(ch); }}
            >
              <ChannelIcon channel={ch} />
              {label(ch)}
            </button>
          );
        })}
      </div>

      <div className="adm-send-menu">
        <details ref={menuRef} className="adm-send-follow">
          <summary className="btn">Follow up</summary>
          <div className="adm-send-follow-list" role="group" aria-label="Follow up">
            {channels.map((ch) => {
              const st = stateOf(ch);
              return (
                <button
                  key={ch}
                  type="button"
                  className="adm-send-follow-item"
                  disabled={st.disabled || flow.busy?.channel === ch}
                  onClick={() => { if (menuRef.current) menuRef.current.open = false; void flow.request(ch); }}
                >
                  <ChannelIcon channel={ch} />
                  {label(ch)}
                </button>
              );
            })}
          </div>
        </details>
      </div>

      <div className={`adm-send-note adm-send-text${note?.cls ? ` ${note.cls}` : ''}`} role="status" aria-live="polite">
        {note?.text ?? ''}
      </div>

      {flow.pending && (
        <SendDialog pending={flow.pending} busy={!!flow.busy && flow.busy.kind === 'sending'} onConfirm={flow.confirm} onCancel={flow.cancel} />
      )}
    </div>
  );
}

/* ───────────────────────────── export ───────────────────────────── */

export default function SendActions(props: SendActionsProps) {
  return props.variant === 'compact' ? <Compact {...props} /> : <Panel {...props} />;
}
