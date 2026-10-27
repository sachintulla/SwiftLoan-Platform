'use client';
// The call log: one row per call, newest first. A row opens (lazily loading the
// full call) to show what was said, the details, the transcript and recording,
// and, for a call that failed or was not answered, a "Call again" action behind a
// confirmation. Reuses callDetail.tsx for the call card and the outcome cell.
import React, { useId, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { StatusBadge, ConfirmDialog, TableSkeleton } from '@/components/ui';
import { OutcomeCell, CallAttemptCard, secs, type CallAttemptDetail } from '@/components/callDetail';
import { dateTimeStr, timeAgo } from '@/lib/format';
import { purposeLabel, statusWord, answeredWord, canCallAgain, triggerErrorMessage } from '@/lib/calls';
import './calls.css';

export interface CallListItem {
  id: string;
  phone: string;
  status: string | null;
  outcome: string | null;
  outcomeSource: string | null;
  answered: boolean | null;
  durationSec: number | null;
  summary: string | null;
  purpose: string | null;
  callbackAt: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  campaignId: string | null;
  customer: { id: string; name: string | null; phone: string } | null;
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 6l4.5 4.5L12.5 6" />
    </svg>
  );
}

/** Everything under an opened row. Loads the full call only now, not for every row. */
function CallDetail({
  call, isSuperAdmin, onCalled,
}: {
  call: CallListItem;
  isSuperAdmin: boolean;
  onCalled: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/calls/${call.id}`, swrFetcher);
  const full = data?.data as CallAttemptDetail | undefined;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const whyId = useId();

  const name = call.customer?.name || 'this customer';
  const mobile = call.customer?.phone || call.phone;
  const again = canCallAgain(call.status, call.answered);

  async function placeCall() {
    setBusy(true);
    setResult(null);
    try {
      await apiFetch('/api/admin/calls/trigger', {
        method: 'POST',
        body: JSON.stringify(call.customer ? { customerId: call.customer.id } : { phone: call.phone }),
      });
      setResult({ ok: true, text: `Call placed to ${mobile}. It appears at the top of this list shortly.` });
      onCalled();
    } catch (e) {
      const err = e as ApiError;
      setResult({ ok: false, text: `${triggerErrorMessage({ status: err.status, message: err.message, body: err.body })} Nothing was dialled.` });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="adm-calls-detail">
      <h4>What was said</h4>
      <p className="adm-calls-said">
        {call.summary || full?.summary || <span className="muted">No summary was recorded for this call.</span>}
      </p>

      {error ? (
        <div className="adm-calls-error" role="alert">
          Could not load the call - {(error as Error).message}{' '}
          <button type="button" className="btn" onClick={() => mutate()}>Retry</button>
        </div>
      ) : isLoading || !full ? (
        <div aria-busy="true"><TableSkeleton rows={3} cols={3} /></div>
      ) : (
        // The summary is shown above, so the card gets none of its own.
        <CallAttemptCard call={{ ...full, summary: null }} />
      )}

      <div className="adm-calls-actions">
        {call.customer ? (
          <Link className="btn" href={`/customers/${call.customer.id}`}>Open customer</Link>
        ) : (
          <span className="muted" style={{ fontSize: 12.5 }}>Not matched to a customer</span>
        )}
        {again && (
          <>
            <button
              type="button"
              className="btn"
              disabled={!isSuperAdmin || busy}
              aria-describedby={isSuperAdmin ? undefined : whyId}
              aria-busy={busy || undefined}
              onClick={() => { setResult(null); setConfirming(true); }}
            >
              {busy ? 'Calling...' : 'Call again'}
            </button>
            {!isSuperAdmin && <span id={whyId} className="adm-calls-why">Needs a super admin</span>}
          </>
        )}
      </div>
      <div className={`adm-calls-msg${result ? (result.ok ? ' ok' : ' err') : ''}`} aria-live="polite">{result?.text ?? ''}</div>

      {confirming && (
        <ConfirmDialog
          title="Place a call now?"
          tone="red"
          confirmLabel="Place call"
          busy={busy}
          message={`Place a call to ${name} on ${mobile} now? This rings their phone within seconds. It cannot be undone.`}
          onConfirm={placeCall}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function CallRow({
  call, open, onToggle, isSuperAdmin, onCalled,
}: {
  call: CallListItem;
  open: boolean;
  onToggle: () => void;
  isSuperAdmin: boolean;
  onCalled: () => void;
}) {
  const detailId = useId();
  const when = call.queuedAt ?? call.startedAt;
  const word = answeredWord(call.status, call.answered);
  const who = call.customer?.name || call.customer?.phone || call.phone;
  return (
    <>
      <tr className={`adm-calls-row${open ? ' is-open' : ''}`} onClick={onToggle}>
        <td className="c-when">
          <div>{when ? dateTimeStr(when) : '-'}</div>
          <div className="adm-calls-sub">{when ? timeAgo(when) : ''}</div>
        </td>
        <td className="c-cust">
          {call.customer ? (
            <Link className="adm-calls-name" href={`/customers/${call.customer.id}`} onClick={(e) => e.stopPropagation()}>
              {call.customer.name || 'Unknown name'}
            </Link>
          ) : (
            <span className="muted" style={{ fontWeight: 600 }}>Not matched</span>
          )}
          <div className="adm-calls-sub mono">{call.customer?.phone || call.phone}</div>
        </td>
        <td className="c-why">{purposeLabel(call.purpose)}</td>
        <td className="c-result">
          <StatusBadge status={call.status} label={statusWord(call.status)} />
          {word && <div className="adm-calls-sub">{word}</div>}
        </td>
        <td className="c-outcome">
          <OutcomeCell outcome={call.outcome} source={call.outcomeSource} />
          {call.summary ? <div className="adm-calls-clip">{call.summary}</div> : null}
        </td>
        <td className="c-len mono">{secs(call.durationSec)}</td>
        <td className="c-chev">
          <button
            type="button"
            className="adm-calls-chev"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${open ? 'Hide' : 'Show'} details of the call with ${who}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            <Chevron />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="adm-calls-detailrow">
          <td id={detailId} colSpan={7} className="adm-calls-detail-cell">
            <CallDetail call={call} isSuperAdmin={isSuperAdmin} onCalled={onCalled} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function CallsLog({
  items, loading, openId, onOpen, isSuperAdmin, onCalled,
}: {
  items: CallListItem[];
  loading: boolean;
  openId: string | null;
  onOpen: (id: string | null) => void;
  isSuperAdmin: boolean;
  onCalled: () => void;
}) {
  if (loading) return <div aria-busy="true"><TableSkeleton rows={8} cols={6} /></div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="adm-calls-table">
        <caption className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Calls placed by the voice agent, newest first
        </caption>
        <thead>
          <tr>
            <th>When</th><th>Customer</th><th>Why we called</th><th>Result</th><th>Outcome</th><th>Length</th>
            <th><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Details</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <CallRow
              key={c.id}
              call={c}
              open={openId === c.id}
              onToggle={() => onOpen(openId === c.id ? null : c.id)}
              isSuperAdmin={isSuperAdmin}
              onCalled={onCalled}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
