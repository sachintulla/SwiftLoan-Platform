'use client';
import { useMemo, useState } from 'react';
import { FilterChips } from '@/components/ui';
import ConversionsPanel from '@/components/ConversionsPanel';

/**
 * Conversions & Commercials analytics. Total customers, the lead requested
 * amount (commercials), and the conversion funnel (Application submitted / In
 * review / Approved / Rejected) in numbers and as a % of total customers —
 * scoped to a date range. The same ConversionsPanel also sits on Loan Pipeline,
 * Yubi and Revasure, following each page's own date filter.
 */
type Period = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Date range' },
];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

function computeRange(period: Period, cFrom: string, cTo: string): { from?: string; to?: string } {
  const now = new Date();
  if (period === 'all') return {};
  if (period === 'today') return { from: startOfDay(now).toISOString(), to: now.toISOString() };
  if (period === 'yesterday') {
    const s = startOfDay(now); const y = new Date(s); y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: s.toISOString() };
  }
  if (period === '7d') { const f = new Date(now); f.setDate(f.getDate() - 7); return { from: f.toISOString(), to: now.toISOString() }; }
  if (period === '30d') { const f = new Date(now); f.setDate(f.getDate() - 30); return { from: f.toISOString(), to: now.toISOString() }; }
  const out: { from?: string; to?: string } = {};
  if (cFrom) out.from = new Date(`${cFrom}T00:00:00`).toISOString();
  if (cTo) out.to = new Date(`${cTo}T23:59:59.999`).toISOString();
  return out;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const range = useMemo(() => computeRange(period, cFrom, cTo), [period, cFrom, cTo]);

  return (
    <div className="page">
      <h1 className="page-title">Conversions &amp; Commercials</h1>
      <p className="page-sub">How the customers we got convert through the funnel, and the loan value they came in asking for — filterable by date.</p>

      <div style={{ margin: '14px 0' }}>
        <FilterChips options={PERIODS} value={period} onChange={(v) => setPeriod(v as Period)} />
        {period === 'custom' && (
          <div className="row wrap" style={{ gap: 12, marginTop: 10, alignItems: 'center' }}>
            <label className="muted" style={{ fontSize: 13 }}>From&nbsp;
              <input type="date" value={cFrom} max={cTo || undefined} onChange={(e) => setCFrom(e.target.value)} className="input" />
            </label>
            <label className="muted" style={{ fontSize: 13 }}>To&nbsp;
              <input type="date" value={cTo} min={cFrom || undefined} onChange={(e) => setCTo(e.target.value)} className="input" />
            </label>
          </div>
        )}
      </div>

      <ConversionsPanel from={range.from} to={range.to} sub="Conversion percentages are out of total customers in the selected range. Commercials = total loan amount requested across website leads." />
    </div>
  );
}
