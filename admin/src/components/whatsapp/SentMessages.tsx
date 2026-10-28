'use client';
// Every message we sent (WhatsApp and SMS), one row each: who it went to, which template, what it said, when, what triggered it, and whether it arrived.
// Filter by status, trigger, template and date; search by mobile number. Data: GET /api/admin/messages (enriched with the text and trigger).
import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { FilterChips, Modal, PagerBar, SearchBox, Select, TableSkeleton } from '@/components/ui';
import { dateTimeStr, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { Chip, cap } from '@/components/whatsapp/ui';

interface EventLog { at: string; status: string | null; raw: string; code?: string | null; reason?: string | null }
interface Trigger { by: string; stage?: string; since?: string; step?: string }
interface Sent {
  id: string; channel: string; providerRef: string | null; referenceId: string | null; phone: string | null; name: string | null;
  template: string | null; language: string | null; category: string | null; variables: string[] | null; text: string | null;
  kind: string; trigger: Trigger | null; status: string; stuck: boolean;
  failureCode: string | null; failureReason: string | null;
  sentAt: string | null; deliveredAt: string | null; readAt: string | null; failedAt: string | null; lastEventAt: string | null;
  events: EventLog[]; createdAt: string;
}
interface Facets { templates: { name: string; count: number }[]; kinds: { kind: string; count: number }[] }

const KIND_LABEL: Record<string, string> = {
  app_dropoff: 'Drop-off', install_reminder: 'Install reminder', applied_nudge: 'You applied', stall: 'Stuck-stage', admin: 'Sent by an admin', test: 'Test', other: 'Other', unknown: 'Unknown', unparsed: 'Unreadable report',
};
const STATUS_FILTERS = [
  { key: '', label: 'All' }, { key: 'delivered,read', label: 'Delivered' }, { key: 'queued,sent', label: 'Waiting' }, { key: 'failed', label: 'Failed' },
];
const RANGES = [
  { value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '', label: 'All time' },
];

/** +91 98765 43210 */
function phoneStr(p: string | null): string {
  const d = (p ?? '').replace(/\D/g, '');
  const ten = d.length > 10 ? d.slice(-10) : d;
  return ten.length === 10 ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : p ?? '—';
}

function DeliveryChip({ m }: { m: Sent }) {
  if (m.status === 'delivered') return <Chip tone="green">Delivered</Chip>;
  if (m.status === 'read') return <Chip tone="green">Read</Chip>;
  if (m.status === 'failed') return <Chip tone="red">Failed</Chip>;
  if (m.stuck) return <Chip tone="amber" title="Vox accepted it but has not reported on it yet.">Waiting</Chip>;
  if (m.status === 'sent') return <Chip tone="blue">Sent</Chip>;
  return <Chip tone="grey">Waiting</Chip>;
}

/** One plain sentence on what happened, so nobody has to read the event log to know. */
function statusDetail(m: Sent): string {
  if (m.status === 'failed') return [m.failureReason, m.failureCode && `(${m.failureCode})`].filter(Boolean).join(' ') || 'The gateway refused it.';
  if (m.status === 'read') return `Read ${timeAgo(m.readAt ?? m.lastEventAt)}.`;
  if (m.status === 'delivered') return `Delivered ${timeAgo(m.deliveredAt ?? m.lastEventAt)}.`;
  if (m.stuck) return `Accepted by Vox, but no delivery report ${timeAgo(m.createdAt).replace(' ago', '')} later.`;
  if (m.status === 'sent') return 'Sent to WhatsApp, not delivered yet.';
  return 'Accepted by Vox. Waiting for a report.';
}

function TriggerCell({ m }: { m: Sent }) {
  const t = m.trigger;
  if (!t) return <span className="muted" style={{ fontSize: 12.5 }}>{KIND_LABEL[m.kind] ?? m.kind}</span>;
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 600 }}>{t.by}</div>
      {t.stage && <div className="muted">At: {t.stage}</div>}
      {t.step && <div className="muted">{t.step}</div>}
      {t.since && <div className="muted">Since {dateTimeStr(t.since)}</div>}
    </div>
  );
}

function MessageCell({ m }: { m: Sent }) {
  if (m.text) return <div style={{ fontSize: 12.5, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={m.text}>{m.text}</div>;
  if (m.variables && m.variables.length) {
    return (
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }} title={m.variables.join(' · ')}>
        <div className="muted" style={{ fontSize: 11.5 }}>Values sent</div>
        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all' }}>{m.variables.join(' · ')}</div>
      </div>
    );
  }
  return <span className="muted" style={{ fontSize: 12.5 }}>Not recorded</span>;
}

const SECTION: React.CSSProperties = { fontSize: 11.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-dim)', margin: '18px 0 8px' };

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span className="muted">{k}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

function MessagePopup({ m, onClose }: { m: Sent; onClose: () => void }) {
  return (
    <Modal onClose={onClose} width={620} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{niceName(m.template, m.channel)} <DeliveryChip m={m} /></span>}>
      <KV k="Number"><span className="mono">{phoneStr(m.phone)}</span>{m.name ? ` · ${m.name}` : ''}</KV>
      <KV k="Channel">{m.channel === 'sms' ? 'SMS' : 'WhatsApp'}</KV>
      <KV k="Sent">{dateTimeStr(m.sentAt ?? m.createdAt)} <span className="muted">({timeAgo(m.sentAt ?? m.createdAt)})</span></KV>
      <KV k="Status">{statusDetail(m)}</KV>
      <KV k="Why">{m.trigger ? [m.trigger.by, m.trigger.stage && `at ${m.trigger.stage}`, m.trigger.step].filter(Boolean).join(' · ') : (KIND_LABEL[m.kind] ?? m.kind)}</KV>
      {m.trigger?.since && <KV k="Customer stopped">{dateTimeStr(m.trigger.since)}</KV>}
      {m.template && m.channel !== 'sms' && <KV k="Template"><span className="mono">{m.template}</span>{m.language ? ` · ${m.language}` : ''}{m.category ? ` · ${cap(m.category)}` : ''}</KV>}

      <div style={SECTION}>Message</div>
      {m.text ? (
        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.text}</div>
      ) : m.variables && m.variables.length > 0 ? (
        <div style={{ display: 'grid', gap: 4 }}>
          {m.variables.map((v, i) => (
            <div key={i} style={{ fontSize: 13, display: 'flex', gap: 10 }}>
              <span className="mono muted" style={{ width: 40, flexShrink: 0 }}>{`{{${i + 1}}}`}</span>
              <span style={{ wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      ) : <div className="muted" style={{ fontSize: 13 }}>Not recorded</div>}

      <div style={SECTION}>What happened</div>
      {m.events.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No reports received yet</div> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {m.events.map((e, i) => (
            <div key={i} style={{ fontSize: 13, display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
              <span className="muted">{dateTimeStr(e.at)}</span>
              <span>{e.raw}{e.status ? ` → ${e.status}` : ''}{e.reason ? ` (${e.reason})` : ''}</span>
            </div>
          ))}
        </div>
      )}
      <div className="muted mono" style={{ marginTop: 18, fontSize: 11.5, wordBreak: 'break-all' }}>
        {m.providerRef ? `Vox ID ${m.providerRef}` : 'No Vox ID (refused)'}{m.referenceId ? ` · ref ${m.referenceId}` : ''}
      </div>
    </Modal>
  );
}

const CHANNELS = [{ value: '', label: 'All channels' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }];

/** dropoff_continue_app -> Dropoff Continue App (the way Vox lists it). */
const niceName = (t: string | null, channel: string): string => (channel === 'sms' ? 'Text Message' : t ? t.split(/[_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '-');

/** "WhatsApp · Drop-off · Basic details": how it went and why, in one short line. */
function whyLine(m: Sent): string {
  return [m.channel === 'sms' ? 'SMS' : 'WhatsApp', KIND_LABEL[m.kind] ?? m.kind, m.trigger?.stage].filter(Boolean).join(' · ');
}

export default function SentMessages() {
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [kind, setKind] = useState('');
  const [template, setTemplate] = useState('');
  const [range, setRange] = useState('7d');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [more, setMore] = useState(false);
  const [viewing, setViewing] = useState<Sent | null>(null);
  const dSearch = useDebounced(search, 300);

  useEffect(() => { setPage(1); }, [status, channel, kind, template, range, dSearch, pageSize]);

  const qs = new URLSearchParams({
    page: String(page), pageSize: String(pageSize),
    ...(channel ? { channel } : {}),
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}), ...(template ? { template } : {}), ...(range ? { range } : {}),
    ...(dSearch ? { search: dSearch } : {}),
  });
  const { data, isLoading } = useSWR(`/api/admin/messages?${qs.toString()}`, swrFetcher, { refreshInterval: 10000, keepPreviousData: true });
  const { data: facetRes } = useSWR(`/api/admin/messages/facets${channel ? `?channel=${channel}` : ''}`, swrFetcher);
  const rows = (data?.data ?? []) as Sent[];
  const pg = data?.pagination as { page: number; totalPages: number; total?: number } | undefined;
  const facets = facetRes?.data as Facets | undefined;

  const kindOptions = useMemo(() => [{ value: '', label: 'All reasons' }, ...(facets?.kinds ?? []).map((k) => ({ value: k.kind, label: `${KIND_LABEL[k.kind] ?? k.kind} (${k.count})` }))], [facets]);
  const templateOptions = useMemo(() => [{ value: '', label: 'All templates' }, ...(facets?.templates ?? []).map((t) => ({ value: t.name, label: `${t.name} (${t.count})` }))], [facets]);
  const filtered = !!(status || channel || kind || template || dSearch);

  return (
    <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
      <div className="row between wrap" style={{ gap: 12, alignItems: 'center' }}>
        <FilterChips value={status} onChange={setStatus} options={STATUS_FILTERS} />
        <SearchBox value={search} onChange={setSearch} placeholder="Search a mobile number…" />
      </div>
      <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
        <div style={{ minWidth: 150 }}><Select<string> value={channel} onChange={setChannel} options={CHANNELS} /></div>
        <div style={{ minWidth: 150 }}><Select<string> value={range} onChange={setRange} options={RANGES} /></div>
        <button type="button" className="btn" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Fewer filters' : 'More filters'}</button>
        {filtered && <button className="btn" onClick={() => { setStatus(''); setChannel(''); setKind(''); setTemplate(''); setSearch(''); }}>Clear</button>}
      </div>
      {more && (
        <div className="row wrap" style={{ gap: 10 }}>
          <div style={{ minWidth: 190 }}><Select<string> value={kind} onChange={setKind} options={kindOptions} /></div>
          <div style={{ minWidth: 230 }}><Select<string> value={template} onChange={setTemplate} options={templateOptions} /></div>
        </div>
      )}

      {isLoading && !data ? <TableSkeleton rows={6} cols={4} /> : rows.length === 0 ? (
        <div className="empty">{filtered || range ? 'No messages match.' : 'No messages yet.'}</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data brand-table">
              <thead>
                <tr><th>Number</th><th>Message</th><th>Status</th><th>Sent time</th><th style={{ width: 70, textAlign: 'right' }}>Action</th></tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} onClick={() => setViewing(m)}>
                    <td style={{ whiteSpace: 'nowrap' }} className="mono">{phoneStr(m.phone)}</td>
                    <td style={{ fontWeight: 600 }}>{niceName(m.template, m.channel)}</td>
                    <td>
                      <DeliveryChip m={m} />
                      {m.status === 'failed' && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, maxWidth: 200 }}>{(m.failureReason ?? '').slice(0, 60)}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }} title={timeAgo(m.sentAt ?? m.createdAt)}>{dateTimeStr(m.sentAt ?? m.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn row-act" aria-label="View message" onClick={(e) => { e.stopPropagation(); setViewing(m); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PagerBar page={pg?.page ?? page} pageSize={pageSize} total={pg?.total ?? rows.length} onPage={setPage} onPageSize={setPageSize} />
        </>
      )}
      {viewing && <MessagePopup m={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
