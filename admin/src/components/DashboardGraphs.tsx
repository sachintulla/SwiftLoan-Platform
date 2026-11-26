'use client';
// The Dashboard graphs: how far people get, what happened to the people who checked eligibility, the loan amount
// they ask for, and three daily graphs. Numbers come from GET /api/admin/dashboard/graphs (people counted once).
// Plain CSS and SVG: nothing here needs a chart library.
import React from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, TableSkeleton, FilterChips, Callout } from '@/components/ui';
import { inrCompact, num } from '@/lib/format';
import './dashboardGraphs.css';

interface FunnelRow { key: string; label: string; hint: string; count: number; pctOfFirst: number; pctOfPrev: number | null; dropped: number | null }
interface OutcomeRow { key: string; label: string; tone: string; count: number; pct: number }
interface AmountRow { key: string; label: string; count: number; pct: number }
interface DayRow { day: string; signups: number; checks: number; applies: number }
interface Graphs {
  funnel: FunnelRow[];
  outcomes: { total: number; rows: OutcomeRow[] };
  amounts: { total: number; totalRupees: number; rows: AmountRow[] };
  days: number;
  daily: DayRow[];
}

const TONE: Record<string, string> = { red: 'var(--red)', amber: 'var(--amber)', green: 'var(--green)', grey: 'var(--grey)', slate: 'var(--text-dim)' };
const DAY_OPTS = [{ key: '7', label: '7d' }, { key: '14', label: '14d' }, { key: '30', label: '30d' }, { key: '90', label: '90d' }];

/** "23 Nov" for a YYYY-MM-DD India day. */
function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** One bar per day. The last bar is today, which is still filling, so it is drawn lighter. */
function DailyBars({ rows, pick, color, label }: { rows: DayRow[]; pick: (r: DayRow) => number; color: string; label: string }) {
  const W = 560; const H = 130; const n = rows.length || 1;
  const max = Math.max(1, ...rows.map(pick));
  const slot = W / n; const gap = n > 45 ? 1 : n > 20 ? 3 : 10;
  // With many days the numbers and dates would overlap, so only some are written; every bar keeps its tooltip.
  const every = n <= 14 ? 1 : n <= 30 ? 3 : 10;
  const total = rows.reduce((s, r) => s + pick(r), 0);
  return (
    <figure className="dg-fig">
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label={`${label}: ${num(total)} in the last ${n} days`}>
        {rows.map((r, i) => {
          const v = pick(r);
          const h = v === 0 ? 2 : Math.max(3, Math.round((v / max) * (H - 22)));
          const x = i * slot + gap / 2; const w = Math.max(1, slot - gap); const y = H - h;
          const show = i === n - 1 || i % every === 0;
          return (
            <g key={r.day}>
              <rect x={x} y={y} width={w} height={h} rx={Math.min(4, w / 2)} fill={color} opacity={i === n - 1 ? 0.45 : 1}>
                <title>{`${dayLabel(r.day)}: ${num(v)}`}</title>
              </rect>
              {show && n <= 30 && <text x={x + w / 2} y={y - 5} textAnchor="middle" className="dg-bv">{num(v)}</text>}
              {show && <text x={x + w / 2} y={H + 15} textAnchor="middle" className="dg-bd">{n <= 14 ? r.day.slice(8) : dayLabel(r.day)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="muted">{num(total)} in the last {n} days · the last bar is today so far</figcaption>
    </figure>
  );
}

export default function DashboardGraphs({ from, to, days, onDays }: { from?: string; to?: string; days: string; onDays: (d: string) => void }) {
  const qs = new URLSearchParams({ days });
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/dashboard/graphs?${qs.toString()}`, swrFetcher, { keepPreviousData: true });
  const g = data?.data as Graphs | undefined;

  if (error && !g) {
    return <div style={{ marginTop: 16 }}><Callout tone="red">Could not load the graphs. <button className="adm-link-btn" onClick={() => mutate()}>Retry</button></Callout></div>;
  }
  const loading = isLoading && !g;

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <Card title="How far people get" sub="Each person counted once, for people who signed up in the selected range. Shows where we lose them.">
          {loading || !g ? <TableSkeleton rows={5} cols={3} /> : (
            <div>
              {g.funnel.map((r) => (
                <div key={r.key} className="dg-frow">
                  <div className="dg-flabel"><b>{r.label}</b><span>{r.hint}</span></div>
                  <div className="dg-fbar" aria-hidden><span style={{ width: `${r.count > 0 ? Math.max(r.pctOfFirst, 2) : 0}%` }} /></div>
                  <div className="dg-fnum">
                    <b>{num(r.count)}</b>
                    <span>{r.pctOfFirst}% of sign-ups{r.pctOfPrev != null ? ` · ${r.pctOfPrev}% of the step before` : ''}</span>
                    {r.dropped != null && r.dropped > 0 && <span className="dg-drop">{num(r.dropped)} did not continue</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="ov-two">
        <Card title="What happened to people who checked eligibility" sub="The latest result for each person who started an application in the selected range.">
          {loading || !g ? <TableSkeleton rows={5} cols={2} /> : g.outcomes.total === 0 ? <div className="empty">No applications in this range.</div> : (
            <>
              <div className="dg-split" role="img" aria-label={g.outcomes.rows.map((r) => `${r.label} ${r.pct}%`).join(', ')}>
                {g.outcomes.rows.filter((r) => r.count > 0).map((r) => <i key={r.key} style={{ flexGrow: r.count, background: TONE[r.tone] ?? 'var(--grey)' }} title={`${r.label}: ${num(r.count)}`} />)}
              </div>
              <div className="dg-leg">
                {g.outcomes.rows.map((r) => (
                  <div key={r.key}><span className="dg-dot" style={{ background: TONE[r.tone] ?? 'var(--grey)' }} />{r.label}<b>{num(r.count)}</b><em>{r.pct}%</em></div>
                ))}
              </div>
              <p className="muted dg-foot">{num(g.outcomes.total)} people in all.</p>
            </>
          )}
        </Card>
        <Card title="Loan amount people ask for" sub="Applications in the selected range, by the amount requested.">
          {loading || !g ? <TableSkeleton rows={4} cols={2} /> : g.amounts.total === 0 ? <div className="empty">No applications in this range.</div> : (
            <>
              <div className="dg-leg">
                {g.amounts.rows.map((r) => {
                  const top = Math.max(1, ...g.amounts.rows.map((x) => x.count));
                  return (
                    <div key={r.key}>
                      <span className="dg-alabel">{r.label}</span>
                      <span className="dg-mini" aria-hidden><span style={{ width: `${Math.round((r.count / top) * 100)}%` }} /></span>
                      <b>{num(r.count)}</b><em>{r.pct}%</em>
                    </div>
                  );
                })}
              </div>
              <p className="muted dg-foot">{inrCompact(g.amounts.totalRupees)} asked for across {num(g.amounts.total)} applications.</p>
            </>
          )}
        </Card>
      </div>

      <div className="row between wrap" style={{ marginTop: 28 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 20 }}>Day by day</h2>
          <p className="page-sub">Is it growing? Counted by India day.</p>
        </div>
        <FilterChips options={DAY_OPTS} value={days} onChange={onDays} />
      </div>
      <div className="dg-three">
        <Card title="New sign-ups per day" sub="People who created an account.">
          {loading || !g ? <TableSkeleton rows={4} /> : <DailyBars rows={g.daily} pick={(r) => r.signups} color="var(--brand)" label="New sign-ups per day" />}
        </Card>
        <Card title="Eligibility checks per day" sub="Applications sent to find offers.">
          {loading || !g ? <TableSkeleton rows={4} /> : <DailyBars rows={g.daily} pick={(r) => r.checks} color="var(--blue)" label="Eligibility checks per day" />}
        </Card>
        <Card title="Applied to a lender per day" sub="Apply tapped on an offer.">
          {loading || !g ? <TableSkeleton rows={4} /> : <DailyBars rows={g.daily} pick={(r) => r.applies} color="var(--green)" label="Applied to a lender per day" />}
        </Card>
      </div>
    </>
  );
}
