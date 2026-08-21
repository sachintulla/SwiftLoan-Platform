'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate as globalMutate } from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { timeAgo } from '@/lib/format';

interface Notif {
  id: string; type: string; title: string; body?: string; severity: string;
  read: boolean; createdAt: string;
  /** The record this alert is about — an application id, a user id, … */
  entityId?: string | null;
}
const SEV_TONE: Record<string, string> = { info: 'blue', success: 'green', warning: 'amber', critical: 'red' };

/**
 * Where a notification should take you. `entityId` means a different thing per type, so
 * the mapping is explicit — guessing would produce links that 404.
 */
function targetFor(n: Notif): string | null {
  if (!n.entityId) return null;
  switch (n.type) {
    case 'loan_stale':
      return `/loans/${n.entityId}`;      // entityId = LoanApplication.id
    case 'onboarding_stale':
      return `/users/${n.entityId}`;      // entityId = User.id
    default:
      return null;                         // e.g. seeded 'new_lead' rows carry no id
  }
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(unreadOnly ? { unread: '1' } : {}) });
  const { data, isLoading, mutate } = useSWR(`/api/admin/notifications?${qs.toString()}`, swrFetcher, { refreshInterval: 10000 });
  const payload = data?.data as { rows: Notif[]; unread: number } | undefined;
  const rows = payload?.rows ?? [];
  const pg = data?.pagination;

  // The sidebar's unread badge is fed by /dashboard/realtime, which only refreshes on an
  // 8s poll — so marking something read left the badge showing the old count for up to
  // eight seconds, which reads as "the click didn't work". Revalidate that key too, not
  // just this list.
  const REALTIME_KEY = '/api/admin/dashboard/realtime';

  async function markRead(id: string) {
    await apiFetch(`/api/admin/notifications/${id}/read`, { method: 'PATCH' });
    await Promise.all([mutate(), globalMutate(REALTIME_KEY)]);
  }
  async function markAll() {
    await apiFetch('/api/admin/notifications/read-all', { method: 'POST' });
    await Promise.all([mutate(), globalMutate(REALTIME_KEY)]);
  }

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
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Every alert is about a specific record, so the title links to it.
                      Without this an operator read "Application SL-800103 stalled",
                      then had to go to the pipeline and search for the ref by hand. */}
                  {targetFor(n) ? (
                    <Link href={targetFor(n)!} style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>
                      {n.title}
                    </Link>
                  ) : (
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title}</div>
                  )}
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
