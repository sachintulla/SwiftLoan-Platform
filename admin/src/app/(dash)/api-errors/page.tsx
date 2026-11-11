'use client';
import { Fragment, useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatusBadge, FilterChips, Select, Pagination, TableSkeleton, Empty, Callout } from '@/components/ui';
import { num, dateTimeStr, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

type StatusClass = '4xx' | '5xx' | 'errored' | 'ok';

interface Row {
  id: string; createdAt: string; direction: 'inbound' | 'outbound'; source: string; target: string;
  method: string; url: string; status: number | null; durationMs: number | null;
  requestBody: string | null; responseBody: string | null; error: string | null; meta: unknown;
  statusClass: StatusClass;
}
interface Facets {
  total: number;
  byTarget: { target: string; count: number }[];
  byDirection: { direction: string; count: number }[];
  byClass: { statusClass: Exclude<StatusClass, 'ok'>; count: number }[];
}
interface Payload { rows: Row[]; facets: Facets }

const PAGE_SIZE = 25;

const CLASS_TONE: Record<StatusClass, string> = { '5xx': 'failed', '4xx': 'pending', errored: 'failed', ok: 'anonymous' };
const CLASS_LABEL: Record<StatusClass, string> = { '5xx': '5xx server', '4xx': '4xx client', errored: 'No response', ok: 'OK' };

const DIRECTION_OPTS = [
  { key: '', label: 'All traffic' },
  { key: 'inbound', label: 'Inbound (app/webhooks → API)' },
  { key: 'outbound', label: 'Outbound (API → lenders)' },
];
const CLASS_OPTS = [
  { value: '', label: 'Any error' },
  { value: '5xx', label: '5xx server errors' },
  { value: '4xx', label: '4xx client errors' },
  { value: 'errored', label: 'No response (network)' },
];

export default function ApiErrorsPage() {
  const [direction, setDirection] = useState('');
  const [target, setTarget] = useState('');
  const [statusClass, setStatusClass] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const q = useDebounced(search.trim(), 300);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (direction) p.set('direction', direction);
    if (target) p.set('target', target);
    if (statusClass) p.set('statusClass', statusClass);
    if (q) p.set('q', q);
    return p.toString();
  }, [direction, target, statusClass, q, page]);

  const { data, error, isLoading, mutate } = useSWR(`/api/admin/api-errors?${qs}`, swrFetcher, { refreshInterval: 30_000, keepPreviousData: true });
  const p = data?.data as Payload | undefined;
  const pg = data?.pagination;
  const f = p?.facets;
  const rows = p?.rows ?? [];

  const cls = (c: StatusClass) => f?.byClass.find((x) => x.statusClass === c)?.count ?? 0;
  const setFilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const active = Boolean(direction || target || statusClass || search.trim());
  const clear = () => { setDirection(''); setTarget(''); setStatusClass(''); setSearch(''); setPage(1); };

  return (
    <div className="page">
      <h1 className="page-title">API &amp; Webhook Errors</h1>
      <p className="page-sub">Every failed request in the last 24 hours — inbound webhooks (Aurix, Yubi, app) and outbound lender calls — with the exact payloads sent and received. Bodies are redacted for PAN, OTP and other sensitive values.</p>

      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <Tile label="Errors (24 h)" value={f?.total} tone="red" />
        <Tile label="5xx server" value={cls('5xx')} tone="red" />
        <Tile label="4xx client" value={cls('4xx')} tone="amber" />
        <Tile label="No response" value={cls('errored')} tone="red" />
      </div>

      <Card>
        <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ flex: '1 1 220px' }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Search URL</div>
            <input type="search" className="input" value={search} placeholder="e.g. /webhooks/aurix, eligible_offers" onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </label>
          <label style={{ flex: '0 1 180px' }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Partner / target</div>
            <Select value={target} onChange={setFilter(setTarget)} options={[{ value: '', label: 'All targets' }, ...(f?.byTarget ?? []).map((t) => ({ value: t.target, label: `${t.target} (${t.count})` }))]} />
          </label>
          <label style={{ flex: '0 1 200px' }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Error type</div>
            <Select value={statusClass} onChange={setFilter(setStatusClass)} options={CLASS_OPTS} />
          </label>
          {active && <button type="button" className="btn" onClick={clear}>Clear</button>}
        </div>
        <FilterChips options={DIRECTION_OPTS} value={direction} onChange={setFilter(setDirection)} />

        <div style={{ marginTop: 14 }}>
          {error ? (
            <Callout tone="red">Could not load API errors. <button className="adm-link-btn" onClick={() => mutate()}>Retry</button></Callout>
          ) : isLoading && !p ? (
            <div aria-busy="true"><TableSkeleton rows={8} cols={7} /></div>
          ) : rows.length === 0 ? (
            <Empty label={active ? 'No errors match these filters.' : 'No API or webhook errors in the last 24 hours. 🎉'} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Time</th><th>Direction</th><th>Route</th><th>Method</th><th>URL</th><th>Status</th><th>ms</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = open === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr onClick={() => setOpen(isOpen ? null : r.id)} style={{ cursor: 'pointer' }}>
                          <td className="mono muted" style={{ whiteSpace: 'nowrap' }} title={dateTimeStr(r.createdAt)}>{timeAgo(r.createdAt)}</td>
                          <td><span className="muted" style={{ fontSize: 12 }}>{r.direction === 'inbound' ? '↓ inbound' : '↑ outbound'}</span></td>
                          <td style={{ fontSize: 12.5 }}>{r.source} → <b>{r.target}</b></td>
                          <td className="mono">{r.method}</td>
                          <td className="mono" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.url}>{r.url}</td>
                          <td><StatusBadge status={CLASS_TONE[r.statusClass]} label={r.status != null ? String(r.status) : CLASS_LABEL[r.statusClass]} /></td>
                          <td className="mono muted">{r.durationMs ?? '—'}</td>
                        </tr>
                        {isOpen && (
                          <tr className="adm-inst-detail">
                            <td colSpan={7}>
                              <div style={{ display: 'grid', gap: 10, padding: '4px 2px' }}>
                                {r.error && <Field label="Error" mono>{r.error}</Field>}
                                <Field label="Request payload">{r.requestBody}</Field>
                                <Field label="Response payload">{r.responseBody}</Field>
                                {r.meta != null && <Field label="Meta">{JSON.stringify(r.meta, null, 2)}</Field>}
                                <div className="muted" style={{ fontSize: 11 }}>{dateTimeStr(r.createdAt)} · {r.direction} · {r.source} → {r.target}</div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pg && rows.length > 0 && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | undefined; tone: 'amber' | 'blue' | 'green' | 'red' | 'teal' }) {
  return (
    <div className="card card-pad" style={{ minWidth: 120, flex: '1 1 120px', padding: '12px 16px' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2, color: `var(--${tone})` }}>{value == null ? '—' : num(value)}</div>
    </div>
  );
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  const empty = children == null || children === '';
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>{label}</div>
      {empty ? (
        <span className="muted" style={{ fontSize: 12 }}>Not recorded</span>
      ) : (
        <pre className={mono ? 'mono' : undefined} style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2, rgba(127,127,127,.08))', border: '1px solid var(--border)', borderRadius: 8, padding: 10, maxHeight: 280, overflow: 'auto', fontSize: 12 }}>{children}</pre>
      )}
    </div>
  );
}
