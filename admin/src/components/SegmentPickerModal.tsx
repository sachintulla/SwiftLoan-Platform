'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Pagination, Empty } from '@/components/ui';
import { dateStr } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

interface Member { customerId: string; phone: string; name: string | null; city: string | null; activityAt: string | null }

/**
 * Lets an admin narrow a segment down to specific people instead of taking
 * the whole thing — a segment with 300 members but only 100 actually wanted
 * for this campaign. `initialSelected` is null when nothing has been
 * customized yet for this segment (meaning "the whole segment"); confirming
 * without touching anything leaves that as-is rather than accidentally
 * freezing the segment to today's membership.
 */
export default function SegmentPickerModal({
  segmentKey, label, initialSelected, onClose, onConfirm,
}: {
  segmentKey: string;
  label: string;
  initialSelected: Set<string> | null;
  onClose: () => void;
  onConfirm: (phones: Set<string> | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected ?? []));
  const [touched, setTouched] = useState(false);

  const dateError = since && until && since > until;

  const qs = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (search.trim()) qs.set('search', search.trim());
  if (since && !dateError) qs.set('since', since);
  if (until && !dateError) qs.set('until', until);
  const { data, error, isLoading } = useSWR(`/api/admin/segments/${segmentKey}/members?${qs.toString()}`, swrFetcher);
  const members: Member[] = (data?.data as { members?: Member[] } | undefined)?.members ?? [];
  const pg = data?.pagination as { page: number; totalPages: number; total: number } | undefined;

  function toggle(phone: string) {
    setTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  }
  function selectAllOnPage() {
    setTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      members.forEach((m) => next.add(m.phone));
      return next;
    });
  }
  function clearAll() {
    setTouched(true);
    setSelected(new Set());
  }

  function confirm() {
    onConfirm(touched ? selected : initialSelected);
    onClose();
  }

  const displayCount = touched ? selected.size : (initialSelected ? initialSelected.size : (pg?.total ?? 0));

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div className="card card-pad" style={{ width: '100%', maxWidth: 760, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 className="card-title">{label} — choose contacts</h3>
          <button type="button" className="btn" onClick={onClose}>✕</button>
        </div>
        <p className="card-sub">Narrow this segment by name/phone or recency, then pick who to include.</p>

        <div className="row" style={{ gap: 10, marginTop: 14, marginBottom: 4, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="muted" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Search</label>
            <input className="input" placeholder="Name or phone" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Activity from</label>
            <input className="input" type="date" value={since}
              onChange={(e) => { setSince(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Activity to</label>
            <input className="input" type="date" value={until}
              onChange={(e) => { setUntil(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
          </div>
          {(since || until) && (
            <button type="button" className="btn" onClick={() => { setSince(''); setUntil(''); setPage(1); }}>Clear dates</button>
          )}
          <button type="button" className="btn" onClick={selectAllOnPage}>Select all on this page</button>
          <button type="button" className="btn" onClick={clearAll}>Clear selection</button>
        </div>
        {dateError && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 0, marginBottom: 10 }}>&quot;Activity from&quot; must be on or before &quot;Activity to&quot;.</p>}

        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
          {selected.size} selected{pg ? ` · ${pg.total} match this filter` : ''}
        </div>

        {error ? (
          <div className="empty" style={{ color: 'var(--red)' }}>Could not load contacts — {(error as Error).message}</div>
        ) : isLoading ? (
          <span className="muted" style={{ fontSize: 12.5 }}>Loading…</span>
        ) : members.length === 0 ? (
          <Empty label="No contacts match this filter" />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
            <table className="data">
              <thead><tr><th></th><th>Name</th><th>Phone</th><th>City</th><th>Last activity</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.customerId} style={{ cursor: 'pointer' }} onClick={() => toggle(m.phone)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(m.phone)} onChange={() => toggle(m.phone)} />
                    </td>
                    <td>{m.name || <span className="muted">—</span>}</td>
                    <td className="mono">{m.phone}</td>
                    <td>{m.city || '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{m.activityAt ? dateStr(m.activityAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}

        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={confirm}>
            Use {displayCount} contact{displayCount === 1 ? '' : 's'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
