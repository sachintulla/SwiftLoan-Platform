'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { num, pct, humanStatus, loanStatusLabel, timeAgo, timeStr, dayLabel } from '@/lib/format';

export interface FunnelStage { key: string; label: string; value: number; conversion: number; dropOff: number; fromTopPct: number }

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.value || 1;
  return (
    <div>
      {stages.map((s, i) => (
        <div className="funnel-row" key={s.key}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</div>
          <div className="funnel-bar-track">
            <div className="funnel-bar" style={{ width: `${Math.max(4, (s.value / top) * 100)}%` }}>{num(s.value)}</div>
          </div>
          <div className="funnel-meta">
            {i === 0 ? <span>{pct(100)}</span> : (
              <>
                <span>{pct(s.conversion)} conv</span>
                {s.dropOff > 0 && <span className="funnel-drop"> · {pct(s.dropOff)} drop</span>}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const PIPE_COLORS: Record<string, string> = {
  draft: '#f79009', pan_pending: '#f7a53b', prequalifying: '#2e90fa', offers_ready: '#2e90fa',
  handoff: '#f79009', under_review: '#2e90fa', approved: '#12b76a', rejected: '#f04438',
  disbursed: '#0a7d4b', closed: '#667085',
  // Campaign contact states (ContactState) — this bar is reused on the
  // campaign detail page for these too. Without entries here every one of
  // them fell through to the '#98a2b3' fallback below, so a campaign's bar
  // was always flat grey no matter its actual mix of called/pending/failed.
  pending: 'var(--amber)', queued: 'var(--amber)', called: 'var(--blue)',
  failed: 'var(--red)', skipped: 'var(--grey)',
};

export function PipelineBar({ byStatus }: { byStatus: Record<string, number> }) {
  const entries = Object.entries(byStatus).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div>
      <div className="pipeline">
        {entries.map(([k, v]) => (
          <div key={k} className="pipeline-seg" style={{ width: `${(v / total) * 100}%`, background: PIPE_COLORS[k] || '#98a2b3' }} title={`${loanStatusLabel(k)}: ${v}`}>
            {v / total > 0.06 ? v : ''}
          </div>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 14, marginTop: 12 }}>
        {entries.map(([k, v]) => (
          <span key={k} className="row" style={{ gap: 6, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: PIPE_COLORS[k] || '#98a2b3' }} />
            <span className="muted">{loanStatusLabel(k)}</span><b>{v}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** One flat-track bar per row — label, proportional bar, count — for a small
 * fixed set of categories where a full chart would be overkill (e.g. a
 * campaign's call outcomes). */
export function HorizontalBarList({ rows }: { rows: { key: string; label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((r) => (
        <div key={r.key} className="row" style={{ gap: 12 }}>
          <div style={{ width: 92, flexShrink: 0, fontSize: 12.5, color: 'var(--text-dim)' }}>{r.label}</div>
          <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 999, height: 10, overflow: 'hidden' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: r.color, borderRadius: 999, transition: 'width .4s ease' }} />
          </div>
          <div style={{ width: 24, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Thin rounded multi-segment bar — the at-a-glance "how far along is this
 * campaign" indicator on the campaign detail page. Segments left empty
 * (value 0) are simply omitted rather than rendered as a zero-width sliver. */
export function SegmentedProgressBar({ segments }: { segments: { key: string; value: number; color: string }[] }) {
  const total = Math.max(1, segments.reduce((s, seg) => s + seg.value, 0));
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)' }}>
      {segments.filter((s) => s.value > 0).map((s) => (
        <div key={s.key} style={{ width: `${(s.value / total) * 100}%`, background: s.color, transition: 'width .4s ease' }} />
      ))}
    </div>
  );
}

export interface FeedEvent {
  id: string; eventType: string; eventName: string; screen?: string | null;
  userId?: string | null; ts: string;
  user?: { id: string; fullName?: string | null; phone?: string | null } | null;
  customerId?: string | null;
  metadata?: Record<string, unknown> | null;
}

const EVENT_TONE: Record<string, string> = { navigation: 'var(--blue)', action: 'var(--brand)', funnel: 'var(--teal)', system: 'var(--grey)', error: 'var(--red)' };

/**
 * Recent activity — newest first, grouped under day headers (Today / Yesterday
 * / date), each row time-stamped and click-to-expand for the full detail
 * (who, screen, exact time, metadata + a link through to the person). The raw
 * per-event firehose was hard to scan; this keeps the glance-value while making
 * any single event drillable.
 */
export function LiveFeed({ events }: { events: FeedEvent[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!events.length) return <div className="empty">No recent activity</div>;

  // Events arrive newest-first; keep that order and bucket into day groups.
  const groups: { day: string; items: FeedEvent[] }[] = [];
  for (const e of events) {
    const day = dayLabel(e.ts);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {groups.map((g) => (
        <div key={g.day}>
          <div style={{ position: 'sticky', top: 0, background: 'var(--card, #fff)', padding: '6px 4px 4px', fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            {g.day}
          </div>
          {g.items.map((e) => {
            const who = e.user?.fullName || e.user?.phone || null;
            const isOpen = open === e.id;
            const meta = e.metadata && Object.keys(e.metadata).length ? e.metadata : null;
            return (
              <div key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : e.id)}
                  className="row"
                  style={{ width: '100%', gap: 10, padding: '8px 4px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: EVENT_TONE[e.eventType] || 'var(--grey)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{humanStatus(e.eventName)}</span>
                  {who && <span className="muted" style={{ fontSize: 12 }}>· {who}</span>}
                  {e.screen && <span className="muted" style={{ fontSize: 12 }}>· {e.screen}</span>}
                  <span className="spacer" />
                  <span className="muted" style={{ fontSize: 11.5 }} title={timeAgo(e.ts)}>{timeStr(e.ts)}</span>
                  <span className="muted" style={{ fontSize: 11, width: 12, textAlign: 'center' }}>{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '4px 4px 12px 26px', display: 'grid', gap: 5, fontSize: 12 }}>
                    <div className="row" style={{ gap: 8 }}><span className="muted" style={{ minWidth: 64 }}>When</span><span>{dayLabel(e.ts)}, {timeStr(e.ts)}</span></div>
                    <div className="row" style={{ gap: 8 }}><span className="muted" style={{ minWidth: 64 }}>Type</span><span className="badge tone-grey">{e.eventType}</span></div>
                    {e.screen && <div className="row" style={{ gap: 8 }}><span className="muted" style={{ minWidth: 64 }}>Screen</span><span className="mono">{e.screen}</span></div>}
                    {who && (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="muted" style={{ minWidth: 64 }}>Person</span>
                        {e.customerId
                          ? <Link href={`/customers/${e.customerId}`} style={{ color: 'var(--brand)', fontWeight: 600 }}>{who} →</Link>
                          : e.userId ? <Link href={`/users/${e.userId}`} style={{ color: 'var(--brand)', fontWeight: 600 }}>{who} →</Link>
                          : <span>{who}</span>}
                      </div>
                    )}
                    {meta && (
                      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                        <span className="muted" style={{ minWidth: 64 }}>Details</span>
                        <pre className="mono" style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)' }}>{JSON.stringify(meta, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Recently active users ───────────────────────────────────────────────────
export interface ActiveUser {
  userId: string | null;
  customerId: string | null;
  name: string | null;
  phone: string | null;
  stage: string | null;
  os: string | null;
  device: string | null;
  appVersion: string | null;
  lastActiveAt: string;
  online: boolean;
  pagesVisited: number;
}

/** Newest-first list of who's been using the app, with phone + OS at a glance. */
export function ActiveUsers({ users }: { users: ActiveUser[] }) {
  if (!users.length) return <div className="empty">No recent sessions</div>;
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {users.map((u, i) => {
        const who = u.name || u.phone || 'Guest';
        const href = u.customerId ? `/customers/${u.customerId}` : u.userId ? `/users/${u.userId}` : null;
        const inner = (
          <div className="row" style={{ gap: 10, padding: '9px 4px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <span title={u.online ? 'Active now' : 'Recently active'} style={{ width: 8, height: 8, borderRadius: '50%', background: u.online ? 'var(--green)' : 'var(--grey)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {u.phone || '—'}{u.os ? ` · ${u.os}` : ''}{u.device ? ` · ${u.device}` : ''}{u.appVersion ? ` · v${u.appVersion}` : ''}
              </div>
            </div>
            <span className="spacer" />
            {u.stage && <span className="badge tone-grey" style={{ fontSize: 10.5 }}>{humanStatus(u.stage)}</span>}
            <span className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{timeAgo(u.lastActiveAt)}</span>
          </div>
        );
        return href
          ? <Link key={u.userId ?? i} href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{inner}</Link>
          : <div key={u.userId ?? i}>{inner}</div>;
      })}
    </div>
  );
}
