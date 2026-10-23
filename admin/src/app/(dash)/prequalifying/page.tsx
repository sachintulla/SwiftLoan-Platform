'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, TableSkeleton, Empty } from '@/components/ui';
import { inr } from '@/lib/format';
import type { PrequalifyingOffer } from '@/components/PrequalifyingOfferForm';

function expiryLabel(o: PrequalifyingOffer) {
  if (!o.validTill) return '—';
  const d = new Date(o.validTill);
  const lapsed = d.getTime() < Date.now();
  return <span className={lapsed ? 'badge tone-red' : 'muted'}>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}{lapsed ? ' · lapsed' : ''}</span>;
}

export default function PrequalifyingOffersPage() {
  const { data, isLoading, mutate } = useSWR<{ data: PrequalifyingOffer[] }>('/api/admin/prequalifying-offers', swrFetcher);
  const offers = data?.data ?? [];

  async function toggleActive(o: PrequalifyingOffer) {
    await apiFetch(`/api/admin/prequalifying-offers/${o.id}`, { method: 'PUT', body: JSON.stringify({ active: !o.active }) });
    mutate();
  }

  return (
    <div className="page">
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Pre-Qualifying Offers</h1>
          <p className="page-sub">Firm &quot;pre-approved for you&quot; offers shown at the top of the app&apos;s home screen the moment a user logs in — no application required. Accepting one skips the eligibility check and hands off to the lender.</p>
        </div>
        <Link href="/prequalifying/new" className="btn btn-primary">+ New offer</Link>
      </div>

      <Card className="mt-16">
        {isLoading ? <TableSkeleton /> : offers.length === 0 ? <Empty label="No pre-qualifying offers yet — add your first one." /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Order</th><th>Lender</th><th>Badge</th><th>Amount</th><th>Rate</th><th>Tenure</th><th>Valid till</th><th>Active</th><th /></tr></thead>
            <tbody>{offers.map((o) => (
              <tr key={o.id}>
                <td className="mono muted">{o.displayOrder}</td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    {o.logoUrl ? <img src={o.logoUrl} alt="" width={20} height={20} style={{ borderRadius: 5, objectFit: 'contain' }} /> : null}
                    {o.lenderName}
                  </div>
                </td>
                <td>{o.badge ? <span className="badge tone-teal">{o.badge}</span> : '—'}</td>
                <td>{inr(o.amount)}</td>
                <td>{o.rate}% p.a.</td>
                <td>{o.tenureMonths} mo</td>
                <td>{expiryLabel(o)}</td>
                <td>
                  <label className="row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={o.active} onChange={() => toggleActive(o)} />
                  </label>
                </td>
                <td><Link href={`/prequalifying/${o.id}`} className="btn">Edit</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
