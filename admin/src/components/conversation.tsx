'use client';
// Feature component for the Conversations section (not a ui.tsx primitive).
//
// Two jobs:
//  1. Channel chips — the whole point of the Conversations list is "which surfaces has
//     this person used", so a channel is always a coloured chip, never bare text.
//  2. Outcome provenance — `outcomeConfirmed: true` means the agent reported the
//     outcome; `false` means WE guessed it by keyword-matching the transcript. The two
//     must never look alike: an operator acting on a wrongly inferred `do_not_call`
//     silences a real customer. We normalise (outcomeSource, outcomeConfirmed) into the
//     provenance vocabulary callDetail.tsx already renders, and reuse OutcomeCell.
import React from 'react';
import { OutcomeCell, Transcript, secs } from '@/components/callDetail';
import { StatusTone } from '@/lib/format';

export interface Conversation {
  id: string;
  channel?: string | null;
  channelLabel?: string | null;
  agentRole?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSec?: number | null;
  summary?: string | null;
  transcript?: unknown;
  outcome?: string | null;
  outcomeConfirmed?: boolean | null;
  outcomeSource?: string | null;
  details?: unknown;
  recordingUrl?: string | null;
  providerConversationId?: string | null;
}

// Defensive: bare array today, possibly { items: [...] } later.
export function asConversations(x: unknown): Conversation[] {
  if (Array.isArray(x)) return x as Conversation[];
  const items = (x as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as Conversation[]) : [];
}

export const CHANNEL_META: Record<string, { label: string; tone: StatusTone; icon: string }> = {
  phone_outbound: { label: 'Phone (outbound)', tone: 'blue', icon: '↗' },
  phone_inbound: { label: 'Phone (inbound)', tone: 'teal', icon: '↘' },
  website_widget: { label: 'Website', tone: 'green', icon: '◍' },
  mobile_app: { label: 'App', tone: 'amber', icon: '▤' },
  admin: { label: 'Admin', tone: 'grey', icon: '⚙' },
};

export const CHANNEL_FILTERS = [
  { key: '', label: 'All channels' },
  { key: 'phone_outbound', label: 'Phone (outbound)' },
  { key: 'phone_inbound', label: 'Phone (inbound)' },
  { key: 'website_widget', label: 'Website' },
  { key: 'mobile_app', label: 'App' },
  { key: 'admin', label: 'Admin' },
];

export function channelLabel(channel?: string | null, fallback?: string | null) {
  if (!channel) return fallback || 'unknown channel';
  return CHANNEL_META[channel]?.label ?? fallback ?? channel.replace(/_/g, ' ');
}

export function ChannelChip({ channel, label, title }: { channel?: string | null; label?: string | null; title?: string }) {
  const meta = channel ? CHANNEL_META[channel] : undefined;
  return (
    <span className={`badge tone-${meta?.tone ?? 'grey'}`} title={title ?? label ?? undefined}>
      {meta ? `${meta.icon} ` : ''}{meta?.label ?? label ?? 'unknown'}
    </span>
  );
}

// The list row's headline signal: every surface this number has ever used.
export function ChannelChips({ channels, labels }: { channels?: unknown; labels?: unknown }) {
  const list = Array.isArray(channels) ? (channels as string[]) : [];
  const labelList = Array.isArray(labels) ? (labels as string[]) : [];
  if (list.length === 0) return <span className="muted">—</span>;
  return (
    <span className="row wrap" style={{ gap: 5 }}>
      {list.map((c, i) => <ChannelChip key={`${c}-${i}`} channel={c} title={labelList[i]} />)}
    </span>
  );
}

// "12 minutes ago" — spelled out, unlike lib/format's compact "12m ago", because a
// mis-read timestamp on this page changes who you call next.
export function relTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 0) return 'just now';
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  if (s < 45) return 'just now';
  if (s < 3600) return plural(Math.max(1, Math.floor(s / 60)), 'minute');
  if (s < 86400) return plural(Math.floor(s / 3600), 'hour');
  if (s < 2592000) return plural(Math.floor(s / 86400), 'day');
  if (s < 31536000) return plural(Math.floor(s / 2592000), 'month');
  return plural(Math.floor(s / 31536000), 'year');
}

export function dateTimeStr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Collapse the two provenance fields into callDetail's source vocabulary.
// `outcomeConfirmed` wins: it is the field the agent actually sets.
export function provenanceSource(outcomeSource?: string | null, outcomeConfirmed?: boolean | null): string | null {
  if (outcomeConfirmed === true) return outcomeSource === 'status' ? 'status' : 'agent';
  if (outcomeConfirmed === false) return 'inferred';
  return outcomeSource ?? null;
}

// Outcome + where it came from. Confirmed reads neutral/green; unconfirmed is amber and
// says so in words, so it can never be mistaken for fact.
export function ConversationOutcome({ outcome, outcomeConfirmed, outcomeSource }: {
  outcome?: string | null; outcomeConfirmed?: boolean | null; outcomeSource?: string | null;
}) {
  if (!outcome) return <span className="muted" style={{ fontSize: 12 }}>No outcome recorded</span>;
  const source = provenanceSource(outcomeSource, outcomeConfirmed);
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <OutcomeCell outcome={outcome} source={source} />
      {source === 'inferred' && (
        <span className="badge tone-amber" style={{ justifySelf: 'start' }} title="Keyword-matched from the transcript by us. Verify with the customer before acting on it.">
          inferred, not confirmed
        </span>
      )}
    </div>
  );
}

/* ── one conversation, in full ─────────────────────────────────────────────── */

// `details` is arbitrary JSON captured during the conversation — render it as a
// definition list, skipping empties.
function detailEntries(details: unknown): [string, string][] {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return [];
  return Object.entries(details as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => {
      const label = k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
      let val: string;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') val = String(v);
      else { try { val = JSON.stringify(v); } catch { val = String(v); } }
      return [label, val] as [string, string];
    });
}

const CAP = { fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)' } as React.CSSProperties;

/** The provider sometimes sends a summary field that is just an empty JSON
 * object — the call never produced real content, not a summary worth showing. */
export function hasRealSummary(summary?: string | null): summary is string {
  if (!summary) return false;
  const s = summary.trim();
  return s !== '' && s !== '{}' && s !== '[]';
}

export function ConversationCard({ c }: { c: Conversation }) {
  const rows = detailEntries(c.details);
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <ChannelChip channel={c.channel} label={c.channelLabel} />
          {c.agentRole && <span className="badge tone-grey" title="Which agent persona handled this">{c.agentRole}</span>}
          <span className="muted" style={{ fontSize: 12 }} title={c.startedAt ?? undefined}>
            {dateTimeStr(c.startedAt)} · {relTime(c.startedAt)}
          </span>
          <span className="mono" style={{ fontSize: 12 }} title="Duration">⏱ {secs(c.durationSec)}</span>
        </div>
        {c.recordingUrl ? (
          <a className="btn" style={{ padding: '3px 9px', fontSize: 11.5 }} href={c.recordingUrl} target="_blank" rel="noreferrer">Listen ↗</a>
        ) : (
          <span className="muted" style={{ fontSize: 11.5 }}>no recording</span>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ ...CAP, marginBottom: 5 }}>Outcome</div>
        <ConversationOutcome outcome={c.outcome} outcomeConfirmed={c.outcomeConfirmed} outcomeSource={c.outcomeSource} />
      </div>

      {hasRealSummary(c.summary) ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...CAP, marginBottom: 4 }}>Summary</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.summary}</div>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>No summary — the call never produced real content.</p>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={CAP}>Captured in this conversation</div>
          <div style={{ marginTop: 4 }}>
            {rows.map(([k, v]) => (
              <div key={k} className="row between" style={{ gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
                <b style={{ fontSize: 12.5, textAlign: 'right' }}>{v}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <Transcript transcript={c.transcript} />
      {c.transcript == null && <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>No transcript stored for this conversation.</p>}
      {c.providerConversationId && (
        <p className="mono muted" style={{ fontSize: 11, marginTop: 8 }}>provider id: {c.providerConversationId}</p>
      )}
    </div>
  );
}

// How many of these outcomes we merely guessed — the banner an operator must see.
export function inferredCount(list: Conversation[]): number {
  return list.filter((c) => c.outcome && provenanceSource(c.outcomeSource, c.outcomeConfirmed) === 'inferred').length;
}
