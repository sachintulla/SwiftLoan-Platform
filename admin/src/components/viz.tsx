'use client';
import React from 'react';
import { num, pct, humanStatus, loanStatusLabel, timeAgo } from '@/lib/format';

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

export interface FeedEvent { id: string; eventType: string; eventName: string; screen?: string | null; userId?: string | null; ts: string }

const EVENT_TONE: Record<string, string> = { navigation: 'var(--blue)', action: 'var(--brand)', funnel: 'var(--teal)', system: 'var(--grey)', error: 'var(--red)' };

export function LiveFeed({ events }: { events: FeedEvent[] }) {
  if (!events.length) return <div className="empty">No recent activity</div>;
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {events.map((e) => (
        <div key={e.id} className="row" style={{ gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: EVENT_TONE[e.eventType] || 'var(--grey)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{humanStatus(e.eventName)}</span>
          {e.screen && <span className="muted" style={{ fontSize: 12 }}>· {e.screen}</span>}
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 11.5 }}>{timeAgo(e.ts)}</span>
        </div>
      ))}
    </div>
  );
}
