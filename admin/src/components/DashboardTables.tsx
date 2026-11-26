'use client';
// Dashboard: the two tables under the charts.
//   Left  - "Active today": who did something today, what they did last, when, and their status.
//   Right - "Where users are now": the share of all customers at each stage (narrow, with a small bar).
// Numbers: GET /api/admin/dashboard/active-today and GET /api/admin/customers/statuses.
import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, Callout, TableSkeleton } from '@/components/ui';
import { num, timeAgo } from '@/lib/format';
import { eventLabel } from '@/lib/eventLabels';
import './dashboardTables.css';

interface ActiveRow { id: string; name: string | null; phone: string | null; action: string | null; channel: string | null; at: string; status: { key: string; label: string; tone: string } | null }
interface ActivePayload { total: number; rows: ActiveRow[] }
interface StatusCount { key: string; label: string; tone: string; count: number }

/** "11:37 am" in India time, so it reads the same wherever the admin is opened. */
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

function ActiveToday() {
  const { data, error, mutate } = useSWR('/api/admin/dashboard/active-today?limit=25', swrFetcher, { refreshInterval: 30_000 });
  const p = data?.data as ActivePayload | undefined;
  return (
    <Card title="Active today" right={p ? <Link href="/customers?active=today" className="dt-link">All {num(p.total)} →</Link> : undefined}>
      {error && !p ? (
        <Callout tone="red">Could not load the list. <button className="adm-link-btn" onClick={() => mutate()}>Retry</button></Callout>
      ) : !p ? (
        <TableSkeleton rows={8} cols={4} />
      ) : p.rows.length === 0 ? (
        <div className="dt-empty">Nobody has been active yet today.</div>
      ) : (
        <div className="dt-scroll">
          <table className="data dt-table">
            <thead><tr><th>Name</th><th>What they did</th><th>When</th><th>Status</th></tr></thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/customers/${r.id}`} className="dt-name">{r.name || 'No name yet'}</Link>
                    <div className="dt-sub mono">{r.phone || ''}</div>
                  </td>
                  <td>
                    {r.action ? eventLabel(r.action) : 'Opened the app'}
                    {r.channel === 'website' && <span className="dt-sub"> · website</span>}
                  </td>
                  <td title={new Date(r.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
                    {clock(r.at)}
                    <div className="dt-sub">{timeAgo(r.at)}</div>
                  </td>
                  <td>{r.status ? <span className={`badge tone-${r.status.tone}`}>{r.status.label}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function WhereUsersAre() {
  const { data, error, mutate } = useSWR('/api/admin/customers/statuses', swrFetcher, { refreshInterval: 60_000 });
  const all = data?.data as StatusCount[] | undefined;
  const rows = (all ?? []).filter((s) => s.count > 0);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card title="Where users are now">
      {error && !all ? (
        <Callout tone="red">Could not load the stages. <button className="adm-link-btn" onClick={() => mutate()}>Retry</button></Callout>
      ) : !all ? (
        <TableSkeleton rows={8} cols={2} />
      ) : total === 0 ? (
        <div className="dt-empty">No customers yet.</div>
      ) : (
        <>
          <table className="dt-stages">
            <tbody>
              {rows.map((r) => {
                const pct = Math.round((r.count / total) * 1000) / 10;
                return (
                  <tr key={r.key} title={`${r.label}: ${num(r.count)} of ${num(total)}`}>
                    <td className="dt-stage">
                      <Link href={`/customers?status=${r.key}`}>{r.label}</Link>
                      <span className="dt-bar" aria-hidden><span className={`tone-fill-${r.tone}`} style={{ width: `${Math.max((r.count / top) * 100, 1.5)}%` }} /></span>
                    </td>
                    <td className="dt-pct"><b>{pct}%</b><span>{num(r.count)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="dt-foot">{num(total)} customers in all</p>
        </>
      )}
    </Card>
  );
}

export default function DashboardTables() {
  return (
    <div className="dash-tables">
      <ActiveToday />
      <WhereUsersAre />
    </div>
  );
}
