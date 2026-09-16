'use client';
// A condensed, human-readable version of the raw journey-event log. The full
// timeline can run to 70+ rows once every otp_requested/otp_verified pair and
// every stall re-check is counted — nobody can read that in one sitting. This
// picks out the handful of events that actually explain what happened and
// says them in plain English; /customers/:id/activity is still there for
// anyone who wants the unabridged log.
import React from 'react';
import { dateStr, timeStr } from '@/lib/format';

interface TimelineEntry {
  id: string; channel: string; name: string; occurredAt: string;
  metadata?: Record<string, unknown> | null;
}
interface CallLike {
  id: string; status?: string | null; startedAt?: string | null; queuedAt?: string | null;
  answered?: boolean | null; error?: string | null; durationSec?: number | null;
  callContext?: unknown;
}
interface NotificationLike {
  id: string; title: string; body?: string | null; read: boolean; createdAt: string;
}

export interface Highlight { key: string; at: string; tone: 'green' | 'amber' | 'red' | 'grey'; title: string; detail?: string }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function buildActivityHighlights(opts: {
  timeline: TimelineEntry[];
  calls: CallLike[];
  notifications: NotificationLike[];
  otpSummary?: { total: number; consumed: number } | null;
  nudgeSummary?: { total: number; delivered: number; failed: number; lastError?: string | null } | null;
}): Highlight[] {
  const { timeline, calls, notifications, otpSummary, nudgeSummary } = opts;
  const out: Highlight[] = [];
  const first = (name: string) => timeline.find((e) => e.name === name);

  const installed = first('app_installed');
  if (installed) {
    const meta = installed.metadata ?? {};
    out.push({
      key: 'installed', at: installed.occurredAt, tone: 'green',
      title: 'App installed', detail: typeof meta.platform === 'string' ? `via ${meta.platform}${typeof meta.source === 'string' ? ` · ${meta.source}` : ''}` : undefined,
    });
  }

  const otpVerified = first('otp_verified');
  if (otpVerified && otpSummary) {
    const expired = otpSummary.total - otpSummary.consumed;
    out.push({
      key: 'otp', at: otpVerified.occurredAt, tone: 'green',
      title: 'OTP verified, account created',
      detail: `First of ${otpSummary.total} OTP token${otpSummary.total === 1 ? '' : 's'} sent (${otpSummary.consumed} consumed${expired > 0 ? `, ${expired} expired` : ''})`,
    });
  }

  const submitted = first('application_submitted');
  if (submitted) {
    out.push({ key: 'submitted', at: submitted.occurredAt, tone: 'green', title: 'Application submitted' });
  }

  for (const n of notifications) {
    out.push({
      key: `notif-${n.id}`, at: n.createdAt, tone: n.read ? 'grey' : 'amber',
      title: `Admin alert — ${n.title}`,
      detail: `${n.body ?? ''}${n.read ? ' · read' : ' · still unread'}`.trim(),
    });
  }

  if (nudgeSummary && nudgeSummary.failed > 0) {
    const firstNudge = timeline.find((e) => e.name === 'nudge_sent');
    if (firstNudge) {
      const meta = firstNudge.metadata ?? {};
      const label = (typeof meta.rule === 'string' && meta.rule) || (typeof meta.eventName === 'string' && meta.eventName) || 'journey nudge';
      out.push({
        key: 'nudge-fail', at: firstNudge.occurredAt, tone: 'red',
        title: 'First nudge dispatch failed',
        detail: `${label}${nudgeSummary.lastError ? ` — ${nudgeSummary.lastError}` : ''} · ${nudgeSummary.failed} of ${nudgeSummary.total} failed in total`,
      });
    }
  }

  for (const c of calls) {
    const at = c.startedAt ?? c.queuedAt;
    if (!at) continue;
    const ctx = isObj(c.callContext) ? c.callContext : {};
    const manual = ctx.reason === 'manual_dashboard_call';
    if (c.status === 'completed' && c.answered) {
      out.push({
        key: `call-${c.id}`, at, tone: 'green',
        title: manual ? 'Call connected — manual dashboard call' : 'Call connected',
        detail: c.durationSec != null ? `${Math.round(c.durationSec / 60)}m ${c.durationSec % 60}s` : undefined,
      });
    } else if (c.status === 'failed' || c.status === 'no_answer' || c.status === 'busy') {
      out.push({
        key: `call-${c.id}`, at, tone: 'red',
        title: 'Call failed to connect',
        detail: c.error ?? undefined,
      });
    }
  }

  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return out;
}

const DOT_COLOR: Record<Highlight['tone'], string> = {
  green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', grey: 'var(--grey)',
};

export function ActivityFeed({ highlights }: { highlights: Highlight[] }) {
  if (!highlights.length) return <div className="empty">No notable activity yet</div>;
  return (
    <div>
      {highlights.map((h) => (
        <div key={h.key} className="activity-row">
          <span className="muted mono" style={{ fontSize: 11 }}>{dateStr(h.at)} {timeStr(h.at)}</span>
          <span className="activity-dot" style={{ background: DOT_COLOR[h.tone] }} aria-hidden />
          <div>
            <div className="activity-title">{h.title}</div>
            {h.detail && <div className="activity-detail">{h.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
