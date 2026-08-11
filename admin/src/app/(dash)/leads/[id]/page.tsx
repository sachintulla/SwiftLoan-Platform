'use client';
// A lead page is now a customer page. Look the lead up, find the Customer row it
// resolved to (matched on phone by the API) and hand over. A lead with no phone
// has no customer to hand over to, which is a real state — say so rather than
// bouncing the operator somewhere unrelated.
import React, { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Card, TableSkeleton } from '@/components/ui';

export default function LeadRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/leads/${id}`, swrFetcher);
  const payload = (data?.data ?? {}) as { customerId?: string | null; lead?: { name?: string | null; phone?: string | null } };
  const customerId = payload.customerId ?? null;

  useEffect(() => {
    if (customerId) router.replace(`/customers/${customerId}`);
  }, [customerId, router]);

  if (isLoading) return <div className="page"><TableSkeleton rows={6} /></div>;

  if (error) {
    return (
      <div className="page"><Card>
        <div className="empty">
          Could not load this lead — {(error as Error).message}
          <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button className="btn" onClick={() => mutate()}>Retry</button>
            <Link className="btn" href="/customers">Go to customers</Link>
          </div>
        </div>
      </Card></div>
    );
  }

  if (!customerId) {
    return (
      <div className="page"><Card title="No customer record for this lead">
        <div className="empty">
          This lead {payload.lead?.phone ? '' : 'has no phone number, so it '}has never been resolved to a customer,
          so there is no journey to show.
          <div style={{ marginTop: 12 }}><Link className="btn" href="/customers">Go to customers</Link></div>
        </div>
      </Card></div>
    );
  }

  return <div className="page"><Card><div className="empty">Opening the customer journey…</div></Card></div>;
}
