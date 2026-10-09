'use client';
import { Fragment, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatCard, StatusBadge, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { num, dateStr, timeAgo } from '@/lib/format';

interface RevasureLead {
  id: string;
  applicationId: string | null;
  userId: string | null;
  sourceLeadId: string | null;
  basketId: string | null;
  status: string;
  httpStatus: number | null;
  leadId: string | null;
  message: string | null;
  requestBody: unknown;
  responseBody: unknown;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Payload {
  rows: RevasureLead[];
  byStatus: { status: string; count: number }[];
}

// Revasure lead status → the admin tone palette (global convention):
//   success = green, duplicate = teal, ineligible/failed = red, pending = amber.
// StatusBadge derives its colour from statusTone(status), so map each raw status
// to a tone-carrying keyword and keep the human label — exactly how the downloads
// page renders context/organic badges.
const STATUS_BADGE: Record<string, { tone: string; label: string }> = {
  success: { tone: 'approved', label: 'Success' },
  duplicate: { tone: 'converted', label: 'Duplicate' },
  ineligible: { tone: 'rejected', label: 'Ineligible' },
  failed: { tone: 'failed', label: 'Failed' },
  pending: { tone: 'pending', label: 'Pending' },
};

function RevasureStatus({ status }: { status: string }) {
  const m = STATUS_BADGE[status] ?? { tone: status, label: status };
  return <StatusBadge status={m.tone} label={m.label} />;
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'success', label: 'Success' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'ineligible', label: 'Ineligible' },
  { key: 'failed', label: 'Failed' },
  { key: 'pending', label: 'Pending' },
];

function pretty(v: unknown): string {
  if (v == null) return '—';
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

export default function RevasurePage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [open, setOpen] = useState<string | null>(null);

  const q = status ? `&status=${status}` : '';
  const { data, isLoading } = useSWR(`/api/admin/revasure?page=${page}&pageSize=20${q}`, swrFetcher);
  const p = data?.data as Payload | undefined;
  const pg = data?.pagination;

  const count = (s: string) => p?.byStatus.find((b) => b.status === s)?.count ?? 0;

  return (
    <div className="page">
      <h1 className="page-title">Revasure Leads</h1>
      <p className="page-sub">Leads pushed to Revasure (fired in parallel at prequalify) with the recorded request / response.</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', marginTop: 16 }}>
        <StatCard label="Success" value={num(count('success'))} icon="✓" tone="green" />
        <StatCard label="Duplicate" value={num(count('duplicate'))} icon="⇋" tone="teal" />
        <StatCard label="Ineligible" value={num(count('ineligible'))} icon="∅" tone="red" />
        <StatCard label="Failed" value={num(count('failed'))} icon="⚠" tone="red" />
        <StatCard label="Pending" value={num(count('pending'))} icon="⋯" tone="amber" />
      </div>

      <Card title="Leads" right={
        <FilterChips options={STATUS_FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1); setOpen(null); }} />
      }>
        {isLoading ? <TableSkeleton /> : !p || p.rows.length === 0 ? <Empty /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Source Lead ID</th><th>Revasure Lead ID</th><th>Status</th><th>HTTP</th><th>Message</th><th>Updated</th><th></th></tr></thead>
            <tbody>{p.rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td className="mono muted">{r.sourceLeadId || '—'}</td>
                  <td className="mono">{r.leadId || '—'}</td>
                  <td><RevasureStatus status={r.status} /></td>
                  <td className="mono muted">{r.httpStatus ?? '—'}</td>
                  <td className="muted" style={{ maxWidth: 260 }}>{r.message || r.lastError || '—'}</td>
                  <td className="muted" title={dateStr(r.updatedAt)}>{timeAgo(r.updatedAt)}</td>
                  <td>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 9px' }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                      {open === r.id ? 'Hide' : 'View'}
                    </button>
                  </td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--surface-2, var(--bg))' }}>
                      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start', padding: '4px 2px' }}>
                        <div>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Request body</div>
                          <pre className="mono" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 320, overflow: 'auto' }}>{pretty(r.requestBody)}</pre>
                        </div>
                        <div>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Response body</div>
                          <pre className="mono" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 320, overflow: 'auto' }}>{pretty(r.responseBody)}</pre>
                        </div>
                      </div>
                      {r.lastError && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Last error: <span style={{ color: 'var(--red)' }}>{r.lastError}</span></div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
