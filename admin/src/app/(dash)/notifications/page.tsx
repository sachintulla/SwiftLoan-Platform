'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { timeAgo } from '@/lib/format';

interface Notif { id: string; type: string; title: string; body?: string; severity: string; read: boolean; createdAt: string }
const SEV_TONE: Record<string, string> = { info: 'blue', success: 'green', warning: 'amber', critical: 'red' };

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(unreadOnly ? { unread: '1' } : {}) });
  const { data, isLoading, mutate } = useSWR(`/api/admin/notifications?${qs.toString()}`, swrFetcher, { refreshInterval: 10000 });
  const payload = data?.data as { rows: Notif[]; unread: number } | undefined;
  const rows = payload?.rows ?? [];
  const pg = data?.pagination;

  async function markRead(id: string) { await apiFetch(`/api/admin/notifications/${id}/read`, { method: 'PATCH' }); mutate(); }
  async function markAll() { await apiFetch('/api/admin/notifications/read-all', { method: 'POST' }); mutate(); }

  return (
    <div className="page">
      <div className="row between wrap">
        <div><h1 className="page-title">Notifications</h1><p className="page-sub">{payload?.unread ?? 0} unread · stalled loans, new leads, and system alerts.</p></div>
        <div className="row" style={{ gap: 8 }}>
          <button className={`chip-filter ${unreadOnly ? 'active' : ''}`} onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}>Unread only</button>
          <button className="btn" onClick={markAll}>Mark all read</button>
        </div>
      </div>

      <Card>
        {isLoading ? <TableSkeleton rows={6} cols={2} /> : rows.length === 0 ? <Empty label="No notifications" /> : (
          <div style={{ display: 'grid', gap: 0 }}>
            {rows.map((n) => (
              <div key={n.id} className="row" style={{ gap: 12, padding: '13px 6px', borderBottom: '1px solid var(--border)', opacity: n.read ? 0.6 : 1 }}>
                <span className={`badge tone-${SEV_TONE[n.severity] || 'grey'}`} style={{ alignSelf: 'flex-start' }}>{n.severity}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title}</div>
                  {n.body && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{n.body}</div>}
                </div>
                <span className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
                {!n.read && <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => markRead(n.id)}>Mark read</button>}
              </div>
            ))}
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
