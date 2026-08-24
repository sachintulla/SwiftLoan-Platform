'use client';
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Pagination, Empty, DateRangePicker } from '@/components/ui';
import { dateStr } from '@/lib/format';

interface Member { customerId: string; phone: string; name: string | null; city: string | null; activityAt: string | null }

/** Debounce a fast-changing value so a dependent fetch doesn't re-run on every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

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

  // Typing shouldn't re-fetch on every keystroke — that's what made the
  // modal "wrinkle": each request flashed the table down to a bare "Loading…"
  // line (much shorter than a populated table) and back, over and over.
  const debouncedSearch = useDebounced(search, 300);
  const dateError = since && until && since > until;

  const qs = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim());
  if (since && !dateError) qs.set('since', since);
  if (until && !dateError) qs.set('until', until);
  const { data, error, isLoading } = useSWR(
    `/api/admin/segments/${segmentKey}/members?${qs.toString()}`,
    swrFetcher,
    // Keep showing the previous page's rows while a new filter is in flight
    // instead of collapsing to "Loading…" — the other half of the fix for
    // the same wrinkling: even debounced, a real fetch still takes a moment.
    { keepPreviousData: true },
  );
  const members: Member[] = (data?.data as { members?: Member[] } | undefined)?.members ?? [];
  const pg = data?.pagination as { page: number; totalPages: number; total: number } | undefined;
  // True only while there is truly nothing to show yet (first load) — once we
  // have any page of results, keepPreviousData means isLoading during a
  // refetch shouldn't blank the table.
  const showLoading = isLoading && members.length === 0;

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
      <div className="card card-pad" style={{ width: '100%', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: 2 }}>{label}</h3>
            <p className="card-sub" style={{ margin: 0 }}>Narrow by name, phone, or recency, then pick who to include.</p>
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="row wrap" style={{ gap: 10, marginTop: 16, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <label className="muted" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Search</label>
            <input className="input" placeholder="Name or phone" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Activity</label>
            <DateRangePicker
              since={since}
              until={until}
              onChange={(s, u) => { setSince(s); setUntil(u); setPage(1); }}
            />
          </div>
          <button type="button" className="btn" onClick={selectAllOnPage}>Select page</button>
          <button type="button" className="btn" onClick={clearAll}>Clear</button>
        </div>
        {dateError && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8, marginBottom: 0 }}>&quot;Activity from&quot; must be on or before &quot;to&quot;.</p>}

        <div className="row between" style={{ marginTop: 14, marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            <b style={{ color: 'var(--text)' }}>{selected.size}</b> selected
            {pg ? <> · {pg.total} match this filter</> : null}
          </span>
        </div>

        {/* Fixed-height frame around the results: loading/empty/populated
            states all render inside the same box, so the modal itself never
            resizes as you type — that resize-on-every-state-change was the
            other half of the "wrinkling". */}
        <div style={{ minHeight: 340, display: 'flex', flexDirection: 'column' }}>
          {error ? (
            <div className="empty" style={{ color: 'var(--red)' }}>Could not load contacts — {(error as Error).message}</div>
          ) : showLoading ? (
            <div className="empty"><span className="muted" style={{ fontSize: 12.5 }}>Loading…</span></div>
          ) : members.length === 0 ? (
            <Empty label="No contacts match this filter" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto', opacity: isLoading ? 0.6 : 1, transition: 'opacity .1s' }}>
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
        </div>
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
