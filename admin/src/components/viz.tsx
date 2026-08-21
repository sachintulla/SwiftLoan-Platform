'use client';
import React from 'react';
import Link from 'next/link';
import { num, pct, humanStatus, ageShort, inrCompactR } from '@/lib/format';

// ─────────────────────────── pipeline census ───────────────────────────

export interface PipelineStage {
  key: string; label: string; terminal: boolean;
  count: number; valueRupees: number; waitingSince: string | null;
}

// Ordered single-hue ramp for the stage bars. The stages ARE ordered (an application
// moves down the list), so an ordinal ramp is the correct encoding — one hue,
// light→dark, rather than a categorical colour per stage. Validated against the light
// surface: monotone lightness, adjacent ΔL ≥ 0.06, light end clears 2:1 contrast.
const STAGE_RAMP = ['#57c0bf', '#2fa9a9', '#0f9293', '#0a7375', '#064e51'];

/**
 * How many applications are sitting at each stage, what they're worth, and how long
 * the most neglected one has waited. Rows link to the filtered pipeline list.
 *
 * Deliberately NOT a funnel: status is a current position, not a flow, and the old
 * funnel's conversion percentages were arithmetically impossible (see
 * `buildAcquisition` in server/src/modules/admin.routes.ts).
 */
export function StageCensus({ stages, href }: { stages: PipelineStage[]; href?: (key: string) => string }) {
  // Terminal stages (disbursed / rejected / closed) are shown — an operator wants to
  // see them — but they are not work in progress, so they are excluded from the bar
  // scale, which otherwise let a large "disbursed" bucket flatten every live queue.
  const live = stages.filter((s) => !s.terminal);
  const max = Math.max(...live.map((s) => s.count), 1);
  const shown = stages.filter((s) => s.count > 0);

  if (!shown.length) return <div className="empty">No applications in the pipeline yet</div>;

  return (
    <div className="census">
      <div className="census-head">
        <span />
        <span />
        <span>apps</span>
        <span>value</span>
        <span>oldest</span>
      </div>
      {shown.map((s, i) => {
        // Terminal rows sit outside the ordinal ramp — they are outcomes, not queue
        // positions — so they take a neutral grey and read as settled at a glance.
        const colour = s.terminal ? 'var(--grey)' : STAGE_RAMP[Math.min(i, STAGE_RAMP.length - 1)];
        const row = (
          <>
            <div className="census-label" style={s.terminal ? { color: 'var(--text-dim)' } : undefined}>{s.label}</div>
            <div className="census-track">
              <div
                className="census-fill"
                // Clamped: the bar scale is set by the largest LIVE queue, and a
                // terminal bucket can be bigger than all of them.
                style={{ width: `${Math.min(100, Math.max(2, (s.count / max) * 100))}%`, background: colour }}
              />
            </div>
            <div className="census-count mono">{num(s.count)}</div>
            <div className="census-value mono">{s.valueRupees > 0 ? inrCompactR(s.valueRupees) : '—'}</div>
            <div className="census-age">
              {s.waitingSince ? <span title={new Date(s.waitingSince).toLocaleString('en-IN')}>{ageShort(s.waitingSince)}</span> : '—'}
            </div>
          </>
        );
        return href
          ? <Link key={s.key} href={href(s.key)} className="census-row census-row-link">{row}</Link>
          : <div key={s.key} className="census-row">{row}</div>;
      })}
    </div>
  );
}

// ─────────────────────────── acquisition tracks ───────────────────────────

export interface TrackStep { label: string; value: number; stepPct: number | null }

/**
 * One acquisition path as a stepped bar. Percentages are step-to-step against the
 * step directly above, and only shown where that relationship is real — website and
 * app are rendered as two separate tracks precisely because splicing them produced
 * fiction.
 */
export function TrackSteps({ steps }: { steps: TrackStep[] }) {
  const top = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="track">
      {steps.map((s, i) => {
        // A step larger than the one above it is not a conversion rate — it means the
        // two counts are not actually in a parent/child relationship (only 20 installs
        // were ever recorded against 50 registered users, so "installs → registered"
        // printed 250%). Printing that as a percentage is precisely the fiction the old
        // 8-stage funnel was removed for, so flag it instead of dressing it up.
        const impossible = s.stepPct != null && s.stepPct > 100;
        return (
          <div className="track-row" key={s.label}>
            <div className="track-label">{s.label}</div>
            <div className="track-track">
              <div
                className="track-fill"
                style={{
                  width: `${Math.min(100, Math.max(1.5, (s.value / top) * 100))}%`,
                  background: STAGE_RAMP[Math.min(i, STAGE_RAMP.length - 1)],
                }}
              />
            </div>
            <div className="track-num mono">{num(s.value)}</div>
            <div
              className="track-pct"
              style={impossible ? { color: 'var(--amber)' } : undefined}
              title={impossible
                ? `More than the step above it — these two counts are not tracked from the same population, so a conversion rate is not meaningful here.`
                : undefined}
            >
              {s.stepPct == null ? '' : impossible ? '⚠' : pct(s.stepPct)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PIPE_COLORS: Record<string, string> = {
  draft: '#f79009', pan_pending: '#f7a53b', prequalifying: '#2e90fa', offers_ready: '#2e90fa',
  handoff: '#f79009', under_review: '#2e90fa', approved: '#12b76a', rejected: '#f04438',
  disbursed: '#0a7d4b', closed: '#667085',
};

export function PipelineBar({ byStatus }: { byStatus: Record<string, number> }) {
  const entries = Object.entries(byStatus).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div>
      <div className="pipeline">
        {entries.map(([k, v]) => (
          <div key={k} className="pipeline-seg" style={{ width: `${(v / total) * 100}%`, background: PIPE_COLORS[k] || '#98a2b3' }} title={`${humanStatus(k)}: ${v}`}>
            {v / total > 0.06 ? v : ''}
          </div>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 14, marginTop: 12 }}>
        {entries.map(([k, v]) => (
          <span key={k} className="row" style={{ gap: 6, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: PIPE_COLORS[k] || '#98a2b3' }} />
            <span className="muted">{humanStatus(k)}</span><b>{v}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── work queue ───────────────────────────

export interface AttentionItem {
  id: string; type: string; title: string; body?: string | null;
  severity?: string | null; entityId?: string | null; read: boolean; createdAt: string;
}

const SEVERITY_TONE: Record<string, string> = {
  critical: 'var(--red)', serious: 'var(--red)', warning: 'var(--amber)', info: 'var(--blue)',
};

/**
 * The cases an admin should act on, newest first.
 *
 * This replaced a "Live activity" feed that read the raw ActivityEvent table. That
 * feed was ~100% `stage_stalled` / `nudge_sent` rows written by the in-process job
 * scheduler — identical wording, no customer identity, nothing to act on. It was a
 * log tail wearing a dashboard card. These rows name the customer and the stage and
 * link through to the application.
 */
export function AttentionQueue({ items }: { items: AttentionItem[] }) {
  if (!items.length) return <div className="empty">Nothing needs attention — the queue is clear</div>;
  return (
    <div className="queue">
      {items.map((n) => {
        const tone = SEVERITY_TONE[String(n.severity ?? 'info')] ?? 'var(--grey)';
        const body = (
          <>
            <span className="queue-bar" style={{ background: tone }} />
            <div className="queue-body">
              <div className="queue-title">{n.title}</div>
              {n.body && <div className="queue-sub">{n.body}</div>}
            </div>
            <div className="queue-meta">
              {!n.read && <span className="queue-dot" title="Unread" />}
              <span className="muted">{ageShort(n.createdAt)}</span>
            </div>
          </>
        );
        // `loan_stale` notifications carry the application id, so the row can deep-link
        // to the journey. Other types have no reliable target — render them inert
        // rather than pointing at a URL that 404s.
        return n.entityId && n.type === 'loan_stale'
          ? <Link key={n.id} href={`/loans/${n.entityId}`} className="queue-row queue-row-link">{body}</Link>
          : <div key={n.id} className="queue-row">{body}</div>;
      })}
    </div>
  );
}
