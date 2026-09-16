'use client';
// Full customer activity log — the "see everything" screen behind the Activity
// card on the 360. Follows the shape common to CRM/product-analytics activity
// views (Intercom / Segment / Stripe): reverse-chronological, grouped by day,
// filterable by channel, searchable, paginated, with each event expandable for
// its full detail (exact time, stage, screen, metadata).
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, SearchBox, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { ChannelBadge, stageLabel } from '@/components/journey';
import { humanStatus, dayLabel, timeStr, timeAgo, dateStr } from '@/lib/format';

interface Ev {
  id: string; channel: string; name: string; stage?: string | null; stageLabel?: string | null;
  screen?: string | null; metadata?: Record<string, unknown> | null; occurredAt: string;
}

export default function CustomerActivity() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [channel, setChannel] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), pageSize: '100', ...(channel ? { channel } : {}), ...(search ? { search } : {}) });
  const { data, isLoading } = useSWR(`/api/admin/customers/${id}/timeline?${qs}`, swrFetcher);
  const { data: cust } = useSWR(`/api/admin/customers/${id}`, swrFetcher);

  const payload = data?.data as { events?: Ev[]; channels?: { channel: string; count: number }[] } | undefined;
  const events = payload?.events ?? [];
  const channels = payload?.channels ?? [];
  const pg = data?.pagination;
  const who = (cust?.data as { customer?: { name?: string; phone?: string } })?.customer;

  const chips = [{ key: '', label: 'All' }, ...channels.map((c) => ({ key: c.channel, label: `${humanStatus(c.channel)} (${c.count})` }))];

  // Group the current page under day headers (events are newest-first).
  const groups: { day: string; items: Ev[] }[] = [];
  for (const e of events) {
    const day = dayLabel(e.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.push(`/customers/${id}`)}>← Back to customer</button>
      <h1 className="page-title">Activity{who?.name ? ` — ${who.name}` : who?.phone ? ` — ${who.phone}` : ''}</h1>
      <p className="page-sub">Every tracked touchpoint, newest first. Filter by channel or search by event / screen.</p>

      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <FilterChips options={chips} value={channel} onChange={(v) => { setChannel(v); setPage(1); }} />
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search event or screen…" />
        </div>

        {isLoading ? <TableSkeleton rows={10} /> : events.length === 0 ? <Empty label="No activity matches" /> : (
          <div style={{ display: 'grid', gap: 2 }}>
            {groups.map((g) => (
              <div key={g.day}>
                <div style={{ position: 'sticky', top: 0, background: 'var(--card, #fff)', padding: '8px 4px 4px', fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-faint)' }}>{g.day}</div>
                {g.items.map((e) => {
                  const isOpen = open === e.id;
                  const meta = e.metadata && Object.keys(e.metadata).length ? e.metadata : null;
                  return (
                    <div key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <button type="button" onClick={() => setOpen(isOpen ? null : e.id)} className="row" style={{ width: '100%', gap: 10, padding: '9px 4px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', alignItems: 'center' }}>
                        <ChannelBadge channel={e.channel} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{humanStatus(e.name)}</span>
                        {e.stage && <span className="badge tone-grey">{e.stageLabel || stageLabel(e.stage)}</span>}
                        {e.screen && <span className="muted" style={{ fontSize: 12 }}>· {e.screen}</span>}
                        <span className="spacer" />
                        <span className="muted" style={{ fontSize: 11.5 }} title={timeAgo(e.occurredAt)}>{timeStr(e.occurredAt)}</span>
                        <span className="muted" style={{ fontSize: 11, width: 12, textAlign: 'center' }}>{isOpen ? '▾' : '▸'}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '4px 4px 12px 30px', display: 'grid', gap: 5, fontSize: 12 }}>
                          <div className="row" style={{ gap: 8 }}><span className="muted" style={{ minWidth: 64 }}>When</span><span>{dayLabel(e.occurredAt)}, {timeStr(e.occurredAt)} · {dateStr(e.occurredAt)}</span></div>
                          <div className="row" style={{ gap: 8 }}><span className="muted" style={{ minWidth: 64 }}>Channel</span><ChannelBadge channel={e.channel} /></div>
                          {e.stage && <div className="row" style={{ gap: 8 }}><span className="muted" style={{ minWidth: 64 }}>Stage</span><span>{e.stageLabel || stageLabel(e.stage)}</span></div>}
                          {e.screen && <div className="row" style={{ gap: 8 }}><span className="muted" style={{ minWidth: 64 }}>Screen</span><span className="mono">{e.screen}</span></div>}
                          {meta && (
                            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                              <span className="muted" style={{ minWidth: 64 }}>Details</span>
                              <pre className="mono" style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(meta, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
