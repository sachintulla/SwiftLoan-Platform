'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton, Empty, Callout } from '@/components/ui';
import { dateStr, timeStr, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

interface EventLog { at: string; status: string | null; raw: string; code?: string | null; reason?: string | null }
interface Msg {
  id: string; channel: 'whatsapp' | 'sms'; providerRef: string | null; gtrid: string | null; referenceId: string | null;
  phone: string | null; template: string | null; kind: string; status: string; stuck: boolean;
  failureCode: string | null; failureReason: string | null; sentAt: string | null; deliveredAt: string | null; readAt: string | null; failedAt: string | null;
  lastEventAt: string | null; events: EventLog[]; createdAt: string;
}
interface Summary {
  counts: Record<string, Record<string, number>>; stuck: number;
  callbackConfigured: boolean; webhookKeySet: boolean; publicBaseIsHttps: boolean;
}

const STATUS_FILTERS = [
  { key: '', label: 'All' }, { key: 'delivered', label: 'Delivered' }, { key: 'read', label: 'Read' }, { key: 'sent', label: 'Sent' },
  { key: 'queued', label: 'Queued' }, { key: 'failed', label: 'Failed' }, { key: 'stuck', label: 'No report' },
];
const CHANNEL_FILTERS = [{ key: '', label: 'All channels' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'sms', label: 'SMS' }];
const KIND_LABEL: Record<string, string> = {
  install_reminder: 'Install reminder', app_dropoff: 'Drop-off message', applied_nudge: 'Applied-to-lender nudge', stall: 'Stuck-stage nudge', admin: 'Sent by admin', test: 'Test', other: 'Other', unknown: 'Unknown (callback only)', unparsed: 'Unreadable callback',
};

export default function MessagesPage() {
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const dSearch = useDebounced(search, 300);

  const qs = new URLSearchParams({
    page: String(page), pageSize: '25',
    ...(status === 'stuck' ? { stuck: '1' } : status ? { status } : {}),
    ...(channel ? { channel } : {}),
    ...(dSearch ? { search: dSearch } : {}),
  });
  const { data, isLoading } = useSWR(`/api/admin/messages?${qs.toString()}`, swrFetcher, { refreshInterval: 10000 });
  const { data: sumRes } = useSWR('/api/admin/messages/summary', swrFetcher, { refreshInterval: 10000 });
  const rows = (data?.data ?? []) as Msg[];
  const pg = data?.pagination;
  const sum = sumRes?.data as Summary | undefined;
  const wa = sum?.counts?.whatsapp ?? {};

  return (
    <div className="page">
      <h1 className="page-title">Messages</h1>
      <p className="page-sub">WhatsApp and SMS we sent, and what happened to them. A &quot;queued&quot; answer from the provider only means it accepted the message: delivery reports below show whether it reached the phone.</p>

      {sum && !sum.callbackConfigured && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="amber" icon="⚠">
            WhatsApp delivery reports cannot reach us yet, so every message will stay at &quot;queued&quot;.
            {!sum.webhookKeySet && <> Set <span className="mono">WHATSAPP_WEBHOOK_KEY</span> on the server.</>}
            {!sum.publicBaseIsHttps && <> Set <span className="mono">PUBLIC_BASE_URL</span> to the server&apos;s public https address.</>}
            {' '}Or paste a callback URL in Configs → Voxvalley (<span className="mono">callbackUrl</span>). The URL is <span className="mono">…/api/webhooks/whatsapp?key=&lt;key&gt;</span>.
          </Callout>
        </div>
      )}
      {sum && sum.stuck > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="red" icon="!">
            {sum.stuck} WhatsApp message{sum.stuck === 1 ? '' : 's'} accepted by the gateway but with no delivery report after 15 minutes. Check the template approval and sender in the provider portal, quoting the message ID.
          </Callout>
        </div>
      )}

      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <Tile label="Delivered (24 h)" value={(wa.delivered ?? 0) + (wa.read ?? 0)} tone="green" />
        <Tile label="Read" value={wa.read ?? 0} tone="teal" />
        <Tile label="Sent, no report" value={wa.sent ?? 0} tone="blue" />
        <Tile label="Queued" value={wa.queued ?? 0} tone="amber" />
        <Tile label="Failed" value={wa.failed ?? 0} tone="red" />
        <Tile label="Stuck 15 min+" value={sum?.stuck} tone="red" />
      </div>

      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <div className="row wrap" style={{ gap: 14 }}>
            <FilterChips options={STATUS_FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
            <FilterChips options={CHANNEL_FILTERS} value={channel} onChange={(v) => { setChannel(v); setPage(1); }} />
          </div>
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Phone, message ID, template…" />
        </div>

        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty label="No messages match" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Sent</th><th>Channel</th><th>To</th><th>Template</th><th>Purpose</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} onClick={() => setOpenId(m.id)} style={m.id === openId ? { background: 'var(--teal-bg)' } : undefined}>
                    <td className="muted" title={dateStr(m.createdAt)}>{timeAgo(m.createdAt)}</td>
                    <td>{m.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</td>
                    <td className="mono">{m.phone ? `+91 ${m.phone}` : '—'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{m.template ?? '—'}</td>
                    <td>{KIND_LABEL[m.kind] ?? m.kind}</td>
                    <td><StatusBadge status={m.status} />{m.stuck && <span className="badge tone-red" style={{ marginLeft: 6 }}>No report</span>}</td>
                    <td style={{ maxWidth: 300 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.failureReason ?? ''}>{detail(m)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>

      {openId && <Panel key={openId} id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** Date and time, because "when exactly" is the point of a delivery log. */
const when = (iso: string | null | undefined) => (iso ? `${dateStr(iso)}, ${timeStr(iso)}` : '—');

function detail(m: Msg): string {
  if (m.status === 'failed') return [m.failureCode, m.failureReason].filter(Boolean).join(' · ') || 'Failed (no reason given)';
  if (m.stuck) return `Accepted ${timeAgo(m.createdAt)}, no delivery report yet`;
  if (m.status === 'read' && m.readAt) return `Read ${timeAgo(m.readAt)}`;
  if (m.status === 'delivered' && m.deliveredAt) return `Delivered ${timeAgo(m.deliveredAt)}`;
  if (m.channel === 'sms') return 'Accepted by the SMS gateway';
  return '';
}

function Tile({ label, value, tone }: { label: string; value: number | undefined; tone: 'amber' | 'blue' | 'green' | 'red' | 'teal' }) {
  return (
    <div className="card card-pad" style={{ minWidth: 140, flex: '1 1 140px' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2, color: `var(--${tone})` }}>{value ?? '—'}</div>
    </div>
  );
}

function Panel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, error } = useSWR(`/api/admin/messages/${id}`, swrFetcher, { refreshInterval: 10000 });
  const m = data?.data as Msg | undefined;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <aside className="card" style={{ width: '100%', maxWidth: 520, height: '100%', borderRadius: 0, overflowY: 'auto', padding: 22 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Message details">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>{m ? (m.channel === 'whatsapp' ? 'WhatsApp message' : 'SMS') : 'Message'}</div>
            <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{m?.phone ? `+91 ${m.phone}` : 'Message'}</h2>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {isLoading && <div style={{ marginTop: 18 }}><TableSkeleton rows={5} cols={2} /></div>}
        {error && <div style={{ marginTop: 18 }}><Callout tone="red">Could not load this message.</Callout></div>}
        {m && (
          <>
            <div className="row wrap" style={{ gap: 8, margin: '12px 0 16px' }}>
              <StatusBadge status={m.status} />
              {m.stuck && <span className="badge tone-red">No delivery report after 15 min</span>}
              <span className="badge tone-grey">{KIND_LABEL[m.kind] ?? m.kind}</span>
            </div>
            {m.status === 'failed' && (
              <div style={{ marginBottom: 16 }}>
                <Callout tone="red" icon="!">
                  <strong>{m.failureCode ? `Error ${m.failureCode}` : 'Failed'}</strong>{m.failureReason ? `: ${m.failureReason}` : ' (the provider gave no reason)'}
                </Callout>
              </div>
            )}
            <dl style={{ display: 'grid', gridTemplateColumns: '130px 1fr', rowGap: 8, fontSize: 13.5, margin: 0 }}>
              <KV k="Template" v={m.template ?? '—'} mono />
              <KV k="Message ID" v={m.providerRef ?? '— (rejected before an ID was issued)'} mono />
              <KV k="Gateway trace" v={m.gtrid ?? '—'} mono />
              <KV k="Our reference" v={m.referenceId ?? '—'} mono />
              <KV k="Accepted" v={when(m.createdAt)} />
              <KV k="Sent" v={when(m.sentAt)} />
              <KV k="Delivered" v={when(m.deliveredAt)} />
              <KV k="Read" v={when(m.readAt)} />
            </dl>
            <h3 style={{ fontSize: 14, margin: '22px 0 8px' }}>Reports received</h3>
            {m.events.length === 0 ? <span className="muted">None.</span> : (
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {m.events.map((e, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <span className="mono">{e.raw}</span>{e.status && e.status !== e.raw && <span className="muted"> → {e.status}</span>}
                    {(e.code || e.reason) && <div style={{ color: 'var(--red)' }}>{[e.code, e.reason].filter(Boolean).join(' · ')}</div>}
                    <div className="muted" style={{ fontSize: 12 }}>{when(e.at)}</div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (<><dt className="muted">{k}</dt><dd style={{ margin: 0, wordBreak: 'break-all' }} className={mono ? 'mono' : undefined}>{v}</dd></>);
}
