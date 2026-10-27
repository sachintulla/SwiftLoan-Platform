'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Pagination, TableSkeleton } from '@/components/ui';
import { dateStr, dateTimeStr } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

interface Member {
  customerId: string; phone: string; name: string | null; city: string | null; activityAt: string | null;
  /** Rejected segment only. */
  lender?: string | null; reason?: string | null;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Lets an admin narrow a segment down to specific people instead of taking
 * the whole thing — a segment with 300 members but only 100 actually wanted
 * for this campaign. `initialSelected` is null when nothing has been
 * customized yet for this segment (meaning "the whole segment"); confirming
 * without touching anything leaves that as-is rather than accidentally
 * freezing the segment to today's membership.
 *
 * It is a real dialog: labelled, modal, focus starts in Search and is kept
 * inside, Escape and a click on the backdrop close it, and focus goes back to
 * the button that opened it. The Rejected segment reads "Rejected from / to"
 * and adds the lender, the rejection date and the reason as columns.
 */
export default function SegmentPickerModal({
  segmentKey, label, initialSelected, segmentCount, onClose, onConfirm,
}: {
  segmentKey: string;
  label: string;
  initialSelected: Set<string> | null;
  /** How many people the whole segment holds; what "use the whole segment" means when nothing has been picked by hand. */
  segmentCount?: number;
  onClose: () => void;
  onConfirm: (phones: Set<string> | null) => void;
}) {
  const isRejected = segmentKey === 'rejected';
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected ?? []));
  const [touched, setTouched] = useState(false);

  const uid = useId();
  const titleId = `${uid}-title`;
  const subId = `${uid}-sub`;
  const searchId = `${uid}-search`;
  const sinceId = `${uid}-since`;
  const untilId = `${uid}-until`;
  const dateErrId = `${uid}-dateerr`;
  const whyId = `${uid}-why`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus Search on open; give focus back to whatever opened the dialog when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => { if (opener && opener.isConnected) opener.focus(); };
  }, []);

  // Escape closes from anywhere (focus may sit on the dialog background); Tab stays inside it.
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const dateError = since && until && since > until;
  const fromWord = isRejected ? 'Rejected from' : 'Activity from';
  const toWord = isRejected ? 'Rejected to' : 'Activity to';

  const qs = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim());
  if (since && !dateError) qs.set('since', since);
  if (until && !dateError) qs.set('until', until);
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/segments/${segmentKey}/members?${qs.toString()}`, swrFetcher);
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

  // Untouched with no earlier pick means the whole segment, whatever the search
  // box says; the unfiltered count is only known from the caller or an unfiltered fetch.
  const wholeSegment = !touched && !initialSelected;
  const displayCount = touched ? selected.size : (initialSelected ? initialSelected.size : (segmentCount ?? pg?.total ?? 0));
  const canConfirm = displayCount > 0;

  const colCount = isRejected ? 6 : 5;
  const reasonStyle: React.CSSProperties = { maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subId}
        className="card card-pad"
        style={{ width: '100%', maxWidth: 760, maxHeight: '85vh', overflowY: 'auto' }}
        onKeyDown={onKeyDown}
      >
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 id={titleId} className="card-title">{label} - choose contacts</h3>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <p id={subId} className="card-sub">
          {isRejected
            ? 'Narrow the list by name, mobile or date, then pick who to include.'
            : 'Narrow this segment by name/phone or recency, then pick who to include.'}
        </p>

        <div className="row" style={{ gap: 10, marginTop: 14, marginBottom: 4, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor={searchId} className="muted" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Search</label>
            <input id={searchId} ref={searchRef} className="input" placeholder="Name or phone" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} />
          </div>
          <div>
            <label htmlFor={sinceId} className="muted" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>{fromWord}</label>
            <input id={sinceId} className="input" type="date" value={since}
              aria-invalid={dateError ? true : undefined} aria-describedby={dateError ? dateErrId : undefined}
              onChange={(e) => { setSince(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
          </div>
          <div>
            <label htmlFor={untilId} className="muted" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>{toWord}</label>
            <input id={untilId} className="input" type="date" value={until}
              aria-invalid={dateError ? true : undefined} aria-describedby={dateError ? dateErrId : undefined}
              onChange={(e) => { setUntil(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
          </div>
          {(since || until) && (
            <button type="button" className="btn" onClick={() => { setSince(''); setUntil(''); setPage(1); }}>Clear dates</button>
          )}
          <button type="button" className="btn" onClick={selectAllOnPage} disabled={members.length === 0}>Select all on this page</button>
          <button type="button" className="btn" onClick={clearAll}>Clear selection</button>
        </div>
        {dateError && (
          <p id={dateErrId} role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 0, marginBottom: 10 }}>
            &quot;{fromWord}&quot; must be on or before &quot;{toWord}&quot;.
          </p>
        )}

        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }} aria-live="polite" aria-atomic="true">
          {displayCount} selected.{pg ? ` ${pg.total} match this filter.` : ''}
          {wholeSegment && displayCount > 0 ? ' Nobody has been picked by hand, so the whole segment is included.' : ''}
        </div>

        <div aria-busy={isLoading || undefined}>
          {error ? (
            <div className="empty" style={{ color: 'var(--red)' }}>
              Could not load contacts - {(error as Error).message}
              <div><button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
            </div>
          ) : isLoading ? (
            <TableSkeleton rows={6} cols={colCount} />
          ) : members.length === 0 ? (
            <div className="empty">
              {isRejected
                ? 'No customers match this filter. Try clearing the dates or the search.'
                : 'No contacts match this filter.'}
            </div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Include</span></th>
                    <th>Name</th>
                    <th>{isRejected ? 'Mobile' : 'Phone'}</th>
                    {isRejected ? (
                      <>
                        <th>Lender that rejected</th>
                        <th>Rejected on</th>
                        <th>Reason</th>
                      </>
                    ) : (
                      <>
                        <th>City</th>
                        <th>Last activity</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.customerId} style={{ cursor: 'pointer' }} onClick={() => toggle(m.phone)}>
                      <td onClick={(e) => e.stopPropagation()} style={{ minWidth: 40 }}>
                        <input
                          type="checkbox"
                          aria-label={`Include ${m.name || m.phone}`}
                          checked={selected.has(m.phone)}
                          onChange={() => toggle(m.phone)}
                          style={{ width: 18, height: 18 }}
                        />
                      </td>
                      <td>{m.name || <span className="muted">-</span>}</td>
                      <td className="mono">{m.phone}</td>
                      {isRejected ? (
                        <>
                          <td>{m.lender || <span className="muted">Not recorded</span>}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{m.activityAt ? dateStr(m.activityAt) : '-'}</td>
                          <td style={reasonStyle} title={m.reason || undefined}>{m.reason || <span className="muted">-</span>}</td>
                        </>
                      ) : (
                        <>
                          <td>{m.city || '-'}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{m.activityAt ? dateTimeStr(m.activityAt) : '-'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}

        <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={confirm}
            disabled={!canConfirm}
            aria-describedby={canConfirm ? undefined : whyId}
          >
            Use {displayCount} contact{displayCount === 1 ? '' : 's'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          {!canConfirm && <span id={whyId} className="muted" style={{ fontSize: 12.5 }}>Choose at least one contact</span>}
        </div>
      </div>
    </div>
  );
}
