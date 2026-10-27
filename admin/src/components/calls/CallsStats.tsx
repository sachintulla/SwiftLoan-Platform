'use client';
// The numbers side of the Calls page: the stat strip (each cell sets a filter),
// the red notice that only appears when a call job is overdue, the by-day and
// by-reason breakdowns, and the folded schedule table kept for support.
import React from 'react';
import { Card, Stat, StatusBadge, Callout, TableSkeleton } from '@/components/ui';
import { num, timeAgo, dateTimeStr } from '@/lib/format';
import {
  statCells, overdueJobs, overdueMessage, jobName, everyLabel, barPercent, shortDay, purposeLabel,
  FOLLOW_UP_HELP, type CallFilters, type OverviewSummary, type JobHeartbeat, type StatCell,
} from '@/lib/calls';
import './calls.css';

function cellActive(cell: StatCell, f: CallFilters): boolean {
  const want = cell.filter;
  return (want.view === undefined || want.view === f.view) && (want.range === undefined || want.range === f.range);
}

export function CallsStatStrip({
  summary, loading, error, onRetry, filters, onPick,
}: {
  summary: OverviewSummary | null | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  filters: CallFilters;
  onPick: (patch: Partial<CallFilters>) => void;
}) {
  if (error && !summary) {
    return (
      <Card>
        <div className="muted" style={{ fontSize: 13 }}>
          Could not load the call numbers.{' '}
          <button type="button" className="btn" onClick={onRetry}>Retry</button>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      {loading && !summary ? (
        <div className="skeleton" style={{ height: 58 }} aria-busy="true" />
      ) : (
        <>
          <div className="stat-strip" role="group" aria-label="Call totals. Select one to filter the call log.">
            {statCells(summary).map((c) => (
              <button
                key={c.key}
                type="button"
                className={`adm-calls-stat${cellActive(c, filters) ? ' is-active' : ''}`}
                aria-pressed={cellActive(c, filters)}
                onClick={() => onPick(c.filter)}
              >
                <Stat label={c.label} value={num(c.value)} foot={c.foot} tone={c.tone} />
              </button>
            ))}
          </div>
          <p className="adm-calls-statnote">
            Select a number to filter the call log. Need a follow-up: {FOLLOW_UP_HELP}
          </p>
        </>
      )}
    </Card>
  );
}

/** Shown only while a call job is overdue; renders nothing otherwise. */
export function OverdueNotice({ jobs, onSeeDetails }: { jobs: JobHeartbeat[] | undefined; onSeeDetails: () => void }) {
  const late = overdueJobs(jobs);
  if (late.length === 0) return null;
  return (
    <div role="alert">
      <Callout tone="red" icon="•">
        {overdueMessage(late)}
        <button type="button" className="adm-calls-link" onClick={onSeeDetails}>See job details</button>
      </Callout>
    </div>
  );
}

export function CallsBreakdown({
  perDay, byPurpose, loading,
}: {
  perDay: { day: string; count: number }[] | undefined;
  byPurpose: { purpose: string; count: number }[] | undefined;
  loading: boolean;
}) {
  const days = perDay ?? [];
  const reasons = byPurpose ?? [];
  const maxDay = Math.max(1, ...days.map((d) => d.count));
  const maxWhy = Math.max(1, ...reasons.map((d) => d.count));
  return (
    <div className="adm-calls-two">
      <Card title="Calls by day" sub="The last 7 days, India time.">
        {loading ? <TableSkeleton rows={4} cols={2} /> : days.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No calls in the last 7 days.</div>
        ) : (
          <div className="adm-calls-bars">
            {days.map((d) => (
              <div key={d.day} className="adm-calls-bar">
                <span className="muted">{shortDay(d.day)}</span>
                <div className="mini-bar" aria-hidden><span style={{ width: `${barPercent(d.count, maxDay)}%` }} /></div>
                <span className="adm-calls-bar-n">{num(d.count)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Why we called" sub="The last 7 days.">
        {loading ? <TableSkeleton rows={4} cols={2} /> : reasons.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No calls in the last 7 days.</div>
        ) : (
          <div className="adm-calls-bars">
            {reasons.map((r) => (
              <div key={r.purpose} className="adm-calls-bar">
                <span className="muted" title={purposeLabel(r.purpose)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{purposeLabel(r.purpose)}</span>
                <div className="mini-bar" aria-hidden><span style={{ width: `${barPercent(r.count, maxWhy)}%` }} /></div>
                <span className="adm-calls-bar-n">{num(r.count)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** The scheduler's heartbeat table, folded away: it is for support, not for the day-to-day question. */
export const SCHEDULE_ID = 'adm-calls-schedule';

export function ScheduleGuide({
  jobs, loading, open, onToggle,
}: {
  jobs: JobHeartbeat[] | undefined;
  loading: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const callJobs = (jobs ?? []).filter((j) => j.isCallJob);
  return (
    <details
      id={SCHEDULE_ID}
      className="so-guide"
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>Automatic call schedule (for support)</summary>
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
        How often each automatic calling job runs, and when it last did since the server started. A job is on time if it ran within two and a half times its usual gap.
      </p>
      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : callJobs.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>No job has run since the server last started.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-calls-jobs">
            <thead><tr><th>Job</th><th>How often</th><th>Last ran</th><th>Runs</th><th>Status</th></tr></thead>
            <tbody>
              {callJobs.map((j) => (
                <tr key={j.name}>
                  <td>{jobName(j.name)}</td>
                  <td className="muted">{everyLabel(j.everyMs)}</td>
                  <td title={j.lastRunAt ? dateTimeStr(j.lastRunAt) : undefined}>
                    {j.lastRunAt ? timeAgo(j.lastRunAt) : 'Not yet'}
                    {j.lastError ? <span style={{ color: 'var(--red)', marginLeft: 6 }} title={j.lastError}>Last run had an error</span> : null}
                  </td>
                  <td>{num(j.runs)}</td>
                  <td><StatusBadge status={j.healthy ? 'active' : 'pending'} label={j.healthy ? 'On time' : 'Overdue'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
