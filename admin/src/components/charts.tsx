'use client';
import React from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const AXIS = { fontSize: 11, fill: '#98a2b3' };

/**
 * Daily volume. `showDisbursals` is opt-in because a second series pinned flat at
 * zero for every day in the window is worse than no second series: it spends a
 * legend entry, a colour, and half the reader's attention to say "nothing happened".
 * The overview passes it only once at least one disbursal exists.
 *
 * Both series are counts on one shared axis — never a second y-scale.
 */
export function TrendArea({ data, showDisbursals = false }: { data: { date: string; applications: number; disbursals: number }[]; showDisbursals?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#079fa0" stopOpacity={0.35} /><stop offset="100%" stopColor="#079fa0" stopOpacity={0} /></linearGradient>
          <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2fb183" stopOpacity={0.3} /><stop offset="100%" stopColor="#2fb183" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid stroke="#eef1f4" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => String(d).slice(5)} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6e9ee', fontSize: 12 }} />
        {/* One series needs no legend — the card title names it. */}
        {showDisbursals && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {/* `linear`, not `monotone`: these are discrete daily counts, and spline
            smoothing bulges the curve between points — with a mostly-zero window it
            drew rounded humps and dipped visibly below zero, implying volume on days
            that had none. */}
        <Area type="linear" dataKey="applications" name="Applications" stroke="#079fa0" strokeWidth={2} fill="url(#gA)" dot={{ r: 2.5, strokeWidth: 0, fill: '#079fa0' }} activeDot={{ r: 4.5 }} />
        {showDisbursals && <Area type="linear" dataKey="disbursals" name="Disbursals" stroke="#2fb183" strokeWidth={2} fill="url(#gB)" dot={{ r: 2.5, strokeWidth: 0, fill: '#2fb183' }} activeDot={{ r: 4.5 }} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Horizontal bars, sorted biggest-first — the right form for ranking nominal
 * categories with close values, where a donut forces the reader to compare arc
 * lengths (lead sources currently run 14/7/7/7/5/3, i.e. three exact ties).
 *
 * One series, so one colour for every bar: bar length already encodes magnitude, and
 * a per-category hue would spend the colour channel restating it.
 */
export function HBar({ data, nameKey, valueKey, max = 8 }: { data: Record<string, unknown>[]; nameKey: string; valueKey: string; max?: number }) {
  const rows = [...data]
    .map((d) => ({ name: String(d[nameKey] ?? '—'), value: Number(d[valueKey] ?? 0) }))
    .sort((a, b) => b.value - a.value);

  // Past ~8 rows adjacent bars stop being separable; fold the tail into one row
  // rather than silently dropping it.
  const head = rows.slice(0, max);
  const tail = rows.slice(max);
  if (tail.length) head.push({ name: `Other (${tail.length})`, value: tail.reduce((s, r) => s + r.value, 0) });

  const top = Math.max(...head.map((r) => r.value), 1);
  if (!head.length) return <div className="empty">No data yet</div>;

  return (
    <div className="hbar">
      {head.map((r) => (
        <div className="hbar-row" key={r.name}>
          <div className="hbar-label" title={r.name}>{r.name}</div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }} />
          </div>
          <div className="hbar-num mono">{r.value.toLocaleString('en-IN')}</div>
        </div>
      ))}
    </div>
  );
}

export function CategoryBar({ data, xKey, yKey }: { data: Record<string, unknown>[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="#eef1f4" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6e9ee', fontSize: 12 }} cursor={{ fill: '#f2f4f7' }} />
        <Bar dataKey={yKey} radius={[6, 6, 0, 0]} fill="#079fa0" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// `DonutChart` was removed here.
//
// Its two callers were "leads by source" on the overview and "by source"/"by platform"
// on downloads — respectively a set of near-tied values, and a two-slice split. Both
// asked the reader to rank things by comparing arc lengths, which `HBar` answers
// directly, and its palette was indexed with `PALETTE[i % PALETTE.length]`, so a
// seventh category silently reused the first category's colour.
// Use `HBar` for ranking categories. If a genuine part-to-whole view is ever needed
// (≤ 6 clearly-unequal segments), reintroduce it with a non-cycling palette.
