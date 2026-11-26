'use client';
// Dashboard: the pie beside the lender chart. Over the three lenders together: got offers, no offers, rejected.
// Numbers: GET /api/admin/dashboard/partners -> overall (all time). Hover a slice or a row to light it up.
import React, { useState } from 'react';
import useSWR from 'swr';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { swrFetcher } from '@/lib/api';
import { Card, Callout, TableSkeleton } from '@/components/ui';
import { num } from '@/lib/format';
import './outcomePie.css';
import { DS } from '@/lib/palette';

type Lender = 'aurix' | 'yubi' | 'revasure';
interface Slice { key: 'gotOffers' | 'noOffers' | 'rejected'; label: string; count: number; pct: number; byLender: Record<Lender, number> }
interface Payload { overall: { total: number; slices: Slice[] } }

// Same family as the charts beside it: mint for offers, slate greys for the two "no" outcomes.
const COLOR: Record<Slice['key'], string> = { gotOffers: DS.green400, noOffers: DS.muted, rejected: DS.ink2 };
const LENDER_NAME: Record<Lender, string> = { aurix: 'Aurix', yubi: 'Yubi', revasure: 'Revasure' };
const split = (s: Slice) => (Object.keys(LENDER_NAME) as Lender[]).filter((l) => s.byLender[l] > 0).map((l) => `${LENDER_NAME[l]} ${num(s.byLender[l])}`).join(' · ');

function Tip({ active, payload, total }: { active?: boolean; payload?: { payload: Slice }[]; total: number }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="op-tip"><b>{s.label}</b><span>{num(s.count)} of {num(total)} · {s.pct}%</span><span>{split(s)}</span></div>
  );
}

export default function OutcomePie() {
  const { data, error, mutate } = useSWR('/api/admin/dashboard/partners', swrFetcher, { refreshInterval: 60_000 });
  const o = (data?.data as Payload | undefined)?.overall;
  const [hot, setHot] = useState<string | null>(null);
  return (
    <Card title="Overall outcome">
      {error && !o ? (
        <Callout tone="red">Could not load the chart. <button className="adm-link-btn" onClick={() => mutate()}>Retry</button></Callout>
      ) : !o ? (
        <TableSkeleton rows={5} cols={2} />
      ) : o.total === 0 ? (
        <div className="op-empty">Nothing decided yet.</div>
      ) : (
        <>
          <div className="op-chart">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={o.slices} dataKey="count" nameKey="label" innerRadius={62} outerRadius={98}
                  // A very small slice still gets a sliver so it can be seen and hovered.
                  minAngle={4} paddingAngle={1.5} stroke="none" startAngle={90} endAngle={-270} animationDuration={500}
                  onMouseEnter={(_, i) => setHot(o.slices[i]?.key ?? null)} onMouseLeave={() => setHot(null)}
                >
                  {o.slices.map((s) => <Cell key={s.key} fill={COLOR[s.key]} opacity={hot && hot !== s.key ? 0.35 : 1} />)}
                </Pie>
                <Tooltip content={<Tip total={o.total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="op-centre" aria-hidden><b>{num(o.total)}</b><span>decided</span></div>
          </div>
          <ul className="op-legend">
            {o.slices.map((s) => (
              <li key={s.key} className={hot && hot !== s.key ? 'dim' : ''} onMouseEnter={() => setHot(s.key)} onMouseLeave={() => setHot(null)}>
                <span className="op-dot" style={{ background: COLOR[s.key] }} />
                <span className="op-name"><b>{s.label}</b><span>{split(s) || 'None'}</span></span>
                <b className="op-count">{num(s.count)}</b>
                <em>{s.pct}%</em>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
