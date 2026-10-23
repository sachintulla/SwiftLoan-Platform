'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { StatCard, Card, TableSkeleton, Empty, StatusBadge, FilterChips } from '@/components/ui';
import { num, inr, timeAgo, dateTimeStr } from '@/lib/format';

interface PhoneInquiry {
  phone: string; name: string | null; inquiries: number; verifiedInquiries: number;
  distinctAmounts: number; latestAmount: number | null; lastInquiryAt: string; verified: boolean;
}
interface Overview {
  windowDays: number;
  totals: {
    totalInquiries: number; verifiedInquiries: number; unverifiedInquiries: number;
    uniqueInquirers: number; repeatInquirers: number; amountChangers: number;
  };
  perDay: { day: string; count: number }[];
  topInquirers: PhoneInquiry[];
  generatedAt: string;
}

const WINDOWS = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'Last year' },
];

export default function InquiriesPage() {
  const [days, setDays] = useState('90');
  const { data: res, isLoading } = useSWR(`/api/admin/inquiries/overview?days=${days}`, swrFetcher, { refreshInterval: 15000 });
  const data = res?.data as Overview | undefined;
  const t = data?.totals;
  const maxDay = Math.max(1, ...(data?.perDay ?? []).map((d) => d.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>Inquiries</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            Website “enter your details” submissions, keyed by phone. A returning customer with a new
            amount/name is a new inquiry. Verified = that phone completed OTP.
            {data?.generatedAt ? ` Updated ${timeAgo(data.generatedAt)}.` : ''}
          </div>
        </div>
        <FilterChips options={WINDOWS} value={days} onChange={setDays} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Total inquiries" value={num(t?.totalInquiries ?? 0)} icon="✎" tone="teal" />
        <StatCard label="Verified (OTP done)" value={num(t?.verifiedInquiries ?? 0)} icon="✓" tone="green" />
        <StatCard label="Unverified" value={num(t?.unverifiedInquiries ?? 0)} icon="•" tone="grey" />
        <StatCard label="Unique inquirers" value={num(t?.uniqueInquirers ?? 0)} icon="☺" tone="blue" />
        <StatCard label="Repeat inquirers" value={num(t?.repeatInquirers ?? 0)} icon="↻" tone="amber" foot="phones with >1 inquiry" />
        <StatCard label="Changed loan amount" value={num(t?.amountChangers ?? 0)} icon="₹" tone="amber" foot="phones with >1 distinct amount" />
      </div>

      <Card title="Inquiries per day (IST)">
        {isLoading ? <TableSkeleton rows={4} cols={2} /> : (data?.perDay.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.perDay.map((d) => (
              <div key={d.day} className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="muted" style={{ width: 92, fontSize: 12 }}>{d.day}</span>
                <div style={{ flex: 1, background: 'var(--line, #eee)', borderRadius: 4, height: 14 }}>
                  <div style={{ width: `${(d.count / maxDay) * 100}%`, background: 'var(--teal, #079FA0)', height: '100%', borderRadius: 4 }} />
                </div>
                <span style={{ width: 32, textAlign: 'right', fontWeight: 700 }}>{d.count}</span>
              </div>
            ))}
          </div>
        ) : <Empty label="No inquiries in this window." />)}
      </Card>

      <Card title="Inquirers (by phone)" sub="How many times each number inquired, and how often they changed the amount.">
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : data?.topInquirers.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Phone</th><th>Name</th><th>Inquiries</th><th>Verified</th><th>Distinct amounts</th><th>Latest amount</th><th>Last inquiry</th><th>Status</th></tr></thead>
              <tbody>
                {data.topInquirers.map((p) => (
                  <tr key={p.phone}>
                    <td style={{ fontFamily: 'var(--mono, monospace)' }}>{p.phone}</td>
                    <td>{p.name ?? '—'}</td>
                    <td style={{ fontWeight: 700 }}>{p.inquiries}</td>
                    <td className="muted">{p.verifiedInquiries}</td>
                    <td>{p.distinctAmounts}{p.distinctAmounts > 1 ? <span style={{ color: 'var(--amber, #b7791f)' }} title="Changed the loan amount across inquiries"> ↻</span> : null}</td>
                    <td>{p.latestAmount != null ? inr(p.latestAmount) : '—'}</td>
                    <td title={dateTimeStr(p.lastInquiryAt)}>{timeAgo(p.lastInquiryAt)}</td>
                    <td><StatusBadge status={p.verified ? 'converted' : 'anonymous'} label={p.verified ? 'verified' : 'unverified'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty label="No inquiries yet." />}
      </Card>
    </div>
  );
}
