'use client';
// Dashboard: people per day (registered, applied, got offers, rejected) as ONE line graph, each line with its colour
// filled underneath up to its value. A range picker (7 days, 1 month, 3 months, custom dates). Hover a day to read all
// four; click a name to hide or show its line. Numbers: GET /api/admin/dashboard/people-daily (India days, people
// counted once per day).
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { swrFetcher } from '@/lib/api';
import { Card, FilterChips, Callout, TableSkeleton } from '@/components/ui';
import { num } from '@/lib/format';
import './peopleDailyChart.css';
import { AXIS_TICK, DS } from '@/lib/palette';

type SeriesKey = 'registered' | 'applied' | 'gotOffers' | 'rejected';
interface Day { day: string; registered: number; applied: number; gotOffers: number; rejected: number }
interface Payload {
  from: string; to: string; today: string; days: Day[];
  totals: { registered: number; applied: number; gotOffers: number; rejected: number; gotOffersPct: number; rejectedPct: number };
}

const SERIES: { key: SeriesKey; label: string; hint: string; color: string }[] = [
  // Strong, clearly different colours (the first set was too pale): deep teal, blue, green, slate.
  { key: 'registered', label: 'Registered', hint: 'New accounts', color: DS.teal600 },
  { key: 'applied', label: 'Applied', hint: 'Asked for offers', color: DS.teal900 },
  { key: 'gotOffers', label: 'Got offers', hint: 'A lender offered a loan', color: DS.green400 },
  { key: 'rejected', label: 'Rejected', hint: 'No lender offered a loan', color: DS.muted },
];

const RANGES = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 1 month' },
  { key: '90', label: 'Last 3 months' },
  { key: 'custom', label: 'Custom dates' },
];

const AXIS = AXIS_TICK;
const asDate = (ymd: string) => new Date(`${ymd}T12:00:00`);
const shortDay = (ymd: string) => asDate(ymd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const longDay = (ymd: string) => asDate(ymd).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function HoverCard({ active, payload, label, today, shown }: { active?: boolean; payload?: { payload: Day }[]; label?: string; today: string; shown: Set<SeriesKey> }) {
  if (!active || !payload?.length || !label) return null;
  const d = payload[0].payload;
  return (
    <div className="pdc-tip">
      <div className="pdc-tip-day">{longDay(label)}{label === today ? ' · today so far' : ''}</div>
      {SERIES.filter((s) => shown.has(s.key)).map((s) => (
        <div key={s.key} className="pdc-tip-row">
          <span className="pdc-dot" style={{ background: s.color }} />{s.label}<b>{num(d[s.key])}</b>
        </div>
      ))}
    </div>
  );
}

export default function PeopleDailyChart() {
  const [range, setRange] = useState('7');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // The graph opens with Registered and Got offers only; Applied and Rejected are one click away on their boxes.
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set<SeriesKey>(['applied', 'rejected']));

  const customReady = range === 'custom' && Boolean(from && to);
  const qs = range === 'custom' ? (customReady ? `from=${from}&to=${to}` : null) : `days=${range}`;
  const { data, error, isLoading, mutate } = useSWR(qs ? `/api/admin/dashboard/people-daily?${qs}` : null, swrFetcher, { keepPreviousData: true, refreshInterval: 60_000 });
  const p = data?.data as Payload | undefined;

  const shown = useMemo(() => new Set(SERIES.map((s) => s.key).filter((k) => !hidden.has(k))), [hidden]);
  const toggle = (k: SeriesKey) => setHidden((h) => {
    const next = new Set(h);
    if (next.has(k)) next.delete(k);
    else if (next.size < SERIES.length - 1) next.add(k); // always keep at least one line
    return next;
  });

  const days = p?.days ?? [];
  const visible = SERIES.filter((s) => shown.has(s.key));
  // The scale tops out half as high again as the highest value on screen (rounded up to the next 100 first), so the
  // lines never touch the top of the graph: a highest value of 281 gives 300 + 300 / 2 = 450.
  const peak = Math.max(0, ...days.flatMap((d) => visible.map((s) => d[s.key])));
  const base = Math.max(100, Math.ceil(peak / 100) * 100);
  const yTop = base + base / 2;
  // Marks at 0, half the base, the base, and the top (0 / 150 / 300 / 450).
  const yTicks = [0, base / 2, base, yTop];
  // Few days: every date is written. Many days: recharts thins the labels out by itself.
  const tickGap = days.length <= 14 ? 0 : 24;

  return (
    <Card
      title="People per day"
      right={<FilterChips options={RANGES} value={range} onChange={setRange} />}
    >
      {range === 'custom' && (
        <div className="pdc-custom">
          <label>From <input type="date" className="input" value={from} max={to || p?.today || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To <input type="date" className="input" value={to} min={from || undefined} max={p?.today || undefined} onChange={(e) => setTo(e.target.value)} /></label>
          {!customReady && <span className="muted">Pick both dates to draw the graph.</span>}
        </div>
      )}

      <div className="pdc-legend" role="group" aria-label="Lines on the graph">
        {SERIES.map((s) => {
          const on = shown.has(s.key);
          const total = p?.totals[s.key];
          const share = s.key === 'gotOffers' ? p?.totals.gotOffersPct : s.key === 'rejected' ? p?.totals.rejectedPct : undefined;
          return (
            <button key={s.key} type="button" className={`pdc-key ${on ? '' : 'off'}`} onClick={() => toggle(s.key)} aria-pressed={on} title={on ? 'Click to hide this line' : 'Click to show this line'}>
              <span className="pdc-key-top"><span className="pdc-dot" style={{ background: s.color }} />{s.label}</span>
              <b>{total != null ? num(total) : '—'}</b>
              <span className="pdc-key-hint">{s.hint}{share != null && p && p.totals.applied > 0 ? ` · ${share}% of applied` : ''}</span>
            </button>
          );
        })}
      </div>

      {error && !p ? (
        <Callout tone="red">Could not load the graph. <button className="adm-link-btn" onClick={() => mutate()}>Retry</button></Callout>
      ) : range === 'custom' && !customReady ? (
        <div className="pdc-empty">Choose a From and a To date above.</div>
      ) : isLoading && !p ? (
        <TableSkeleton rows={6} />
      ) : days.length === 0 ? (
        <div className="pdc-empty">Nothing in this range.</div>
      ) : (
        <div className="pdc-chart">
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={days} margin={{ top: 10, right: 16, bottom: 0, left: -14 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`pdc-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.08} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} vertical={false} />
              <XAxis dataKey="day" tick={AXIS} tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={tickGap} interval={days.length <= 14 ? 0 : 'preserveStartEnd'} padding={{ left: 12, right: 12 }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={46} domain={[0, yTop]} ticks={yTicks} />
              <Tooltip content={<HoverCard today={p?.today ?? ''} shown={shown} />} cursor={{ stroke: DS.faint, strokeDasharray: '4 4' }} />
              {/* Each line has its colour filled underneath, from the line down to zero, so the height of the fill is the value. */}
              {visible.map((s) => (
                <Area
                  key={s.key} type="monotone" dataKey={s.key} name={s.label}
                  stroke={s.color} strokeWidth={3} strokeLinecap="round" fill={`url(#pdc-${s.key})`} fillOpacity={1}
                  dot={days.length <= 31 ? { r: 3, strokeWidth: 2, stroke: '#fff', fill: s.color, fillOpacity: 1 } : false}
                  activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#fff' }}
                  animationDuration={450}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
