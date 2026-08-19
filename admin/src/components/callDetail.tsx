'use client';
// Feature component (not a ui.tsx primitive): renders the full detail of one or more
// voice-call attempts. The important editorial decision here is that an *outcome* is
// never shown bare — every outcome is paired with where it came from, because an
// operator acting on an inferred `do_not_call` as if the agent had confirmed it is a
// real problem. `agent` reads as confirmed, `inferred` is flagged amber as a guess,
// `status` is labelled as derived, and a null source is explicitly "source unknown".
import React, { useState } from 'react';
import { StatusBadge, Empty } from '@/components/ui';
import { dateStr, timeAgo, humanStatus } from '@/lib/format';

export interface CallAttemptDetail {
  id: string;
  phone?: string | null;
  campaignId?: string | null;
  status?: string | null;
  outcome?: string | null;
  outcomeSource?: string | null;
  outcomeEvidence?: string | null;
  summary?: string | null;
  incomeRange?: string | null;
  employment?: string | null;
  preferredChannel?: string | null;
  callbackAt?: string | null;
  callContext?: unknown;
  transcript?: unknown;
  recordingUrl?: string | null;
  durationSec?: number | null;
  // older payloads used durationSeconds — accept both rather than showing "—"
  durationSeconds?: number | null;
  answered?: boolean | null;
  attempt?: number | null;
  error?: string | null;
  queuedAt?: string | null;
  // Renamed server-side from dialedAt/completedAt when CallAttempt merged with
  // Conversation (startedAt/endedAt already existed there as the equivalent
  // concept for every other channel) — this is the current API shape.
  startedAt?: string | null;
  endedAt?: string | null;
}

export function secs(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n <= 0) return '0s';
  const m = Math.floor(n / 60);
  return m > 0 ? `${m}m ${n % 60}s` : `${n}s`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function labelFor(key: string) {
  return key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function scalar(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

/* ── outcome + provenance ─────────────────────────────────────────────────── */

const SOURCE_COPY: Record<string, { label: string; tone: 'green' | 'amber' | 'grey'; title: string }> = {
  agent: { label: 'reported by agent', tone: 'green', title: 'The voice agent explicitly reported this outcome.' },
  inferred: { label: 'inferred from transcript', tone: 'amber', title: 'A guess: our own keyword match on the transcript, not an agent report. Verify before acting on it.' },
  status: { label: 'derived from call status', tone: 'grey', title: 'Derived from how the call ended (no answer, failure, …) rather than from anything said.' },
};

export function OutcomeCell({ outcome, source, evidence }: { outcome?: string | null; source?: string | null; evidence?: string | null }) {
  if (!outcome) return <span className="muted">No outcome recorded</span>;
  const meta = source ? SOURCE_COPY[source] : undefined;
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <span className="row wrap" style={{ gap: 6 }}>
        <StatusBadge status={outcome} />
        {source === 'inferred' && <span className="badge tone-amber" title={meta?.title}>unconfirmed</span>}
      </span>
      <span
        style={{ fontSize: 11.5, color: meta ? (meta.tone === 'amber' ? 'var(--amber)' : 'var(--text-dim)') : 'var(--text-faint)' }}
        title={meta?.title ?? 'The server did not record where this outcome came from — treat it as unverified.'}
      >
        {meta ? meta.label : 'source unknown'}
      </span>
      {evidence ? (
        <span className="mono" style={{ fontSize: 11, color: 'var(--amber)', wordBreak: 'break-word' }}>
          matched: “{evidence}”
        </span>
      ) : null}
    </div>
  );
}

/* ── captured details ─────────────────────────────────────────────────────── */

function CapturedDetails({ call }: { call: CallAttemptDetail }) {
  const rows: [string, string][] = [];
  if (call.incomeRange) rows.push(['Income range', call.incomeRange]);
  if (call.employment) rows.push(['Employment', humanStatus(call.employment)]);
  if (call.preferredChannel) rows.push(['Preferred channel', humanStatus(call.preferredChannel)]);
  if (call.callbackAt) rows.push(['Callback requested', `${dateStr(call.callbackAt)} · ${timeAgo(call.callbackAt)}`]);
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)' }}>
        Captured on the call
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '2px 0 8px' }}>Only ever set from an agent report.</p>
      <div style={{ display: 'grid', gap: 0 }}>
        {rows.map(([k, v], i) => (
          <div key={k} className="row between" style={{ gap: 12, padding: '6px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : undefined }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
            <b style={{ fontSize: 12.5, textAlign: 'right' }}>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── "what the agent knew" ────────────────────────────────────────────────── */

function CallContext({ context }: { context: unknown }) {
  const [open, setOpen] = useState(false);
  const entries = isObj(context) ? Object.entries(context) : [];
  const hasContext = entries.length > 0;

  return (
    <div style={{ marginTop: 12 }}>
      <button
        className="btn"
        style={{ padding: '4px 10px', fontSize: 11.5 }}
        disabled={!hasContext}
        onClick={() => setOpen((o) => !o)}
        title={hasContext ? 'The variables the agent was given before dialling' : 'No context was recorded for this call'}
      >
        {open ? '▾' : '▸'} What the agent knew {hasContext ? `(${entries.length})` : '(none recorded)'}
      </button>
      {open && hasContext && (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead><tr><th style={{ width: 220 }}>Variable</th><th>Value</th></tr></thead>
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k} style={{ cursor: 'default' }}>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{k}</td>
                  <td style={{ fontSize: 12.5, wordBreak: 'break-word' }}>{scalar(v) || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── transcript ───────────────────────────────────────────────────────────── */

interface Turn { speaker?: string; text: string }

// The transcript is arbitrary JSON. Normalise the shapes we have actually seen
// (array of {text}/{role,content}/strings, or {turns|messages|segments:[…]}) into
// speaker/text turns, and fall back to pretty-printed JSON only as a last resort.
function normaliseTranscript(t: unknown): { turns: Turn[]; raw?: string } {
  if (t == null || t === '') return { turns: [] };
  if (typeof t === 'string') {
    const trimmed = t.trim();
    // a JSON string double-encoded by the provider
    if (/^[[{]/.test(trimmed)) {
      try { return normaliseTranscript(JSON.parse(trimmed)); } catch { /* plain text */ }
    }
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    return { turns: lines.map((l) => ({ text: l })) };
  }
  let arr: unknown = t;
  if (isObj(t)) {
    const nested = t.turns ?? t.messages ?? t.segments ?? t.transcript ?? t.entries;
    if (Array.isArray(nested)) arr = nested;
    else return { turns: [], raw: JSON.stringify(t, null, 2) };
  }
  if (!Array.isArray(arr)) return { turns: [], raw: JSON.stringify(t, null, 2) };

  const turns: Turn[] = [];
  for (const item of arr) {
    if (item == null) continue;
    if (typeof item === 'string') { turns.push({ text: item }); continue; }
    if (!isObj(item)) { turns.push({ text: String(item) }); continue; }
    const text = scalar(item.text ?? item.message ?? item.content ?? item.utterance ?? item.value);
    const speaker = scalar(item.speaker ?? item.role ?? item.from ?? item.source ?? item.who) || undefined;
    if (!text) continue;
    turns.push({ speaker, text });
  }
  if (turns.length === 0) return { turns: [], raw: JSON.stringify(t, null, 2) };
  return { turns };
}

// Without a speaker label we cannot know who said what — alternate rows visually
// only when the provider actually told us, otherwise keep every turn neutral.
function speakerTone(speaker?: string) {
  if (!speaker) return null;
  const s = speaker.toLowerCase();
  if (/agent|assistant|bot|ai|ello|ella/.test(s)) return 'agent';
  if (/user|customer|human|lead|caller/.test(s)) return 'customer';
  return 'other';
}

export function Transcript({ transcript }: { transcript: unknown }) {
  const { turns, raw } = normaliseTranscript(transcript);
  if (turns.length === 0 && !raw) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)', marginBottom: 6 }}>
        Transcript
      </div>
      {turns.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {turns.map((t, i) => {
            const tone = speakerTone(t.speaker);
            return (
              <div
                key={i}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: tone === 'agent' ? 'var(--teal-bg)' : 'var(--surface-2)',
                  border: '1px solid var(--border)',
                }}
              >
                {t.speaker && (
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)', marginBottom: 3 }}>
                    {humanStatus(t.speaker)}
                  </div>
                )}
                <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.text}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <pre
          className="mono"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 11.5, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >{raw}</pre>
      )}
    </div>
  );
}

/* ── one call ─────────────────────────────────────────────────────────────── */

export function CallAttemptCard({ call }: { call: CallAttemptDetail }) {
  const duration = call.durationSec ?? call.durationSeconds ?? null;
  const when = call.startedAt ?? call.queuedAt ?? call.endedAt ?? null;

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <StatusBadge status={call.status} />
          {call.attempt != null && <span className="badge tone-grey">attempt {call.attempt}</span>}
          {call.answered === false && <span className="badge tone-grey">not answered</span>}
          <span className="muted mono" style={{ fontSize: 12 }}>{call.phone || '—'}</span>
          <span className="muted" style={{ fontSize: 12 }} title={when ?? undefined}>
            {when ? `${dateStr(when)} · ${timeAgo(when)}` : 'not dialled yet'}
          </span>
          <span className="mono" style={{ fontSize: 12 }} title="Call duration">⏱ {secs(duration)}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {call.recordingUrl ? (
            <a className="btn" style={{ padding: '3px 9px', fontSize: 11.5 }} href={call.recordingUrl} target="_blank" rel="noreferrer">Listen ↗</a>
          ) : (
            <span className="muted" style={{ fontSize: 11.5 }}>no recording</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)', marginBottom: 5 }}>Outcome</div>
        <OutcomeCell outcome={call.outcome} source={call.outcomeSource} evidence={call.outcomeEvidence} />
      </div>

      {call.error && (
        <div className="empty" style={{ marginTop: 12, textAlign: 'left', color: 'var(--red)' }}>
          Call error — <span className="mono">{call.error}</span>
        </div>
      )}

      {call.summary ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)', marginBottom: 4 }}>Summary</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{call.summary}</div>
        </div>
      ) : null}

      <CapturedDetails call={call} />
      <Transcript transcript={call.transcript} />
      <CallContext context={call.callContext} />
    </div>
  );
}

/* ── list ─────────────────────────────────────────────────────────────────── */

export function CallList({ calls, emptyLabel = 'No voice calls placed yet' }: { calls: CallAttemptDetail[] | null | undefined; emptyLabel?: string }) {
  const list = Array.isArray(calls) ? calls : [];
  if (list.length === 0) return <Empty label={emptyLabel} />;
  const inferred = list.filter((c) => c.outcomeSource === 'inferred').length;
  return (
    <>
      {inferred > 0 && (
        <div className="empty" style={{ textAlign: 'left', color: 'var(--amber)', marginBottom: 4 }}>
          {inferred} of {list.length} outcome{inferred === 1 ? '' : 's'} {inferred === 1 ? 'was' : 'were'} inferred from the transcript, not reported by the agent. Check the matched phrase before acting on {inferred === 1 ? 'it' : 'them'}.
        </div>
      )}
      <div>
        {list.map((c) => <CallAttemptCard key={c.id} call={c} />)}
      </div>
    </>
  );
}
