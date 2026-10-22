'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, SearchBox, StatusBadge, FilterChips, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { inr, dateTimeStr, humanStatus } from '@/lib/format';
import { STAGES, stageLabel } from '@/components/journey';

interface U {
  id: string; fullName?: string; phone?: string; email?: string; pincode?: string;
  creditScore: number; employment?: string; monthlyIncome?: number; createdAt: string;
  stage?: string | null; _count?: { applications: number; loans: number };
}

const STAGE_OPTIONS = [{ key: '', label: 'All stages' }, ...STAGES.map((s) => ({ key: s.key, label: s.label }))];

export default function UsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search) p.set('search', search);
    if (stage) p.set('stage', stage);
    return p.toString();
  }, [page, search, stage]);

  const { data, isLoading } = useSWR(`/api/admin/users?${qs}`, swrFetcher);
  const rows = (data?.data ?? []) as U[];
  const pg = data?.pagination;

  return (
    <div className="page">
      <h1 className="page-title">All Users</h1>
      <p className="page-sub">Registered borrowers with application and loan counts — filter by current journey stage.</p>
      <Card>
        <div className="row between wrap" style={{ marginBottom: 12, gap: 12 }}>
          <span className="muted" style={{ fontSize: 13 }}>{pg ? `${pg.total} users` : ''}</span>
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone, email…" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <FilterChips options={STAGE_OPTIONS} value={stage} onChange={(v) => { setStage(v); setPage(1); }} />
        </div>
        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty label={stage ? `No users in “${stageLabel(stage)}”` : 'No users'} /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Name</th><th>Current stage</th><th>Phone</th><th>Credit</th><th>Employment</th><th>Income</th><th>Apps</th><th>Loans</th><th>Joined</th></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.id} onClick={() => router.push(`/users/${u.id}`)}>
                <td>{u.fullName || '—'}<div className="muted" style={{ fontSize: 11 }}>{u.email}</div></td>
                <td>{u.stage ? <StatusBadge status={u.stage} label={stageLabel(u.stage)} /> : <span className="muted">—</span>}</td>
                <td className="mono">{u.phone}</td>
                <td className="mono">{u.creditScore}</td>
                <td>{u.employment ? humanStatus(u.employment) : '—'}</td>
                <td className="mono">{u.monthlyIncome ? inr(u.monthlyIncome) : '—'}</td>
                <td className="mono">{u._count?.applications ?? 0}</td>
                <td className="mono">{u._count?.loans ?? 0}</td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateTimeStr(u.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
