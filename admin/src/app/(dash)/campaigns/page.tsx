'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch, downloadFile } from '@/lib/api';
import { Card, StatusBadge, FilterChips, Pagination, TableSkeleton, Callout } from '@/components/ui';
import { dateStr, num } from '@/lib/format';
import { Campaign, minutesToTime, daysLabel, tzAbbrev, zonedDateLabel } from '@/lib/campaign';

const FILTERS = [
  { key: '', label: 'All' }, { key: 'draft', label: 'Draft' }, { key: 'running', label: 'Running' },
  { key: 'paused', label: 'Paused' }, { key: 'completed', label: 'Completed' }, { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
  // Not a real CampaignStatus — see the `deleted=true` query param below,
  // which the backend treats as its own orthogonal filter (soft-deleted
  // campaigns are hidden from every other tab, including "All").
  { key: 'deleted', label: 'Deleted' },
];

export default function CampaignsPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const viewingDeleted = status === 'deleted';
  const qs = new URLSearchParams({
    page: String(page), pageSize: '20',
    ...(viewingDeleted ? { deleted: 'true' } : status ? { status } : {}),
  });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/campaigns?${qs.toString()}`, swrFetcher);

  const [restoringId, setRestoringId] = useState<string | null>(null);
  async function restore(id: string) {
    setRestoringId(id);
    try {
      await apiFetch(`/api/admin/campaigns/${id}/restore`, { method: 'POST' });
      mutate();
    } finally {
      setRestoringId(null);
    }
  }

  // Defensive: the list may arrive as a bare array or nested under `campaigns`.
  const payload = data?.data as Campaign[] | { campaigns?: Campaign[] } | undefined;
  const rows: Campaign[] = Array.isArray(payload) ? payload : (payload?.campaigns ?? []);
  const pg = data?.pagination;

  // --- ops: calls export -------------------------------------------------
  const [exporting, setExporting] = useState(false);
  const [opsMsg, setOpsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function exportCalls() {
    setExporting(true); setOpsMsg(null);
    try {
      await downloadFile('/api/admin/ops/export/calls.csv', `calls-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setOpsMsg({ ok: false, text: (e as Error).message || 'Export failed' });
    } finally {
      setExporting(false);
    }
  }

  // --- stop a single campaign straight from the list -------------------
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  async function stopOne(id: string) {
    setStoppingId(id); setOpsMsg(null);
    try {
      const res = await apiFetch<{ elloSideNotCancelled?: boolean }>(`/api/admin/campaigns/${id}/cancel`, { method: 'POST' });
      setOpsMsg({ ok: true, text: (res.data as { elloSideNotCancelled?: boolean } | undefined)?.elloSideNotCancelled
        ? 'Campaign stopped — it was on Ello, so also cancel it on Ello\'s dashboard.'
        : 'Campaign stopped and upcoming calls cancelled.' });
      mutate();
    } catch (e) {
      setOpsMsg({ ok: false, text: (e as Error).message || 'Could not stop the campaign' });
    } finally { setStoppingId(null); setConfirmStopId(null); }
  }
  const stopTarget = confirmStopId ? rows.find((r) => r.id === confirmStopId) : null;

  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 12 }}>
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-sub">Scheduled outbound voice campaigns — set a window and cadence, upload a contact sheet, then dial.</p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn" disabled={exporting} onClick={exportCalls}>{exporting ? 'Exporting…' : 'Export calls CSV'}</button>
          <button className="btn btn-primary" onClick={() => router.push('/campaigns/new')}>+ New campaign</button>
        </div>
      </div>

      {stopTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => !stoppingId && setConfirmStopId(null)}
        >
          <div className="card card-pad" style={{ width: '100%', maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title">Stop “{stopTarget.name}”?</h3>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, marginBottom: 20 }}>
              This stops the campaign and <b>cancels its upcoming calls</b> that haven&apos;t been placed yet. Calls already made are kept. This can&apos;t be undone.
            </div>
            <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" disabled={!!stoppingId} onClick={() => setConfirmStopId(null)}>Keep running</button>
              <button className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} disabled={!!stoppingId} onClick={() => stopOne(stopTarget.id)}>
                {stoppingId ? 'Stopping…' : 'Stop campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {opsMsg && <Callout tone={opsMsg.ok ? 'blue' : 'red'}>{opsMsg.text}</Callout>}

      <div style={{ marginTop: 16 }}>
      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <FilterChips options={FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          {!isLoading && !error && rows.length > 0 && (
            <span className="muted" style={{ fontSize: 12.5 }}>
              {num(pg?.total ?? rows.length)} campaign{(pg?.total ?? rows.length) === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {error ? (
          <div className="empty">Could not load campaigns — {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading ? <TableSkeleton cols={8} /> : rows.length === 0 ? (
          // An empty list is the first thing a new operator sees, so it says
          // what to do next rather than only that there is nothing here.
          <div className="empty-state">
            <h3>{viewingDeleted ? 'No deleted campaigns' : status ? `No ${status} campaigns` : 'No campaigns yet'}</h3>
            <p>
              {viewingDeleted ? 'Deleted campaigns show up here and can be restored.'
                : status ? 'Nothing has this status right now — try another filter.'
                : 'A campaign dials a list of contacts inside a calling window you set. Create one, upload a contact sheet, then start dialling.'}
            </p>
            {!viewingDeleted && !status && (
              <button className="btn btn-primary" onClick={() => router.push('/campaigns/new')}>+ New campaign</button>
            )}
          </div>
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Campaign</th><th>Status</th><th>Schedule</th><th>Agent</th>
              <th>Next run</th><th>Progress</th><th>Created</th><th></th>
            </tr></thead>
            <tbody>{rows.map((c) => {
              const tz = c.timezone || 'Asia/Kolkata';
              const from = minutesToTime(c.dailyStartMinute ?? null);
              const to = minutesToTime(c.dailyEndMinute ?? null);
              const total = c.totalContacts ?? 0;
              const called = c.calledContacts ?? 0;
              const failed = c.failedContacts ?? 0;
              const pctDone = total ? Math.round((called / total) * 100) : 0;
              return (
                <tr key={c.id} onClick={() => router.push(`/campaigns/${c.id}`)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="mono muted" style={{ fontSize: 11.5 }}>{c.code}</div>
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  {/* type + window + days were three columns saying one thing */}
                  <td style={{ fontSize: 12 }}>
                    <div>{c.scheduleType === 'recurring' ? 'Recurring' : 'One-time'}</div>
                    <div className="muted">
                      {from && to ? <><span className="mono">{from}–{to}</span> {tzAbbrev(tz)} · {daysLabel(c.daysOfWeek)}</> : 'no window set'}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>{c.assistantName || (c.assistantId ? <span className="mono">{c.assistantId}</span> : <span className="muted">—</span>)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{c.nextRunAt ? zonedDateLabel(c.nextRunAt, tz) : c.startAt ? zonedDateLabel(c.startAt, tz) : '—'}</td>
                  {/* contacts / called / failed read as one thing: how far along */}
                  <td style={{ minWidth: 150 }}>
                    {total ? (
                      <>
                        <div className="mini-bar" title={`${called} of ${total} called`}>
                          <span style={{ width: `${pctDone}%` }} />
                        </div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                          <span className="mono">{num(called)}</span> of <span className="mono">{num(total)}</span> called
                          {failed > 0 && <span style={{ color: 'var(--red)' }}> · {num(failed)} failed</span>}
                        </div>
                      </>
                    ) : <span className="muted" style={{ fontSize: 12 }}>no contacts</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{dateStr(c.createdAt)}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {(c.status === 'running' || c.status === 'paused') && (
                      <button
                        className="btn"
                        style={{ color: 'var(--red)', borderColor: 'var(--red)', padding: '3px 10px', fontSize: 11.5 }}
                        disabled={stoppingId === c.id}
                        title="Stop this campaign and cancel its upcoming calls"
                        onClick={() => setConfirmStopId(c.id)}
                      >
                        {stoppingId === c.id ? 'Stopping…' : 'Stop'}
                      </button>
                    )}
                    {viewingDeleted && (
                      <button className="btn" style={{ padding: '3px 10px', fontSize: 11.5 }} disabled={restoringId === c.id} onClick={() => restore(c.id)}>
                        {restoringId === c.id ? '…' : '↺ Restore'}
                      </button>
                    )}
                  </td>
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
