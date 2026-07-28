'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { inr, dateStr } from '@/lib/format';

const STATUS_FILTERS = [
  { key: '', label: 'All' }, { key: 'draft', label: 'Draft' }, { key: 'offers_ready', label: 'Offers' },
  { key: 'under_review', label: 'In Review' }, { key: 'approved', label: 'Approved' },
  { key: 'disbursed', label: 'Disbursed' }, { key: 'rejected', label: 'Rejected' },
] as const;

interface Row { id: string; ref: string; amount: number; loanType: string; status: string; createdAt: string; user?: { fullName?: string; phone?: string }; loan?: { id: string } | null; _count?: { offers: number } }

export default function LoansPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}), ...(search ? { search } : {}) });
  const { data, isLoading } = useSWR(`/api/admin/loans?${qs.toString()}`, swrFetcher);
  const rows = (data?.data ?? []) as Row[];
  const pg = data?.pagination;

  return (
    <div className="page">
      <h1 className="page-title">Loan Pipeline</h1>
      <p className="page-sub">Every loan application with its current stage. Click a row for the full journey.</p>

      <Card className="" >
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <FilterChips options={STATUS_FILTERS as unknown as { key: string; label: string }[]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search ref, name, phone…" />
        </div>

        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty label="No applications match" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Ref</th><th>Applicant</th><th>Type</th><th>Amount</th><th>Offers</th><th>Status</th><th>Applied</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/loans/${r.id}`)}>
                    <td className="mono">{r.ref}</td>
                    <td>{r.user?.fullName || '—'}<div className="muted" style={{ fontSize: 11.5 }}>{r.user?.phone}</div></td>
                    <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.loanType}</td>
                    <td className="mono">{inr(r.amount)}</td>
                    <td className="mono">{r._count?.offers ?? 0}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="muted">{dateStr(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
