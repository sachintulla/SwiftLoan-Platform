'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, SearchBox, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { inr, dateStr, humanStatus } from '@/lib/format';

interface U { id: string; fullName?: string; phone?: string; email?: string; pincode?: string; creditScore: number; employment?: string; monthlyIncome?: number; createdAt: string; _count?: { applications: number; loans: number } }

export default function UsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(search ? { search } : {}) });
  const { data, isLoading } = useSWR(`/api/admin/users?${qs.toString()}`, swrFetcher);
  const rows = (data?.data ?? []) as U[];
  const pg = data?.pagination;

  return (
    <div className="page">
      <h1 className="page-title">All Users</h1>
      <p className="page-sub">Registered borrowers with application and loan counts.</p>
      <Card>
        <div className="row between wrap" style={{ marginBottom: 14 }}>
          <span className="muted" style={{ fontSize: 13 }}>{pg ? `${pg.total} users` : ''}</span>
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone, email…" />
        </div>
        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Name</th><th>Phone</th><th>Credit</th><th>Employment</th><th>Income</th><th>Apps</th><th>Loans</th><th>Joined</th></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.id} onClick={() => router.push(`/users/${u.id}`)}>
                <td>{u.fullName || '—'}<div className="muted" style={{ fontSize: 11 }}>{u.email}</div></td>
                <td className="mono">{u.phone}</td>
                <td className="mono">{u.creditScore}</td>
                <td>{u.employment ? humanStatus(u.employment) : '—'}</td>
                <td className="mono">{u.monthlyIncome ? inr(u.monthlyIncome) : '—'}</td>
                <td className="mono">{u._count?.applications ?? 0}</td>
                <td className="mono">{u._count?.loans ?? 0}</td>
                <td className="muted">{dateStr(u.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
