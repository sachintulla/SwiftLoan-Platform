'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, LoanStatusBadge, StatusBadge, TableSkeleton, Empty } from '@/components/ui';
import { num, inr, inrCompact, dateTimeStr } from '@/lib/format';

/**
 * Shared "Conversions & Commercials" strip, scoped to a date range.
 *
 * Shows total customers, the lead requested amount, and the four conversion
 * buckets — Application submitted, In review, Approved, Rejected — each in
 * numbers and as a % of total customers. Every tile is a button: selecting one
 * highlights it and lists the records behind it (customer names, application
 * worth, status, date) below. Reused on Analytics, Master Overview, Customers,
 * Loan Pipeline, Yubi and Revasure; pass from/to as ISO instants.
 */
export interface ConversionsData {
  base: number;
  totalCustomers: number;
  totalApplications: number;
  totalApplicationsAmount: number;
  leadCommercials: { amount: number; count: number };
  conversions: Record<'submitted' | 'inReview' | 'approved' | 'rejected', { count: number; pct: number; amount: number }>;
}

type Bucket = 'customers' | 'leads' | 'all' | 'submitted' | 'inReview' | 'approved' | 'rejected';

interface Props { from?: string; to?: string; title?: string; sub?: string }

const CONV: { key: 'submitted' | 'inReview' | 'approved' | 'rejected'; label: string; tone: string }[] = [
  { key: 'submitted', label: 'Application submitted', tone: 'blue' },
  { key: 'inReview', label: 'In review', tone: 'amber' },
  { key: 'approved', label: 'Approved', tone: 'green' },
  { key: 'rejected', label: 'Rejected', tone: 'red' },
];

export default function ConversionsPanel({ from, to, title = 'Conversions & Commercials', sub }: Props) {
  const [selected, setSelected] = useState<Bucket | null>(null);
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const { data, error } = useSWR(`/api/admin/analytics/conversions?${qs.toString()}`, swrFetcher, { refreshInterval: 60_000, keepPreviousData: true });
  const d = data?.data as ConversionsData | undefined;

  const toggle = (b: Bucket) => setSelected((cur) => (cur === b ? null : b));

  return (
    <Card title={title} sub={sub ?? 'Conversions are measured against total customers in the selected range. Select any tile to see the records behind it.'}>
      {error ? (
        <p className="muted" style={{ margin: 0 }}>Analytics are unavailable right now.</p>
      ) : (
        <>
          <div className="cv-kpis">
            <TileBtn label="Total customers" value={d ? num(d.totalCustomers) : '—'} foot="the people we got" selected={selected === 'customers'} onClick={() => toggle('customers')} />
            <TileBtn label="Lead commercials" value={d ? inrCompact(d.leadCommercials.amount) : '—'} foot={d ? `across ${num(d.leadCommercials.count)} lead${d.leadCommercials.count === 1 ? '' : 's'}` : undefined} tone="teal" selected={selected === 'leads'} onClick={() => toggle('leads')} />
            <TileBtn label="Applications" value={d ? num(d.totalApplications) : '—'} foot={d ? `${inrCompact(d.totalApplicationsAmount)} worth` : 'started in range'} selected={selected === 'all'} onClick={() => toggle('all')} />
          </div>
          <div className="cv-tiles">
            {CONV.map((c) => {
              const v = d?.conversions[c.key];
              const on = selected === c.key;
              return (
                <button
                  key={c.key} type="button" onClick={() => toggle(c.key)} aria-pressed={on}
                  className={`cv-tile ${on ? 'on' : ''}`}
                  style={{ ['--cv' as string]: `var(--${c.tone})`, ['--cv-bg' as string]: `var(--${c.tone}-bg)` } as React.CSSProperties}
                >
                  <div className="cv-label">{c.label}</div>
                  <div className="cv-head">
                    <span className="cv-value" style={{ marginTop: 0, color: `var(--${c.tone})` }}>{v ? num(v.count) : '—'}</span>
                    {v && <span className="cv-pct">{v.pct}%</span>}
                  </div>
                  {/* The bar is the same % as the chip, drawn (and capped at the full width). */}
                  <div className="cv-meter"><span style={{ width: `${Math.max(0, Math.min(100, v?.pct ?? 0))}%` }} /></div>
                  <div className="cv-worth">{v ? `${inrCompact(v.amount)} worth` : ''}</div>
                  <div className="cv-foot" style={{ marginTop: 1 }}>of total customers{on ? ' · showing below' : ''}</div>
                </button>
              );
            })}
          </div>

          {selected && <DetailList bucket={selected} from={from} to={to} onClose={() => setSelected(null)} />}
        </>
      )}
    </Card>
  );
}

function TileBtn({ label, value, foot, tone, selected, onClick }: { label: string; value: string; foot?: string; tone?: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`cv-kpi ${selected ? 'on' : ''}`}>
      <div className="cv-label">{label}</div>
      <div className="cv-value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {foot && <div className="cv-foot">{foot}{selected ? ' · showing below' : ''}</div>}
    </button>
  );
}

const BUCKET_TITLE: Record<Bucket, string> = {
  customers: 'Customers', leads: 'Website leads', all: 'All applications',
  submitted: 'Applications submitted', inReview: 'Applications in review', approved: 'Approved applications', rejected: 'Rejected applications',
};

function DetailList({ bucket, from, to, onClose }: { bucket: Bucket; from?: string; to?: string; onClose: () => void }) {
  const qs = new URLSearchParams({ bucket, page: '1', pageSize: '25' });
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const { data, isLoading } = useSWR(`/api/admin/analytics/conversions/list?${qs.toString()}`, swrFetcher, { keepPreviousData: true });
  const payload = data?.data as { kind: string; rows: any[] } | undefined;
  const pg = data?.pagination;
  const rows = payload?.rows ?? [];

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 14 }}>{BUCKET_TITLE[bucket]}{pg ? ` · ${num(pg.total)}` : ''}</h4>
        <button type="button" className="btn" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={onClose}>Close</button>
      </div>
      {isLoading && !payload ? (
        <TableSkeleton rows={5} cols={4} />
      ) : rows.length === 0 ? (
        <Empty label="No records in this range." />
      ) : (
        <div className="table-wrap">
          {payload?.kind === 'customers' ? (
            <table className="data">
              <thead><tr><th>Customer</th><th>Phone</th><th>Stage</th><th>First seen</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/customers/${r.id}`} className="adm-ref">{r.name || 'Unnamed'}</Link></td>
                  <td className="mono">{r.phone || '—'}</td>
                  <td><StatusBadge status={r.stage} /></td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateTimeStr(r.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : payload?.kind === 'leads' ? (
            <table className="data">
              <thead><tr><th>Lead</th><th>Phone</th><th>Requested</th><th>Interest</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name || 'Unnamed'}</td>
                  <td className="mono">{r.phone || '—'}</td>
                  <td className="mono">{r.amount ? inr(r.amount) : '—'}</td>
                  <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.productInterest || '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateTimeStr(r.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <table className="data">
              <thead><tr><th>Ref</th><th>Customer</th><th>Phone</th><th>Amount</th><th>Type</th><th>Status</th><th>Applied</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/loans/${r.id}`} className="mono adm-ref">{r.ref}</Link></td>
                  <td>{r.name || '—'}</td>
                  <td className="mono">{r.phone || '—'}</td>
                  <td className="mono">{r.amount ? inr(r.amount) : '—'}</td>
                  <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.loanType}</td>
                  <td><LoanStatusBadge status={r.status} /></td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateTimeStr(r.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {pg && pg.total > rows.length && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Showing the first {num(rows.length)} of {num(pg.total)}. Use the page filters to narrow the range.</p>
          )}
        </div>
      )}
    </div>
  );
}
