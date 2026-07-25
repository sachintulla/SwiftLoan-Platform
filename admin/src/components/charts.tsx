'use client';
import React from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const AXIS = { fontSize: 11, fill: '#98a2b3' };
const PALETTE = ['#079fa0', '#2fb183', '#2e90fa', '#f79009', '#f04438', '#7a5af8', '#15b8a6'];

export function TrendArea({ data }: { data: { date: string; applications: number; disbursals: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#079fa0" stopOpacity={0.35} /><stop offset="100%" stopColor="#079fa0" stopOpacity={0} /></linearGradient>
          <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2fb183" stopOpacity={0.3} /><stop offset="100%" stopColor="#2fb183" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => String(d).slice(5)} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6e9ee', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="applications" name="Applications" stroke="#079fa0" strokeWidth={2} fill="url(#gA)" />
        <Area type="monotone" dataKey="disbursals" name="Disbursals" stroke="#2fb183" strokeWidth={2} fill="url(#gB)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryBar({ data, xKey, yKey }: { data: Record<string, unknown>[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6e9ee', fontSize: 12 }} cursor={{ fill: '#f2f4f7' }} />
        <Bar dataKey={yKey} radius={[6, 6, 0, 0]} fill="#079fa0" />
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
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6e9ee', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
