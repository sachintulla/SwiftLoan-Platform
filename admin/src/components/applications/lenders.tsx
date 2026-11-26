'use client';
// What differs between the three lenders on the Applications page: which list they read, their status chips, how a
// status is shown, and how one row is drawn. Everything else (filters, chips, table, pages, export) is shared in
// LenderList.tsx. The table has the same five columns for every lender: Customer, Amount, Status, Lender, Date.
import React, { Fragment } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { StatusBadge } from '@/components/ui';
import { inr, num, dateTimeStr } from '@/lib/format';
import { yubiStatusLabel, REVASURE_STATUS_LABEL } from '@/lib/lists';

export type LenderKey = 'aurix' | 'yubi' | 'revasure';

export interface ChipDef { key: string; label: string }
export interface Summary { total: number; counts: Record<string, number> }

/* ─────────────────────────── shared cells ─────────────────────────── */

function CustomerCell({ customerId, name, phone, appId, appRef }: { customerId?: string | null; name?: string | null; phone?: string | null; appId?: string | null; appRef?: string | null }) {
  const sub = (
    <div className="ap-sub">
      {appRef && appId ? <Link href={`/loans/${appId}`} className="mono ap-ref" onClick={(e) => e.stopPropagation()}>{appRef}</Link> : null}
      {appRef && phone ? ' · ' : null}
      {phone ? <span className="mono">{phone}</span> : null}
    </div>
  );
  return (
    <td data-label="Customer">
      {customerId
        ? <Link href={`/customers/${customerId}`} className="ap-name" onClick={(e) => e.stopPropagation()}>{name || 'No name yet'}</Link>
        : <span className="ap-name">{name || 'No name yet'}</span>}
      {sub}
    </td>
  );
}

const amountCell = (amount: number | null | undefined) => <td data-label="Amount" className="r mono">{amount ? inr(amount) : '—'}</td>;
const dateCell = (iso: string | null | undefined) => <td data-label="Date" className="r ap-date">{iso ? dateTimeStr(iso) : '—'}</td>;

/* ─────────────────────────── Aurix ─────────────────────────── */

interface AppliedOffer { id: string; lenderName?: string | null; lenderStatus?: string | null; partner?: { name?: string } | null }
export interface AurixRow {
  id: string; ref: string; amount: number; status: string; createdAt: string;
  user?: { id?: string; fullName?: string; phone?: string };
  _count?: { offers: number };
  offers?: AppliedOffer[];
}

export const AURIX_CHIPS: ChipDef[] = [
  { key: '', label: 'All' },
  { key: 'offers_ready', label: 'Offers ready' },
  { key: 'handoff', label: 'Sent to lender' },
  { key: 'under_review', label: 'In review' },
  { key: 'filling', label: 'Filling details' },
  { key: 'rejected', label: 'No offers' },
  { key: 'failed', label: 'Failed' },
];

/** An application's status in the same words as the chips above the table (the chips and the badges must agree). */
const AURIX_LABEL: Record<string, string> = {
  offers_ready: 'Offers ready', handoff: 'Sent to lender', under_review: 'In review', approved: 'Approved', disbursed: 'Disbursed',
  closed: 'Closed', draft: 'Filling details', pan_pending: 'Filling details', prequalifying: 'Filling details', rejected: 'No offers', failed: 'Failed',
};
const AURIX_TONE: Record<string, string> = {
  offers_ready: 'in_progress', handoff: 'converted', under_review: 'in_progress', approved: 'approved', disbursed: 'disbursed', closed: 'completed',
  draft: 'pending', pan_pending: 'pending', prequalifying: 'pending', rejected: 'rejected', failed: 'failed',
};

/** The lenders a customer applied to from this application, e.g. "Credit Sea" or "Credit Sea +1". */
function lenderNames(offers: AppliedOffer[] | undefined): string {
  const names = [...new Set((offers ?? []).map((o) => o.lenderName || o.partner?.name).filter(Boolean) as string[])];
  if (!names.length) return '—';
  const tidy = (n: string) => n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bLimited\b/, '').trim();
  return names.length === 1 ? tidy(names[0]) : `${tidy(names[0])} +${names.length - 1}`;
}

export function AurixRowView({ r, onOpen }: { r: AurixRow; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="ap-click">
      <CustomerCell name={r.user?.fullName} phone={r.user?.phone} appId={r.id} appRef={r.ref} />
      {amountCell(r.amount)}
      <td data-label="Status">
        <StatusBadge status={AURIX_TONE[r.status] ?? r.status} label={AURIX_LABEL[r.status] ?? r.status} />
        {r._count?.offers ? <div className="ap-sub">{r._count.offers} offer{r._count.offers === 1 ? '' : 's'}</div> : null}
      </td>
      <td data-label="Lender">{lenderNames(r.offers)}</td>
      {dateCell(r.createdAt)}
    </tr>
  );
}

/* ─────────────────────────── Yubi ─────────────────────────── */

export interface YubiRow {
  id: string; status: string; lastStatus: string | null; appliedAt: string | null; appliedLender: string | null; updatedAt: string;
  customerId: string | null;
  user: { id: string; fullName: string | null; phone: string | null } | null;
  application: { id: string; ref: string; amount: number } | null;
}

/** Yubi's own status codes are shown in plain words; "waiting" = Yubi has not reported anything yet. */
export function yubiChipLabel(code: string): string {
  return code === 'waiting' ? 'Waiting for Yubi' : yubiStatusLabel(code);
}

// Yubi's raw codes → the admin's status colours (approved/disbursed green, new lead / offer blue, rejected red).
function yubiTone(code: string): string {
  const s = code.toUpperCase();
  if (s.includes('DISBURS')) return 'disbursed';
  if (s.includes('APPROV')) return 'approved';
  if (s.includes('REJECT') || s.includes('NO_OFFER')) return 'rejected';
  if (s.includes('FAIL')) return 'failed';
  if (s === 'WAITING') return 'pending';
  return 'in_progress';
}

export function YubiRowView({ r }: { r: YubiRow }) {
  const code = r.lastStatus || 'waiting';
  return (
    <tr>
      <CustomerCell customerId={r.customerId} name={r.user?.fullName} phone={r.user?.phone} appId={r.application?.id} appRef={r.application?.ref} />
      {amountCell(r.application?.amount)}
      <td data-label="Status"><StatusBadge status={yubiTone(code)} label={yubiChipLabel(code)} /></td>
      <td data-label="Lender">{r.appliedLender || '—'}</td>
      {dateCell(r.appliedAt ?? r.updatedAt)}
    </tr>
  );
}

/* ─────────────────────────── Revasure ─────────────────────────── */

export interface RevasureRow {
  id: string; status: string; leadId: string | null; message: string | null; lastError: string | null; updatedAt: string;
  customer: { id: string | null; name: string | null; phone: string | null } | null;
  application: { id: string; ref: string; amount: number } | null;
  misStatus: string | null; misDisbursedAmount: number | null; misDisbursementDate: string | null;
}

export const REVASURE_CHIPS: ChipDef[] = [
  { key: '', label: 'All' },
  { key: 'success', label: 'Accepted' },
  { key: 'ineligible', label: 'Not eligible' },
  { key: 'duplicate', label: 'Already registered' },
  { key: 'failed', label: 'Could not send' },
  { key: 'pending', label: 'Pending' },
];
const REVASURE_LABEL: Record<string, string> = Object.fromEntries(REVASURE_CHIPS.filter((c) => c.key).map((c) => [c.key, c.label]));
const REVASURE_TONE: Record<string, string> = { success: 'approved', duplicate: 'converted', ineligible: 'rejected', failed: 'failed', pending: 'pending' };
// The loan status from Revasure's uploaded sheet → status colours.
const MIS_TONE: Record<string, string> = {
  disbursed: 'disbursed', approved: 'approved', rejected: 'rejected', ineligible: 'rejected', cancelled: 'failed',
  pending: 'pending', 'on hold': 'on_hold', 'in process': 'in_progress', login: 'submitted', duplicate: 'converted',
};

function pretty(v: unknown): string {
  if (v == null) return '—';
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

interface LeadDetail { lead: { httpStatus: number | null; sourceLeadId: string | null; leadId: string | null; createdAt: string; message: string | null; lastError: string | null; requestBody: unknown; responseBody: unknown } }

/** The technical detail of one Revasure lead, fetched only when its row is opened. */
function RevasureDetail({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/revasure/${id}`, swrFetcher);
  const lead = (data?.data as LeadDetail | undefined)?.lead;
  return (
    <tr className="adm-detail-row">
      <td colSpan={5}>
        <div className="adm-detail">
          <p className="adm-detail-title">Technical detail for support. Do not share outside the team.</p>
          {error ? (
            <div role="alert">
              <span className="adm-err-text">Could not load the detail - {(error as Error).message}</span>{' '}
              <button type="button" className="btn adm-btn-sm" onClick={() => mutate()}>Retry</button>
            </div>
          ) : isLoading || !lead ? (
            <div className="skeleton" style={{ height: 90 }} aria-busy="true" />
          ) : (
            <>
              <div className="adm-detail-facts">
                <span>Revasure lead ID <b className="mono">{lead.leadId || '—'}</b></span>
                <span>Our lead ID <b className="mono">{lead.sourceLeadId || '—'}</b></span>
                <span>HTTP status <b className="mono">{lead.httpStatus ?? '—'}</b></span>
                <span>Created <b>{dateTimeStr(lead.createdAt)}</b></span>
              </div>
              {(lead.message || lead.lastError) && (
                <div style={{ fontSize: 13 }}>
                  {lead.message && <div><b>Message:</b> {lead.message}</div>}
                  {lead.lastError && <div><b>Last error:</b> <span className="adm-err-text">{lead.lastError}</span></div>}
                </div>
              )}
              <div className="adm-detail-grid">
                <div><div className="adm-detail-pane-label">Request</div><pre className="mono">{pretty(lead.requestBody)}</pre></div>
                <div><div className="adm-detail-pane-label">Response</div><pre className="mono">{pretty(lead.responseBody)}</pre></div>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export function RevasureRowView({ r, open, onToggle }: { r: RevasureRow; open: boolean; onToggle: () => void }) {
  const note = r.status === 'success' ? null : (r.message || r.lastError);
  return (
    <Fragment>
      <tr onClick={onToggle} className={`ap-click${open ? ' adm-row-open' : ''}`} aria-expanded={open} title={open ? 'Hide the technical detail' : 'Show the technical detail'}>
        <CustomerCell customerId={r.customer?.id} name={r.customer?.name} phone={r.customer?.phone} appId={r.application?.id} appRef={r.application?.ref} />
        {amountCell(r.application?.amount)}
        <td data-label="Status">
          <StatusBadge status={REVASURE_TONE[r.status] ?? r.status} label={REVASURE_LABEL[r.status] ?? REVASURE_STATUS_LABEL[r.status] ?? r.status} />
          {note ? <div className="ap-sub ap-clamp" title={note}>{note}</div> : null}
        </td>
        <td data-label="Loan status">
          {r.misStatus ? (
            <>
              <StatusBadge status={MIS_TONE[r.misStatus.toLowerCase()] ?? r.misStatus.toLowerCase()} label={r.misStatus} />
              {r.misDisbursedAmount != null && <div className="ap-sub mono">₹{num(r.misDisbursedAmount)}</div>}
            </>
          ) : <span className="muted">No update</span>}
        </td>
        {dateCell(r.updatedAt)}
      </tr>
      {open && <RevasureDetail id={r.id} />}
    </Fragment>
  );
}
