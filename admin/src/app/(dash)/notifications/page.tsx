'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, Select, FilterChips, Pagination, TableSkeleton, ConfirmDialog } from '@/components/ui';
import { num } from '@/lib/format';
import NotificationList from '@/components/notifications/NotificationList';
import '@/components/notifications/notifications.css';
import {
  DEFAULT_NOTIF_FILTERS, SEVERITY_OPTIONS, EMPTY_TEXT, buildNotifQuery, filtersActive, typeOptions, unreadForType, subtitleText, bulkAction, bulkBody,
  notifListState, hasNewRows, type NotifFilters, type NotifPayload, type ReadState,
} from '@/lib/notificationsView';

const PAGE_SIZE = 20;
const STATE_OPTIONS: { key: ReadState; label: string }[] = [{ key: 'unread', label: 'Unread' }, { key: 'all', label: 'All' }];

interface StatCellProps { label: string; value: number; foot?: string; pressed?: boolean; onClick?: () => void }

function StatCell({ label, value, foot, pressed, onClick }: StatCellProps) {
  const inner = (
    <>
      <div className="stat-cell-label">{label}</div>
      <div className="stat-cell-value">{num(value)}</div>
      {foot && <div className="stat-cell-foot" style={{ color: 'var(--text-dim)' }}>{foot}</div>}
    </>
  );
  if (!onClick) return <div className="adm-notif-stat static">{inner}</div>;
  return <button type="button" className="adm-notif-stat" aria-pressed={!!pressed} onClick={onClick}>{inner}</button>;
}

export default function NotificationsPage() {
  const [filters, setFilters] = useState<NotifFilters>(DEFAULT_NOTIF_FILTERS);
  const [page, setPage] = useState(1);

  // Row-level state for marking as read.
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [justMarked, setJustMarked] = useState<Set<string>>(new Set());

  // Bulk action state.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [flash, setFlash] = useState<{ text: string; err: boolean } | null>(null);

  const key = `/api/admin/notification-center?${buildNotifQuery(filters, page, PAGE_SIZE)}`;
  const { data, error, isLoading, mutate } = useSWR(key, swrFetcher, { refreshInterval: 10_000, keepPreviousData: true });
  const live = data?.data as NotifPayload | undefined;
  const pg = data?.pagination;

  // While the pointer or keyboard focus is in the list, keep showing what was on screen so rows do not jump
  // under the cursor. New arrivals are offered through a chip instead.
  const [frozen, setFrozen] = useState<{ key: string; payload: NotifPayload } | null>(null);
  const inside = useRef({ pointer: false, focus: false });
  const freeze = (kind: 'pointer' | 'focus') => {
    inside.current[kind] = true;
    setFrozen((f) => (f && f.key === key ? f : live ? { key, payload: live } : null));
  };
  const release = (kind: 'pointer' | 'focus') => {
    inside.current[kind] = false;
    if (!inside.current.pointer && !inside.current.focus) setFrozen(null);
  };
  const shown = frozen && frozen.key === key ? frozen.payload : live;
  const hasNew = !!(frozen && frozen.key === key && live && hasNewRows(frozen.payload.rows.map((r) => r.id), live.rows.map((r) => r.id)));
  const showNew = () => { inside.current = { pointer: false, focus: false }; setFrozen(null); };

  const rows = shown?.rows ?? [];
  const unread = live?.unread ?? 0;
  const state = notifListState({ loading: isLoading, error, total: rows.length, filters });
  const bulk = bulkAction({ unreadTotal: unread, filteredUnread: live?.filteredUnread, filters });

  // Reset paging and the session overlay when the view changes.
  const setView = (patch: Partial<NotifFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const clearFilters = () => setView({ type: '', severity: '' });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 8000);
    return () => clearTimeout(t);
  }, [flash]);

  const markRead = useCallback(async (id: string) => {
    setPendingIds((s) => new Set(s).add(id));
    setFailedIds((s) => { const n = new Set(s); n.delete(id); return n; });
    try {
      await apiFetch(`/api/admin/notifications/${id}/read`, { method: 'PATCH' });
      setReadIds((s) => new Set(s).add(id));
      setJustMarked((s) => new Set(s).add(id));
      setFlash({ text: 'Marked as read.', err: false });
      setTimeout(() => setJustMarked((s) => { const n = new Set(s); n.delete(id); return n; }), 2500);
      void mutate();
    } catch {
      setFailedIds((s) => new Set(s).add(id));
    } finally {
      setPendingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [mutate]);

  async function runBulk() {
    setBulkBusy(true);
    try {
      const res = await apiFetch<{ updated: number }>('/api/admin/notification-center/read', { method: 'POST', body: JSON.stringify(bulkBody(filters)) });
      const n = res.data?.updated ?? 0;
      setFlash({ text: n === 1 ? 'Marked 1 notification as read.' : `Marked ${num(n)} notifications as read.`, err: false });
      setConfirmOpen(false);
      void mutate();
    } catch (e) {
      setConfirmOpen(false);
      setFlash({ text: `Could not mark notifications as read. ${(e as Error).message || 'Try again.'}`, err: true });
    } finally {
      setBulkBusy(false);
    }
  }

  const typeOpts = useMemo(() => typeOptions(live?.counts.byType), [live?.counts.byType]);
  const loansUnread = unreadForType(live?.counts.byType, 'loan_stale');
  const helpUnread = unreadForType(live?.counts.byType, 'app_nudge');

  return (
    <div className="page">
      <div className="adm-notif-head">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">{subtitleText(unread)}</p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={bulk.disabled || bulkBusy}
          onClick={() => (bulk.needsConfirm ? setConfirmOpen(true) : void runBulk())}
        >
          {bulkBusy && !confirmOpen ? 'Saving...' : bulk.label}
        </button>
      </div>

      {/* Announces results of marking as read to screen readers; the same text is shown below when it matters. */}
      <div className="adm-notif-sr" role="status" aria-live="polite">{flash && !flash.err ? flash.text : ''}</div>
      {flash && <p className={`adm-notif-flash${flash.err ? ' err' : ''}`} role={flash.err ? 'alert' : undefined}>{flash.text}</p>}

      <div className="adm-notif-stack">
        <Card>
          <div className="adm-notif-stats">
            <StatCell
              label="Unread" value={unread} foot="All types"
              pressed={filters.state === 'unread' && !filtersActive(filters)}
              onClick={() => setView({ state: 'unread', type: '', severity: '' })}
            />
            <StatCell label="Needs attention" value={live?.needsAttention ?? 0} foot="Critical or warning, unread" />
            <StatCell
              label="Inactive loans" value={loansUnread} foot="Unread"
              pressed={filters.type === 'loan_stale' && !filters.severity}
              onClick={() => setView({ state: 'unread', type: 'loan_stale', severity: '' })}
            />
            <StatCell
              label="Users needing help" value={helpUnread} foot="Unread"
              pressed={filters.type === 'app_nudge' && !filters.severity}
              onClick={() => setView({ state: 'unread', type: 'app_nudge', severity: '' })}
            />
          </div>
        </Card>

        <Card>
          <div className="adm-notif-filters">
            <div className="adm-notif-field">
              <span className="adm-notif-label" id="adm-notif-state">Show</span>
              <div role="group" aria-labelledby="adm-notif-state">
                <FilterChips options={STATE_OPTIONS} value={filters.state} onChange={(v) => setView({ state: v })} />
              </div>
            </div>
            <div className="adm-notif-field" role="group" aria-labelledby="adm-notif-type">
              <span className="adm-notif-label" id="adm-notif-type">Type</span>
              <Select value={filters.type} onChange={(v) => setView({ type: v })} options={typeOpts} />
            </div>
            <div className="adm-notif-field" role="group" aria-labelledby="adm-notif-sev">
              <span className="adm-notif-label" id="adm-notif-sev">Severity</span>
              <Select value={filters.severity} onChange={(v) => setView({ severity: v })} options={SEVERITY_OPTIONS} />
            </div>
            {filtersActive(filters) && <button type="button" className="btn" onClick={clearFilters}>Clear filters</button>}
          </div>
        </Card>

        <Card>
          {hasNew && (
            <div style={{ marginBottom: 12 }}>
              <button type="button" className="adm-notif-newchip" onClick={showNew}>New notifications arrived. Show</button>
            </div>
          )}

          {state === 'loading' && <div aria-busy="true"><TableSkeleton rows={6} cols={4} /></div>}

          {state === 'error' && (
            <div className="adm-notif-empty" role="alert">
              <h3>Could not load notifications</h3>
              <p>{(error as Error)?.message || 'Something went wrong.'}</p>
              <button type="button" className="btn" onClick={() => { void mutate(); }}>Retry</button>
            </div>
          )}

          {(state === 'filtered_empty' || state === 'caught_up' || state === 'none') && (
            <div className="adm-notif-empty">
              <p style={{ marginBottom: state === 'filtered_empty' ? 14 : 0 }}>{EMPTY_TEXT[state]}</p>
              {state === 'filtered_empty' && <button type="button" className="btn" onClick={clearFilters}>Clear filters</button>}
            </div>
          )}

          {state === 'loaded' && (
            <div
              onMouseEnter={() => freeze('pointer')}
              onMouseLeave={() => release('pointer')}
              onFocus={() => freeze('focus')}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release('focus'); }}
            >
              <NotificationList
                rows={rows}
                readIds={readIds}
                pendingIds={pendingIds}
                failedIds={failedIds}
                justMarkedIds={justMarked}
                onMarkRead={markRead}
              />
            </div>
          )}

          {pg && state === 'loaded' && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
        </Card>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title={bulk.confirmTitle}
          message={bulk.confirmBody}
          confirmLabel="Mark as read"
          busy={bulkBusy}
          onConfirm={() => { void runBulk(); }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
