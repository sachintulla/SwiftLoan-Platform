'use client';
// Export CSV and Start campaign for the Loan Pipeline, Revasure and Yubi lists.
//
// Both actions send the same filters the list is showing. The export goes through
// downloadFile (the Bearer token travels with it). Start campaign first asks the
// server for a dry run, shows what would happen, and only then creates a draft.
// A draft is never dialled until someone starts it from the campaign itself.
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, downloadFile, ApiError } from '@/lib/api';
import { Callout } from '@/components/ui';
import {
  EXPORT_LIMIT, CAMPAIGN_CAP, buildListQuery, cleanFilters, shouldWarnTruncation,
  exportBlockedReason, campaignBlockedReason, revasureReachedWarning,
} from '@/lib/lists';
import './listActions.css';

export type ListKind = 'loans' | 'revasure' | 'yubi';

const DIALOG_TITLE: Record<ListKind, string> = {
  loans: 'Start a campaign from this list?',
  revasure: 'Start a campaign from these leads?',
  yubi: 'Start a campaign from these referrals?',
};

interface DryRun {
  matched: number; withPhone: number; noPhone: number; duplicates: number;
  excludedDoNotContact: number; willAdd: number; capped: boolean;
}

interface Props {
  kind: ListKind;
  /** The filters the list is showing, as the API takes them (no page numbers). */
  filters: Record<string, string>;
  /** Total rows matching the filters, from the list's pagination. Undefined while loading. */
  total: number | undefined;
  /** The filters in words, for the dialog ("status Rejected, search "98""). */
  filterSummary: string;
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
const ICON_CAMPAIGN = 'M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zm13-3a5 5 0 010 8';

/* ─────────────────────────── the two buttons ─────────────────────────── */

export default function ListActions({ kind, filters, total, filterSummary, role }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const campaignBtn = useRef<HTMLButtonElement>(null);

  const exportReason = exportBlockedReason(role, total);
  const campaignReason = campaignBlockedReason(role, total);
  const exportDisabled = exporting || exportReason !== null || total === undefined;
  const campaignDisabled = campaignReason !== null || total === undefined;

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

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    // Hand focus back to the button that opened the dialog.
    setTimeout(() => campaignBtn.current?.focus(), 0);
  }, []);

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
        <div className="adm-la-btn">
          <button ref={campaignBtn} type="button" className="btn btn-primary" onClick={() => setDialogOpen(true)} disabled={campaignDisabled} aria-haspopup="dialog">
            <span className="row" style={{ gap: 7, justifyContent: 'center' }}>
              <Icon d={ICON_CAMPAIGN} />
              Start campaign
            </span>
          </button>
          {campaignReason && <span className="adm-la-reason">{campaignReason}</span>}
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

      {dialogOpen && (
        <CampaignDialog kind={kind} filters={filters} filterSummary={filterSummary} onClose={closeDialog} />
      )}
    </div>
  );
}

/** The muted line that goes under the filter bar. */
export function ExportNote() {
  return <p className="adm-note">The file follows the filters above. It never includes PAN, Aadhaar or OTP values.</p>;
}

/* ─────────────────────────── campaign dialog ─────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CampaignDialog({ kind, filters, filterSummary, onClose }: {
  kind: ListKind;
  filters: Record<string, string>;
  filterSummary: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;
  const nameId = `${uid}-name`;
  const errId = `${uid}-err`;
  const panel = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<DryRun | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [attempt, setAttempt] = useState(0);

  const body = cleanFilters(filters);
  const bodyKey = JSON.stringify(body);

  // Dry run: counts only, nothing is created.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr('');
    apiFetch<DryRun>(`/api/admin/list-actions/${kind}/campaign`, {
      method: 'POST',
      body: JSON.stringify({ filters: JSON.parse(bodyKey), dryRun: true }),
    })
      .then((r) => { if (!cancelled) setPreview(r.data); })
      .catch((e) => { if (!cancelled) setLoadErr((e as Error).message || 'Could not check your filters'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, bodyKey, attempt]);

  // Focus the dialog when it opens, then the name field once there is something to name.
  useEffect(() => { panel.current?.focus(); }, []);
  const canName = !loading && !loadErr && preview !== null && !preview.capped && preview.willAdd > 0;
  useEffect(() => { if (canName) nameInput.current?.focus(); }, [canName]);

  // Keep Tab inside the dialog; Escape closes it.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) { setSubmitErr('Give the campaign a name.'); nameInput.current?.focus(); return; }
    setBusy(true);
    setSubmitErr('');
    try {
      const r = await apiFetch<{ campaignId: string }>(`/api/admin/list-actions/${kind}/campaign`, {
        method: 'POST',
        body: JSON.stringify({ filters: body, name: trimmed }),
      });
      router.push(`/campaigns/${r.data.campaignId}`);
    } catch (e) {
      const status = (e as ApiError).status;
      setSubmitErr(status === 403 ? 'Campaigns need an admin or super admin.' : (e as Error).message || 'Could not create the campaign.');
      setBusy(false);
    }
  }

  const nothingToAdd = !loading && !loadErr && preview !== null && !preview.capped && preview.willAdd === 0;
  const confirmDisabled = busy || !canName || !name.trim();
  const showReached = kind === 'revasure' && revasureReachedWarning(body);
  const showYubiRejected = kind === 'yubi' && (body.status ?? '').toUpperCase() === 'REJECTED';

  return (
    <div className="adm-dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div
        ref={panel}
        className="adm-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 className="adm-dlg-title" id={titleId}>{DIALOG_TITLE[kind]}</h2>

        <div className="adm-dlg-body" id={bodyId} aria-live="polite" aria-busy={loading}>
          {loading && <p className="muted">Checking your filters...</p>}

          {loadErr && (
            <>
              <p className="adm-dlg-err" role="alert">Could not check your filters - {loadErr}</p>
              <div><button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>Retry</button></div>
            </>
          )}

          {preview && !loading && !loadErr && preview.capped && (
            <Callout tone="amber">
              {preview.matched.toLocaleString('en-IN')} rows match your filters ({filterSummary || 'no filters'}). A campaign from a list can take at most {CAMPAIGN_CAP.toLocaleString('en-IN')} customers. Narrow the filters and try again.
            </Callout>
          )}

          {preview && !loading && !loadErr && !preview.capped && (
            <>
              <p>
                {preview.matched.toLocaleString('en-IN')} {preview.matched === 1 ? 'customer matches' : 'customers match'} your filters ({filterSummary || 'no filters'}).
                They will be added to a new draft campaign. Nothing is dialled until you start it.
              </p>
              <Callout tone="blue">
                Customers who asked not to be called are left out automatically. {preview.excludedDoNotContact.toLocaleString('en-IN')} will be skipped.
              </Callout>
              {(preview.noPhone > 0 || preview.duplicates > 0) && (
                <ul className="adm-dlg-list">
                  {preview.noPhone > 0 && <li>{preview.noPhone.toLocaleString('en-IN')} {preview.noPhone === 1 ? 'has' : 'have'} no usable mobile number.</li>}
                  {preview.duplicates > 0 && <li>{preview.duplicates.toLocaleString('en-IN')} {preview.duplicates === 1 ? 'repeats' : 'repeat'} a number already on the list.</li>}
                </ul>
              )}
              {nothingToAdd ? (
                <Callout tone="red">No one on this list can be added, so a campaign cannot be created. Change the filters and try again.</Callout>
              ) : (
                <p><b>{preview.willAdd.toLocaleString('en-IN')}</b> {preview.willAdd === 1 ? 'customer' : 'customers'} will be added.</p>
              )}
              {showReached && (
                <Callout tone="amber">These customers already reached Revasure. Check you want to contact them again.</Callout>
              )}
              {showYubiRejected && (
                <Callout tone="amber">These customers were turned down by their Yubi partner lender. Make sure the campaign script does not promise that lender&apos;s offer.</Callout>
              )}
            </>
          )}

          {canName && (
            <div className="adm-dlg-field">
              <label htmlFor={nameId}>Campaign name<span className="req" aria-hidden="true"> *</span></label>
              <input
                ref={nameInput}
                id={nameId}
                className="input"
                value={name}
                maxLength={120}
                required
                aria-required="true"
                aria-describedby={submitErr ? errId : undefined}
                aria-invalid={submitErr ? true : undefined}
                placeholder="For example: Rejected customers, November"
                onChange={(e) => { setName(e.target.value); if (submitErr) setSubmitErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !confirmDisabled) { e.preventDefault(); void create(); } }}
              />
            </div>
          )}

          {submitErr && <p className="adm-dlg-err" id={errId} role="alert">{submitErr}</p>}
        </div>

        <div className="adm-dlg-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={confirmDisabled} aria-busy={busy || undefined}>
            {busy ? 'Creating...' : 'Create draft campaign'}
          </button>
        </div>
      </div>
    </div>
  );
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
