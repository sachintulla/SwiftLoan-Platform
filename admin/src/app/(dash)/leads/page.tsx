'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, StatCard, SearchBox, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { inr, dateStr, humanStatus, num } from '@/lib/format';
import { ChannelChips, ChannelChip, ConversationOutcome, relTime } from '@/components/conversation';

const FILTERS = [
  { key: '', label: 'All' }, { key: 'new', label: 'New' }, { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' }, { key: 'converted', label: 'Converted' }, { key: 'lost', label: 'Lost' },
];

// Rolled up by the API from every channel this number has ever used.
interface LeadConversations {
  count?: number | null;
  channels?: string[] | null;
  channelLabels?: string[] | null;
  lastAt?: string | null;
  lastChannel?: string | null;
  lastChannelLabel?: string | null;
  lastOutcome?: string | null;
  lastOutcomeConfirmed?: boolean | null;
  summary?: string | null;
}
interface Lead {
  id: string; name?: string; phone?: string; city?: string; productInterest?: string;
  amount?: number; source: string; campaignId?: string; status: string; createdAt: string;
  conversations?: LeadConversations | null;
}

// Defensive: the endpoint returns a plain array today, but degrade rather than throw.
function asRows(x: unknown): Lead[] {
  if (Array.isArray(x)) return x as Lead[];
  const items = (x as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as Lead[]) : [];
}

const channelCount = (l: Lead) => (Array.isArray(l.conversations?.channels) ? l.conversations!.channels!.length : 0);
const convCount = (l: Lead) => l.conversations?.count ?? 0;

export default function LeadsPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}), ...(search ? { search } : {}) });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/leads?${qs.toString()}`, swrFetcher);
  const rows = asRows(data?.data);
  const pg = data?.pagination;

  const totalLeads = pg?.total ?? rows.length;
  const spokenTo = rows.filter((l) => convCount(l) > 0).length;
  const crossChannel = rows.filter((l) => channelCount(l) > 1).length;

  async function setLeadStatus(id: string, s: string) {
    await apiFetch(`/api/admin/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) });
    mutate();
  }

  return (
    <div className="page">
      <h1 className="page-title">Leads & Contact</h1>
      <p className="page-sub">Anonymous leads captured by the widget and app, with source attribution and the full conversation history for each number.</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 18 }}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="stat"><div className="skeleton" style={{ height: 46 }} /></div>)
        ) : (
          <>
            <StatCard label="Leads" value={num(totalLeads)} icon="✦" tone="blue" foot={status || search ? 'matching these filters' : 'captured in total'} />
            <StatCard label="Spoken to" value={num(spokenTo)} icon="☎" tone="teal" foot={`have conversation history (of ${num(rows.length)} shown)`} />
            <StatCard label="Cross-channel" value={num(crossChannel)} icon="⇄" tone="green" foot="used more than one surface" />
          </>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <FilterChips options={FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone, city…" />
        </div>
        {error ? (
          <div className="empty">Could not load leads — {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading ? <TableSkeleton rows={8} cols={7} /> : rows.length === 0 ? (
          <Empty label={status || search ? 'No leads match these filters' : 'No leads captured yet'} />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Name</th><th>Phone</th><th>City</th><th>Interest</th><th>Amount</th><th>Source</th>
              <th style={{ textAlign: 'right' }}>Convs</th><th>Channels used</th><th>Last activity</th><th>Last outcome</th>
              <th>Status</th><th>Created</th>
            </tr></thead>
            <tbody>{rows.map((l) => {
              const c = l.conversations ?? null;
              const n = convCount(l);
              return (
              <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                <td>{l.name || <span className="muted">Anonymous</span>}</td>
                <td className="mono">{l.phone || '—'}</td>
                <td>{l.city || '—'}</td>
                <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{l.productInterest || '—'}</td>
                <td className="mono">{l.amount ? inr(l.amount) : '—'}</td>
                <td><span className="badge tone-grey">{l.source}{l.campaignId ? ` · ${l.campaignId}` : ''}</span></td>
                {/* conversation roll-up: never blank — "none" when we have never spoken */}
                <td className="mono" style={{ textAlign: 'right' }}>{n > 0 ? n : <span className="muted">none</span>}</td>
                <td>{n > 0 ? <ChannelChips channels={c?.channels} labels={c?.channelLabels} /> : <span className="muted">none</span>}</td>
                <td>
                  {n > 0 ? (
                    <div style={{ display: 'grid', gap: 3 }}>
                      <span className="muted" style={{ fontSize: 12 }}>{relTime(c?.lastAt)}</span>
                      <ChannelChip channel={c?.lastChannel} label={c?.lastChannelLabel} />
                    </div>
                  ) : <span className="muted">never spoken</span>}
                </td>
                <td>{n > 0
                  ? <ConversationOutcome outcome={c?.lastOutcome} outcomeConfirmed={c?.lastOutcomeConfirmed} />
                  : <span className="muted">none</span>}</td>
                {/* stop row navigation when using the inline status control */}
                <td onClick={(e) => e.stopPropagation()}>
                  <select className="input" style={{ padding: '4px 8px', width: 'auto', fontSize: 12 }} value={l.status} onChange={(e) => setLeadStatus(l.id, e.target.value)}>
                    {['new', 'contacted', 'qualified', 'converted', 'lost'].map((s) => <option key={s} value={s}>{humanStatus(s)}</option>)}
                  </select>
                </td>
                <td className="muted">{dateStr(l.createdAt)}</td>
              </tr>
            ); })}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
      </div>
    </div>
  );
}
