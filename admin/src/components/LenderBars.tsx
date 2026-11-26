'use client';
// Dashboard: ONE stacked horizontal bar chart for the three lender partners. A row per status on the Y axis (Sent,
// Applied / in progress, Offers ready, Approved, Disbursed, No offers / rejected, Failed); each bar is split into the
// three lenders' counts (Aurix, Yubi, Revasure) along the X axis. Hover a row for the exact numbers and the lenders'
// own status words; click a lender to hide or show it. Numbers: GET /api/admin/dashboard/partners (all time).
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { swrFetcher } from '@/lib/api';
import { Card, Callout, TableSkeleton } from '@/components/ui';
import { num } from '@/lib/format';
import './lenderBars.css';
import { AXIS_TICK, DS, LENDER_COLOR } from '@/lib/palette';

type Lender = 'aurix' | 'yubi' | 'revasure';
interface StatusRow { key: string; label: string; aurix: number; yubi: number; revasure: number; total: number; detail: Record<Lender, { label: string; count: number }[]> }
interface Payload { statusRows: StatusRow[] }

// One colour per lender, from the same teal / mint / slate family as the graph above.
const LENDERS: { key: Lender; name: string; color: string }[] = [
  { key: 'aurix', name: 'Aurix', color: LENDER_COLOR.aurix },
  { key: 'yubi', name: 'Yubi', color: LENDER_COLOR.yubi },
  { key: 'revasure', name: 'Revasure', color: LENDER_COLOR.revasure },
];
const AXIS = AXIS_TICK;

function HoverCard({ active, payload, shown }: { active?: boolean; payload?: { payload: StatusRow }[]; shown: Set<Lender> }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const list = LENDERS.filter((l) => shown.has(l.key));
  return (
    <div className="lb-tip">
      <div className="lb-tip-head"><b>{r.label}</b><span>{num(list.reduce((s, l) => s + r[l.key], 0))} in all</span></div>
      {list.map((l) => (
        <div key={l.key} className="lb-tip-group">
          <div className="lb-tip-row"><span className="lb-dot" style={{ background: l.color }} />{l.name}<b>{num(r[l.key])}</b></div>
          {/* The lender's own words for what is inside this number. */}
          {r.detail[l.key].length > 0 && <div className="lb-tip-detail">{r.detail[l.key].map((d) => `${d.label} ${num(d.count)}`).join(' · ')}</div>}
        </div>
      ))}
    </div>
  );
}

export default function LenderBars() {
  const { data, error, mutate } = useSWR('/api/admin/dashboard/partners', swrFetcher, { refreshInterval: 60_000 });
  const p = data?.data as Payload | undefined;
  const [hidden, setHidden] = useState<Set<Lender>>(new Set());

  const shown = useMemo(() => new Set(LENDERS.map((l) => l.key).filter((k) => !hidden.has(k))), [hidden]);
  const visible = LENDERS.filter((l) => shown.has(l.key));
  const toggle = (k: Lender) => setHidden((h) => {
    const next = new Set(h);
    if (next.has(k)) next.delete(k);
    else if (next.size < LENDERS.length - 1) next.add(k); // always keep at least one lender
    return next;
  });
  // The number written at the end of each bar follows the lenders that are showing.
  // Biggest row on top, smallest at the bottom (rows with the same number keep their usual order).
  const rows = (p?.statusRows ?? [])
    .map((r, i) => ({ ...r, i, shownTotal: visible.reduce((s, l) => s + r[l.key], 0) }))
    .sort((a, b) => b.shownTotal - a.shownTotal || a.i - b.i);
  const sent = p?.statusRows.find((r) => r.key === 'sent');

  return (
    <Card title="Lenders">
      {error && !p ? (
        <Callout tone="red">Could not load the lender chart. <button className="adm-link-btn" onClick={() => mutate()}>Retry</button></Callout>
      ) : !p ? (
        <TableSkeleton rows={7} cols={3} />
      ) : (
        <>
          <div className="lb-legend" role="group" aria-label="Lenders">
            {LENDERS.map((l) => {
              const on = shown.has(l.key);
              return (
                <button key={l.key} type="button" className={`lb-key ${on ? '' : 'off'}`} onClick={() => toggle(l.key)} aria-pressed={on} title={on ? 'Click to hide this lender' : 'Click to show this lender'}>
                  <span className="lb-dot" style={{ background: l.color }} />{l.name}{sent && <b>{num(sent[l.key])} sent</b>}
                </button>
              );
            })}
          </div>
          <div className="lb-chart">
            <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 46)}>
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 0, left: 4 }} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" stroke={DS.grid} horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => num(Number(v))} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 12.5, fill: DS.ink, fontWeight: 600 }} tickLine={false} axisLine={false} width={150} />
                <Tooltip content={<HoverCard shown={shown} />} cursor={{ fill: 'rgba(16,24,40,.04)' }} />
                {visible.map((l, i) => (
                  <Bar key={l.key} dataKey={l.key} name={l.name} stackId="lenders" fill={l.color} maxBarSize={30} animationDuration={450}
                    // Rounded ends only on the outside of the whole bar.
                    radius={visible.length === 1 ? 6 : i === 0 ? [6, 0, 0, 6] : i === visible.length - 1 ? [0, 6, 6, 0] : 0}
                  >
                    {/* The row's total, written once at the end of its bar. */}
                    {i === visible.length - 1 && <LabelList dataKey="shownTotal" position="right" formatter={(v: number) => num(v)} style={{ fontSize: 12.5, fontWeight: 700, fill: DS.ink }} />}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
