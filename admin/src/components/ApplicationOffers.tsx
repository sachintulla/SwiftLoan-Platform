'use client';
// "Offers" tab body for a customer: every offer the lender returned, grouped by
// the application it was fetched for (the same data as the loan page's Offers
// card, but across all of the customer's applications).
import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, StatusBadge, LoanStatusBadge } from '@/components/ui';
import type { LenderOffer } from '@/components/journey';
import { inrRupees, dateTimeStr } from '@/lib/format';

export interface OfferApplication {
  id: string; ref: string; amount: number; tenureMonths?: number | null; status: string;
  createdAt?: string; offers?: LenderOffer[];
}

const money = (n?: number | null) => (n ? inrRupees(n) : '—');

function LenderCell({ o }: { o: LenderOffer }) {
  const name = o.lenderName ?? o.partner?.name ?? 'Lender';
  const logo = o.lenderLogoUrl ?? o.partner?.logoUrl ?? null;
  return (
    <div className="row" style={{ gap: 10 }}>
      {logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logo} alt="" width={28} height={28} style={{ borderRadius: 6, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)' }} />
        : <span style={{ width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: 'var(--teal-bg)', color: 'var(--teal)' }}>{name.charAt(0)}</span>}
      <span style={{ fontWeight: 500 }}>{name}</span>
    </div>
  );
}

export function ApplicationOffers({ applications }: { applications: OfferApplication[] }) {
  const router = useRouter();
  const withOffers = applications.filter((a) => (a.offers ?? []).length > 0);
  if (withOffers.length === 0) return <Card title="Offers"><div className="empty">No offers received yet</div></Card>;

  return (
    <div className="stack">
      {withOffers.map((a) => {
        const offers = a.offers ?? [];
        return (
          <Card
            key={a.id}
            title={`Offers · ${a.ref}`}
            sub={`${offers.length} offer${offers.length === 1 ? '' : 's'} · requested ${inrRupees(a.amount)}${a.tenureMonths ? ` for ${a.tenureMonths} mo` : ''}${a.createdAt ? ` · ${dateTimeStr(a.createdAt)}` : ''}`}
            right={<button className="btn" onClick={() => router.push(`/loans/${a.id}`)}>Open application →</button>}
          >
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Lender</th><th>Offered amount</th><th>APR</th><th>Tenure</th><th>EMI</th><th>Fee</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id}>
                      <td><LenderCell o={o} /></td>
                      <td className="mono">{money(o.amount)}</td>
                      <td className="mono">{o.apr ? `${o.apr}%` : '—'}</td>
                      <td className="mono">{o.tenureMonths ? `${o.tenureMonths} mo` : '—'}</td>
                      <td className="mono">{money(o.emi)}</td>
                      <td className="mono">{money(o.processingFee)}</td>
                      <td>{o.applied ? <LoanStatusBadge status={o.lenderStatus ?? 'handoff'} /> : <span className="muted" style={{ fontSize: 12 }}>not applied</span>}</td>
                      <td>{o.selected ? <StatusBadge status="approved" label="Selected" /> : o.recommended ? <StatusBadge status="qualified" label="Recommended" /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
