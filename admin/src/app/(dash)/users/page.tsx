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

type Period = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Date range' },
];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Ranges are computed in the viewer's own timezone and sent as ISO instants.
function computeRange(period: Period, cFrom: string, cTo: string): { from?: string; to?: string } {
  const now = new Date();
  if (period === 'all') return {};
  if (period === 'today') return { from: startOfDay(now).toISOString(), to: now.toISOString() };
  if (period === 'yesterday') {
    const s = startOfDay(now); const y = new Date(s); y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: s.toISOString() };
  }
  if (period === '7d') { const f = new Date(now); f.setDate(f.getDate() - 7); return { from: f.toISOString(), to: now.toISOString() }; }
  if (period === '30d') { const f = new Date(now); f.setDate(f.getDate() - 30); return { from: f.toISOString(), to: now.toISOString() }; }
  const out: { from?: string; to?: string } = {};
  if (cFrom) out.from = new Date(`${cFrom}T00:00:00`).toISOString();
  if (cTo) out.to = new Date(`${cTo}T23:59:59.999`).toISOString();
  return out;
}

export default function UsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [page, setPage] = useState(1);

  const range = useMemo(() => computeRange(period, cFrom, cTo), [period, cFrom, cTo]);
  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search) p.set('search', search);
    if (stage) p.set('stage', stage);
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    return p.toString();
  }, [page, search, stage, range]);

  const { data, isLoading } = useSWR(`/api/admin/users?${qs}`, swrFetcher);
  const rows = (data?.data ?? []) as U[];
  const pg = data?.pagination;
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div className="page">
      <h1 className="page-title">All Users</h1>
      <p className="page-sub">Registered borrowers — search, and filter by current journey stage and joined date.</p>
      <Card>
        <div className="row between wrap" style={{ marginBottom: 12, gap: 12 }}>
          <span className="muted" style={{ fontSize: 13 }}>{pg ? `${pg.total} users` : ''}</span>
          <SearchBox value={search} onChange={(v) => reset(() => setSearch(v))} placeholder="Search name, phone, email…" />
        </div>

        <div style={{ marginBottom: 10 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Joined</div>
          <FilterChips options={PERIODS} value={period} onChange={(v) => reset(() => setPeriod(v))} />
          {period === 'custom' && (
            <div className="row wrap" style={{ gap: 12, marginTop: 10, alignItems: 'center' }}>
              <label className="muted" style={{ fontSize: 13 }}>From&nbsp;
                <input type="date" value={cFrom} max={cTo || undefined} onChange={(e) => reset(() => setCFrom(e.target.value))} className="input" />
              </label>
              <label className="muted" style={{ fontSize: 13 }}>To&nbsp;
                <input type="date" value={cTo} min={cFrom || undefined} onChange={(e) => reset(() => setCTo(e.target.value))} className="input" />
              </label>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Current stage</div>
          <FilterChips options={STAGE_OPTIONS} value={stage} onChange={(v) => reset(() => setStage(v))} />
        </div>

        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty label="No users match these filters" /> : (
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
