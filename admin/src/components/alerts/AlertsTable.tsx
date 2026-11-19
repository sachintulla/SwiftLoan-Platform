'use client';
// The Alerts table and the panel that opens from a row. Shared by the Alerts page (every customer) and the customer
// page's Alerts tab (one customer). One row = one thing we sent: exact time, type, a plain name, how it ended, and
// the error when it failed. Nothing else is shown on the row; the rest is in the panel.
import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Modal } from '@/components/ui';
import { Transcript } from '@/components/callDetail';
import { dateTimeStr } from '@/lib/format';
import { callLength, outcomeTone, type AlertDetail, type AlertRow } from '@/lib/alerts';

const linkButton: React.CSSProperties = {
  background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, color: 'inherit', cursor: 'pointer', textAlign: 'left',
};
const DASH = <span className="muted">—</span>;

export function AlertsTable({ rows, showCustomer, onOpen }: {
  rows: AlertRow[];
  /** The Alerts page shows who it went to; the customer page does not need the column. */
  showCustomer: boolean;
  onOpen: (row: AlertRow) => void;
}) {
  return (
    <div className="table-wrap"><table className="data">
      <thead><tr>
        <th>Time</th>
        {showCustomer && <th>Customer</th>}
        <th>Type</th><th>Alert</th><th>Status</th><th>Error</th>
      </tr></thead>
      <tbody>{rows.map((r) => {
        const length = callLength(r.durationSec);
        return (
          <tr key={`${r.type}:${r.id}`} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
            <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{dateTimeStr(r.at)}</td>
            {showCustomer && (
              <td>
                {r.customerId
                  ? <Link href={`/customers/${r.customerId}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{r.customerName || r.phone || 'Unknown'}</Link>
                  : <span style={{ fontWeight: 600 }}>{r.customerName || r.phone || 'Unknown'}</span>}
                {r.phone && r.customerName && <div className="mono muted" style={{ fontSize: 11.5 }}>{r.phone}</div>}
              </td>
            )}
            <td><span className="badge tone-grey">{r.typeLabel}</span></td>
            <td>
              <button type="button" style={linkButton} onClick={(e) => { e.stopPropagation(); onOpen(r); }} aria-label={`${r.name}: open details`}>{r.name}</button>
            </td>
            <td>
              <div style={{ display: 'grid', gap: 3, justifyItems: 'start' }}>
                <span className={`badge tone-${outcomeTone(r.outcome)}`}>{r.status}</span>
                {length && <span className="muted" style={{ fontSize: 11.5 }}>{length}</span>}
              </div>
            </td>
            <td style={{ fontSize: 12.5, maxWidth: 320, overflowWrap: 'anywhere', color: r.error ? 'var(--red)' : undefined }}>{r.error || DASH}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 13.5, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</div>
    </>
  );
}

/** Everything about one alert: who, the exact times, the message text or the call's recording and transcript. */
export function AlertDetailModal({ row, onClose }: { row: Pick<AlertRow, 'id' | 'type' | 'typeLabel' | 'name'>; onClose: () => void }) {
  const { data, error, isLoading } = useSWR(`/api/admin/alerts/${row.type}/${row.id}`, swrFetcher, { revalidateOnFocus: false });
  const d = data?.data as AlertDetail | undefined;
  const length = callLength(d?.call?.durationSec);

  return (
    <Modal
      onClose={onClose}
      width={600}
      title={(
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <span>{row.typeLabel} · {row.name}</span>
          {d && <span className={`badge tone-${outcomeTone(d.outcome)}`}>{d.status}</span>}
        </span>
      )}
    >
      {error ? (
        <div className="empty">Could not load this alert. {(error as Error).message}</div>
      ) : isLoading || !d ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: '8px 12px' }}>
            <Fact label="To">
              {d.customer.id
                ? <Link href={`/customers/${d.customer.id}`} style={{ fontWeight: 600 }}>{d.customer.name || d.customer.phone || 'Unknown'}</Link>
                : <b>{d.customer.name || d.customer.phone || 'Unknown'}</b>}
              {d.customer.name && d.customer.phone && <span className="mono muted"> · {d.customer.phone}</span>}
            </Fact>
            {d.times.map((t) => (
              <Fact key={t.label} label={t.label}><span className="mono">{dateTimeStr(t.at)}</span></Fact>
            ))}
            {length && <Fact label="Length">{length}</Fact>}
            {d.call?.result && <Fact label="Result">{d.call.result}</Fact>}
            {d.sentBecause && <Fact label="Sent because">{d.sentBecause}</Fact>}
            <Fact label="Error">{d.error ? <span style={{ color: 'var(--red)' }}>{d.error}</span> : DASH}</Fact>
          </div>

          {d.text && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Message</div>
              <div style={{ background: 'var(--surface-2, #f2f4f7)', borderRadius: 10, padding: '12px 14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{d.text}</div>
            </div>
          )}

          {d.call?.summary && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Summary</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{d.call.summary}</div>
            </div>
          )}

          {d.call?.recordingUrl && (
            <div><a className="btn btn-primary" href={d.call.recordingUrl} target="_blank" rel="noreferrer">Play recording</a></div>
          )}

          {d.call && <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><Transcript transcript={d.call.transcript} /></div>}

          {d.template && d.type !== 'call' && (
            <div className="muted mono" style={{ fontSize: 11.5 }}>{d.type === 'push' ? 'Event' : 'Template'}: {d.template}</div>
          )}
        </div>
      )}
    </Modal>
  );
}
