'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, StatusBadge, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { humanStatus, timeAgo, num } from '@/lib/format';

interface Row { id: string; userId?: string; stepNumber: number; stepName: string; status: string; timeSpentSec: number; updatedAt: string }
interface ByStep { stepName: string; status: string; _count: { _all: number } }

export default function OnboardingPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR(`/api/admin/onboarding?page=${page}&pageSize=20`, swrFetcher);
  const payload = data?.data as { rows: Row[]; byStep: ByStep[] } | undefined;
  const rows = payload?.rows ?? [];
  const pg = data?.pagination;

  // aggregate completion per step
  const steps = ['language', 'mobile', 'otp', 'permissions', 'aboutyou', 'home'];
  const stepStats = steps.map((name) => {
    const all = (payload?.byStep ?? []).filter((b) => b.stepName === name);
    const total = all.reduce((s, b) => s + b._count._all, 0);
    const completed = all.filter((b) => b.status === 'completed').reduce((s, b) => s + b._count._all, 0);
    return { name, total, completed, pct: total ? Math.round((completed / total) * 100) : 0 };
  });

  return (
    <div className="page">
      <h1 className="page-title">Onboarding Journeys</h1>
      <p className="page-sub">Where users drop off between install and their first home screen.</p>

      <Card title="Step completion" className="" >
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          {stepStats.map((s) => (
            <div key={s.name} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div className="muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>{s.name}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{s.pct}%</div>
              <div className="muted" style={{ fontSize: 11 }}>{num(s.completed)}/{num(s.total)} completed</div>
              <div className="funnel-bar-track" style={{ height: 6, marginTop: 6 }}><div className="funnel-bar" style={{ height: 6, width: `${s.pct}%` }} /></div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Recent onboarding steps">
        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Step</th><th>#</th><th>Status</th><th>Time spent</th><th>When</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} onClick={() => r.userId && router.push(`/onboarding/${r.userId}`)}>
                <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{r.stepName}</td>
                <td className="mono">{r.stepNumber}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className="mono">{r.timeSpentSec}s</td>
                <td className="muted">{timeAgo(r.updatedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
