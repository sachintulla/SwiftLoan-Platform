'use client';
import React from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AXIS_TICK, CHART, DS, TOOLTIP_STYLE } from '@/lib/palette';

const AXIS = AXIS_TICK;
const PALETTE = [...CHART, DS.error, DS.muted];

export function TrendArea({ data }: { data: { date: string; applications: number; disbursals: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={DS.teal600} stopOpacity={0.35} /><stop offset="100%" stopColor={DS.teal600} stopOpacity={0} /></linearGradient>
          <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={DS.green400} stopOpacity={0.3} /><stop offset="100%" stopColor={DS.green400} stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => String(d).slice(5)} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="applications" name="Applications" stroke={DS.teal600} strokeWidth={2} fill="url(#gA)" />
        <Area type="monotone" dataKey="disbursals" name="Disbursals" stroke={DS.green400} strokeWidth={2} fill="url(#gB)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryBar({ data, xKey, yKey }: { data: Record<string, unknown>[]; xKey: string; yKey: string }) {
  // Recharts' auto "nice" domain rounds a max value of 1 up to 4 evenly-spaced
  // ticks, so a brand-new campaign with a single call renders a tiny bar under
  // a mostly-empty 0–4 axis. Give it a tight, exact domain for small datasets
  // instead; larger ones keep Recharts' own auto-scaling, which behaves fine.
  const maxVal = Math.max(0, ...data.map((d) => Number(d[yKey]) || 0));
  const domain: [number, number] | undefined = maxVal > 0 && maxVal <= 5 ? [0, maxVal] : undefined;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} domain={domain} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: DS.surface2 }} />
        <Bar dataKey={yKey} radius={[6, 6, 0, 0]} fill={DS.teal600} maxBarSize={64} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, nameKey, valueKey }: { data: Record<string, unknown>[]; nameKey: string; valueKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={55} outerRadius={85} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
