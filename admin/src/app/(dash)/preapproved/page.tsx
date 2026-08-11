'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, TableSkeleton, Empty } from '@/components/ui';
import { inr } from '@/lib/format';
import type { PreApprovedPlan } from '@/components/PreApprovedPlanForm';

function amountLabel(p: PreApprovedPlan) {
  return p.amountAtApproval ? 'Amount at approval' : p.maxAmount != null ? `Up to ${inr(p.maxAmount)}` : '—';
}
function rateLabel(p: PreApprovedPlan) {
  return p.rateAtApproval ? 'Rate at approval' : p.rateMin != null && p.rateMax != null ? `${p.rateMin}–${p.rateMax}% p.a.` : '—';
}
function tenureLabel(p: PreApprovedPlan) {
  return p.tenureMinMonths != null && p.tenureMaxMonths != null ? `${p.tenureMinMonths}–${p.tenureMaxMonths} mo` : '—';
}

export default function PreApprovedPlansPage() {
  const { data, isLoading, mutate } = useSWR<{ data: PreApprovedPlan[] }>('/api/admin/preapproved-plans', swrFetcher);
  const plans = data?.data ?? [];

  async function toggleActive(p: PreApprovedPlan) {
    await apiFetch(`/api/admin/preapproved-plans/${p.id}`, { method: 'PUT', body: JSON.stringify({ active: !p.active }) });
    mutate();
  }

  return (
    <div className="page">
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Pre-Approved Plans</h1>
          <p className="page-sub">Admin-curated lender plans shown on the app&apos;s &quot;Explore your loan options&quot; screen — no application or PAN required to see these.</p>
        </div>
        <Link href="/preapproved/new" className="btn btn-primary">+ New plan</Link>
      </div>

      <Card className="mt-16">
        {isLoading ? <TableSkeleton /> : plans.length === 0 ? <Empty label="No pre-approved plans yet — add your first one." /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Order</th><th>Lender</th><th>Badge</th><th>Amount</th><th>Rate</th><th>Tenure</th><th>Active</th><th /></tr></thead>
            <tbody>{plans.map((p) => (
              <tr key={p.id}>
                <td className="mono muted">{p.displayOrder}</td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    {p.logoUrl ? <img src={p.logoUrl} alt="" width={20} height={20} style={{ borderRadius: 5, objectFit: 'contain' }} /> : null}
                    {p.lenderName}
                  </div>
                </td>
                <td>{p.badge ? <span className="badge tone-teal">{p.badge}</span> : '—'}</td>
                <td>{amountLabel(p)}</td>
                <td>{rateLabel(p)}</td>
                <td>{tenureLabel(p)}</td>
                <td>
                  <label className="row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={p.active} onChange={() => toggleActive(p)} />
                  </label>
                </td>
                <td><Link href={`/preapproved/${p.id}`} className="btn">Edit</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
