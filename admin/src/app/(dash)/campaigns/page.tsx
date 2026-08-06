'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch, downloadFile } from '@/lib/api';
import { Card, StatusBadge, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { dateStr, num } from '@/lib/format';
import { Campaign, minutesToTime, daysLabel, tzAbbrev, zonedDateLabel } from '@/lib/campaign';

const FILTERS = [
  { key: '', label: 'All' }, { key: 'draft', label: 'Draft' }, { key: 'running', label: 'Running' },
  { key: 'paused', label: 'Paused' }, { key: 'completed', label: 'Completed' }, { key: 'failed', label: 'Failed' },
];

export default function CampaignsPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}) });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/campaigns?${qs.toString()}`, swrFetcher);

  // Defensive: the list may arrive as a bare array or nested under `campaigns`.
  const payload = data?.data as Campaign[] | { campaigns?: Campaign[] } | undefined;
  const rows: Campaign[] = Array.isArray(payload) ? payload : (payload?.campaigns ?? []);
  const pg = data?.pagination;

  // --- ops: calls export + provider reconciliation -------------------
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [opsMsg, setOpsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function exportCalls() {
    setExporting(true); setExportErr(''); setOpsMsg(null);
    try {
      await downloadFile('/api/admin/ops/export/calls.csv', `calls-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setExportErr((e as Error).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function reconcile() {
    setReconciling(true); setOpsMsg(null); setExportErr('');
    try {
      const res = await apiFetch<{ checked?: number; updated?: number; contactsReleased?: number }>('/api/admin/ops/reconcile-calls', { method: 'POST' });
      const d = res.data ?? {};
      setOpsMsg({
        ok: true,
        text: d.checked
          // These calls never got a terminal webhook, so they are closed as
          // failed with no outcome — say so rather than implying we learned
          // what happened on the line.
          ? `Closed ${d.updated ?? 0} stalled call(s) with no result; released ${d.contactsReleased ?? 0} contact(s) for retry.`
          : 'No stalled calls — nothing to reconcile.',
      });
      mutate();
    } catch (e) {
      setOpsMsg({ ok: false, text: (e as Error).message || 'Reconciliation failed' });
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="page">
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-sub">Scheduled outbound voice campaigns — set a window and cadence, upload a contact sheet, then dial.</p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn" disabled={exporting} onClick={exportCalls}>{exporting ? 'Exporting…' : '⭳ Export calls CSV'}</button>
          <button className="btn" disabled={reconciling} onClick={reconcile}>{reconciling ? 'Reconciling…' : '⟳ Reconcile calls'}</button>
          <button className="btn btn-primary" onClick={() => router.push('/campaigns/new')}>+ New campaign</button>
        </div>
      </div>

      {/* ops results — .card has no margin of its own */}
      {(opsMsg || exportErr) && (
        <div className="card card-pad" style={{ marginTop: 16, fontSize: 13, color: exportErr ? 'var(--red)' : opsMsg?.ok ? 'var(--green)' : 'var(--red)' }}>
          {exportErr || opsMsg?.text}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <FilterChips options={FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
        </div>
        {error ? (
          <div className="empty">Could not load campaigns — {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading ? <TableSkeleton cols={9} /> : rows.length === 0 ? (
          <Empty label={status ? 'No campaigns with this status' : 'No campaigns yet — create one to start calling'} />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Name</th><th>Code</th><th>Status</th><th>Type</th><th>Window</th><th>Agent</th>
              <th>Next run</th><th>Contacts</th><th>Called</th><th>Failed</th><th>Created</th>
            </tr></thead>
            <tbody>{rows.map((c) => {
              const tz = c.timezone || 'Asia/Kolkata';
              const from = minutesToTime(c.dailyStartMinute ?? null);
              const to = minutesToTime(c.dailyEndMinute ?? null);
              return (
                <tr key={c.id} onClick={() => router.push(`/campaigns/${c.id}`)}>
                  <td><b>{c.name}</b></td>
                  <td className="mono">{c.code}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{c.scheduleType === 'recurring' ? 'Recurring' : 'One-time'}</td>
                  <td style={{ fontSize: 12 }}>
                    {from && to ? <><span className="mono">{from}–{to}</span> {tzAbbrev(tz)}<div className="muted">{daysLabel(c.daysOfWeek)}</div></> : <span className="muted">—</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{c.assistantName || (c.assistantId ? <span className="mono">{c.assistantId}</span> : <span className="muted">—</span>)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{c.nextRunAt ? zonedDateLabel(c.nextRunAt, tz) : c.startAt ? zonedDateLabel(c.startAt, tz) : '—'}</td>
                  <td className="mono">{num(c.totalContacts)}</td>
                  <td className="mono">{num(c.calledContacts)}</td>
                  <td className="mono" style={{ color: c.failedContacts ? 'var(--red)' : undefined }}>{num(c.failedContacts)}</td>
                  <td className="muted">{dateStr(c.createdAt)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
      </div>
    </div>
  );
}
