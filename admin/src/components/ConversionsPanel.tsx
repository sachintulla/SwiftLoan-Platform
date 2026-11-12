'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card } from '@/components/ui';
import { num, inrCompact } from '@/lib/format';

/**
 * Shared "Conversions & Commercials" strip, scoped to a date range.
 *
 * Shows total customers, the lead requested amount (commercials of the website
 * enquiries), and the four conversion buckets — Application submitted, In
 * review, Approved, Rejected — each in numbers and as a % of total customers.
 * Reused on the Analytics page and on Loan Pipeline / Yubi / Revasure, where it
 * follows that page's own date filter. Pass from/to as ISO instants (or omit for
 * all time).
 */
export interface ConversionsData {
  base: number;
  totalCustomers: number;
  totalApplications: number;
  leadCommercials: { amount: number; count: number };
  conversions: {
    submitted: { count: number; pct: number };
    inReview: { count: number; pct: number };
    approved: { count: number; pct: number };
    rejected: { count: number; pct: number };
  };
}

interface Props {
  from?: string;
  to?: string;
  title?: string;
  sub?: string;
}

const CONV: { key: keyof ConversionsData['conversions']; label: string; tone: string }[] = [
  { key: 'submitted', label: 'Application submitted', tone: 'blue' },
  { key: 'inReview', label: 'In review', tone: 'amber' },
  { key: 'approved', label: 'Approved', tone: 'green' },
  { key: 'rejected', label: 'Rejected', tone: 'red' },
];

export default function ConversionsPanel({ from, to, title = 'Conversions & Commercials', sub }: Props) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const { data, error, isLoading } = useSWR(`/api/admin/analytics/conversions?${qs.toString()}`, swrFetcher, { refreshInterval: 60_000, keepPreviousData: true });
  const d = data?.data as ConversionsData | undefined;

  return (
    <Card title={title} sub={sub ?? 'Conversions are measured against total customers in the selected range.'}>
      {error ? (
        <p className="muted" style={{ margin: 0 }}>Analytics are unavailable right now.</p>
      ) : (
        <>
          <div className="stat-strip" style={{ marginBottom: 12 }}>
            <Tile label="Total customers" value={d ? num(d.totalCustomers) : '—'} foot="the people we got" />
            <Tile label="Lead commercials" value={d ? inrCompact(d.leadCommercials.amount) : '—'} foot={d ? `across ${num(d.leadCommercials.count)} lead${d.leadCommercials.count === 1 ? '' : 's'}` : undefined} tone="teal" />
            <Tile label="Applications" value={d ? num(d.totalApplications) : '—'} foot="started in range" />
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            {CONV.map((c) => {
              const v = d?.conversions[c.key];
              return (
                <div key={c.key} className="card card-pad" style={{ padding: '12px 14px', borderTop: `3px solid var(--${c.tone})` }}>
                  <div className="muted" style={{ fontSize: 12 }}>{c.label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: `var(--${c.tone})` }}>{v ? num(v.count) : '—'}</span>
                    <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{v ? `${v.pct}%` : ''}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>of total customers</div>
                </div>
              );
            })}
          </div>
          {isLoading && !d && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Loading…</div>}
        </>
      )}
    </Card>
  );
}

function Tile({ label, value, foot, tone }: { label: string; value: string; foot?: string; tone?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}
