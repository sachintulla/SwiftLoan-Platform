'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { inr, dateStr, humanStatus } from '@/lib/format';

const FILTERS = [
  { key: '', label: 'All' }, { key: 'new', label: 'New' }, { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' }, { key: 'converted', label: 'Converted' }, { key: 'lost', label: 'Lost' },
];

interface Lead { id: string; name?: string; phone?: string; city?: string; productInterest?: string; amount?: number; source: string; campaignId?: string; status: string; createdAt: string }

export default function LeadsPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}), ...(search ? { search } : {}) });
  const { data, isLoading, mutate } = useSWR(`/api/admin/leads?${qs.toString()}`, swrFetcher);
  const rows = (data?.data ?? []) as Lead[];
  const pg = data?.pagination;

  async function setLeadStatus(id: string, s: string) {
    await apiFetch(`/api/admin/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) });
    mutate();
  }

  return (
    <div className="page">
      <h1 className="page-title">Leads & Contact</h1>
      <p className="page-sub">Anonymous leads captured by the widget and app, with source attribution.</p>

      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <FilterChips options={FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone, city…" />
        </div>
        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty label="No leads match" /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Interest</th><th>Amount</th><th>Source</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>{rows.map((l) => (
              <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                <td>{l.name || <span className="muted">Anonymous</span>}</td>
                <td className="mono">{l.phone || '—'}</td>
                <td>{l.city || '—'}</td>
                <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{l.productInterest || '—'}</td>
                <td className="mono">{l.amount ? inr(l.amount) : '—'}</td>
                <td><span className="badge tone-grey">{l.source}{l.campaignId ? ` · ${l.campaignId}` : ''}</span></td>
                {/* stop row navigation when using the inline status control */}
                <td onClick={(e) => e.stopPropagation()}>
                  <select className="input" style={{ padding: '4px 8px', width: 'auto', fontSize: 12 }} value={l.status} onChange={(e) => setLeadStatus(l.id, e.target.value)}>
                    {['new', 'contacted', 'qualified', 'converted', 'lost'].map((s) => <option key={s} value={s}>{humanStatus(s)}</option>)}
                  </select>
                </td>
                <td className="muted">{dateStr(l.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
