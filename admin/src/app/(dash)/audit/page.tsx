'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, ApiError, getAdmin } from '@/lib/api';
import { Card, FilterChips, Pagination, TableSkeleton, Empty, SearchBox } from '@/components/ui';
import { timeAgo, num } from '@/lib/format';

interface AuditEntry {
  id: string;
  adminEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  ip: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
}

function statusColor(s: number | null) {
  if (s == null) return undefined;
  if (s >= 500) return 'var(--red)';
  if (s >= 400) return 'var(--amber)';
  return 'var(--green)';
}

export default function AuditPage() {
  const role = getAdmin()?.role;

  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [adminId, setAdminId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const qs = new URLSearchParams({
    page: String(page), pageSize: '25',
    ...(action ? { action } : {}), ...(entity ? { entity } : {}),
    ...(adminId ? { adminId } : {}), ...(entityId ? { entityId } : {}),
  });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/ops/audit?${qs.toString()}`, swrFetcher);

  // A 403 from the API is the authority; the local role only hides the nav entry.
  const forbidden = error instanceof ApiError && error.status === 403;

  // Defensive: entries live under data.entries, but tolerate a bare array.
  const payload = data?.data as
    | AuditEntry[]
    | { entries?: AuditEntry[]; actions?: { action: string; count: number }[] }
    | undefined;
  const entries: AuditEntry[] = Array.isArray(payload) ? payload : (Array.isArray(payload?.entries) ? payload!.entries! : []);
  const actionFacets = (!Array.isArray(payload) && Array.isArray(payload?.actions) ? payload!.actions! : [])
    .filter((a) => a && typeof a.action === 'string');
  const pg = data?.pagination;

  const chipOptions = [
    { key: '', label: 'All actions' },
    ...actionFacets.map((a) => ({ key: a.action, label: `${a.action} (${num(a.count)})` })),
  ];

  if (forbidden || (role && role !== 'super_admin')) {
    return (
      <div className="page">
        <h1 className="page-title">Audit Log</h1>
        <div style={{ marginTop: 16 }}>
          <Card>
            <div className="empty">
              <b>super_admin only</b>
              <p style={{ marginTop: 8, maxWidth: 460, marginInline: 'auto' }}>
                The audit log records every administrative action, so it is restricted to super admins.
                {role ? <> Your role is <span className="mono">{role}</span>.</> : null} Ask a super admin if you need access.
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Audit Log</h1>
      <p className="page-sub">Every administrative action, who took it, and what it touched.</p>

      <div style={{ marginTop: 16 }}>
        <Card>
          <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
            <FilterChips options={chipOptions} value={action} onChange={(v) => { setAction(v); setPage(1); }} />
            <div className="row wrap between" style={{ gap: 12 }}>
              <div className="row wrap" style={{ gap: 10 }}>
                <SearchBox value={entity} onChange={(v) => { setEntity(v); setPage(1); }} placeholder="Entity (e.g. campaign)" />
                <SearchBox value={entityId} onChange={(v) => { setEntityId(v); setPage(1); }} placeholder="Entity ID…" />
                <SearchBox value={adminId} onChange={(v) => { setAdminId(v); setPage(1); }} placeholder="Admin ID…" />
              </div>
              <button className="btn" onClick={() => { setAction(''); setEntity(''); setEntityId(''); setAdminId(''); setPage(1); }}>
                Clear filters
              </button>
            </div>
          </div>

          {error ? (
            <div className="empty">
              Could not load the audit log — {(error as Error).message}
              <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
            </div>
          ) : isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : entries.length === 0 ? (
            <Empty label="No audit entries match these filters" />
          ) : (
            <div className="table-wrap"><table className="data">
              <thead><tr>
                <th>When</th><th>Admin</th><th>Action</th><th>Entity</th><th>Request</th><th>Status</th><th>IP</th><th></th>
              </tr></thead>
              <tbody>{entries.map((e) => {
                const expanded = open === e.id;
                return (
                  <React.Fragment key={e.id}>
                    <tr>
                      <td className="muted" style={{ fontSize: 12 }} title={e.createdAt}>{timeAgo(e.createdAt)}</td>
                      <td style={{ fontSize: 12.5 }}>{e.adminEmail || <span className="muted">—</span>}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{e.action}</td>
                      <td style={{ fontSize: 12 }}>
                        {e.entity ? <>{e.entity}{e.entityId ? <div className="muted mono" style={{ fontSize: 11 }}>{e.entityId}</div> : null}</> : <span className="muted">—</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 11.5, maxWidth: 260, overflowWrap: 'anywhere' }}>
                        {e.method || ''} {e.path || ''}
                      </td>
                      <td className="mono" style={{ color: statusColor(e.status) }}>{e.status ?? '—'}</td>
                      <td className="mono muted" style={{ fontSize: 11.5 }}>{e.ip || '—'}</td>
                      <td>
                        <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setOpen(expanded ? null : e.id)}>
                          {expanded ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8}>
                          <div style={{ padding: '4px 0 10px', display: 'grid', gap: 8 }}>
                            <div className="muted" style={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>
                              <b>User agent:</b> {e.userAgent || '—'}
                            </div>
                            <div>
                              <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Metadata</div>
                              {e.metadata == null ? (
                                <span className="muted" style={{ fontSize: 12 }}>No metadata recorded</span>
                              ) : (
                                <pre className="mono" style={{ background: 'var(--grey-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 11.5, maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                                  {typeof e.metadata === 'string' ? e.metadata : JSON.stringify(e.metadata, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
