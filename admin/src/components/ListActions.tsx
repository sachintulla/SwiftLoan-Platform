'use client';
// Export CSV for the Applications, Revasure and Yubi lists.
//
// The export sends the same filters the list is showing and goes through
// downloadFile (the Bearer token travels with it).
import React, { useState } from 'react';
import { downloadFile } from '@/lib/api';
import { Callout } from '@/components/ui';
import {
  EXPORT_LIMIT, buildListQuery, shouldWarnTruncation, exportBlockedReason,
} from '@/lib/lists';
import './listActions.css';

export type ListKind = 'loans' | 'revasure' | 'yubi';

interface Props {
  kind: ListKind;
  /** The filters the list is showing, as the API takes them (no page numbers). */
  filters: Record<string, string>;
  /** Total rows matching the filters, from the list's pagination. Undefined while loading. */
  total: number | undefined;
  /** The filters in words. No longer shown; kept so the list pages need no change. */
  filterSummary?: string;
  /** The signed-in admin's role. */
  role?: string;
}

/* ─────────────────────────── small icons ─────────────────────────── */

function Icon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d={d} />
    </svg>
  );
}
const ICON_DOWNLOAD = 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2';

/* ─────────────────────────── the button ─────────────────────────── */

export default function ListActions({ kind, filters, total, role }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');

  const exportReason = exportBlockedReason(role, total);
  const exportDisabled = exporting || exportReason !== null || total === undefined;

  async function exportCsv() {
    setExporting(true);
    setExportErr('');
    try {
      const qs = buildListQuery(filters);
      await downloadFile(
        `/api/admin/list-actions/${kind}.csv${qs ? `?${qs}` : ''}`,
        `${kind}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (e) {
      setExportErr((e as Error).message || 'The export failed. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="adm-la">
      <div className="adm-la-buttons">
        <div className="adm-la-btn">
          <button type="button" className="btn" onClick={exportCsv} disabled={exportDisabled} aria-busy={exporting || undefined}>
            <span className="row" style={{ gap: 7, justifyContent: 'center' }}>
              <Icon d={ICON_DOWNLOAD} />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </span>
          </button>
          {exportReason && <span className="adm-la-reason">{exportReason}</span>}
        </div>
      </div>

      {shouldWarnTruncation(total) && (
        <div className="adm-la-warn">
          <Callout tone="amber">
            {(total as number).toLocaleString('en-IN')} rows match. Only the newest {EXPORT_LIMIT.toLocaleString('en-IN')} are exported. Narrow the filters to export the rest.
          </Callout>
        </div>
      )}
      {exportErr && (
        <div className="adm-la-warn" role="alert">
          <Callout tone="red">{exportErr}</Callout>
        </div>
      )}
    </div>
  );
}

/** The muted line that goes under the filter bar. */
export function ExportNote() {
  return <p className="adm-note">The file follows the filters above. It never includes PAN, Aadhaar or OTP values.</p>;
}

/* ─────────────────────────── list states shared by the three pages ─────────────────────────── */

/** "Could not load loan applications - {message}" with a Retry button. */
export function ListError({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  return (
    <div className="adm-state" role="alert">
      <h3>Could not load {what} - {(error as Error)?.message || 'something went wrong'}</h3>
      <div><button type="button" className="btn" onClick={onRetry}>Retry</button></div>
    </div>
  );
}

/** The two empty states: nothing matches the filters, or there is nothing at all yet. */
export function ListEmpty({ filtered, filteredText, noneTitle, noneBody, onClear }: {
  filtered: boolean;
  filteredText: string;
  noneTitle: string;
  noneBody?: string;
  onClear: () => void;
}) {
  if (filtered) {
    return (
      <div className="adm-state">
        <h3>{filteredText}</h3>
        <div><button type="button" className="btn" onClick={onClear}>Clear filters</button></div>
      </div>
    );
  }
  return (
    <div className="adm-state">
      <h3>{noneTitle}</h3>
      {noneBody && <p>{noneBody}</p>}
    </div>
  );
}
